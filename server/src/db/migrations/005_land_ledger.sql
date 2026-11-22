-- Module 1 upgrade: Land Purchase Management and individual land ledgers.
-- ADDITIVE ONLY: no existing row is deleted and no existing amount is changed.
--   * existing lands keep their exact purchase price (rate per Marla is derived from it)
--   * payments to sellers that were entered as "Land Purchase" expenses stay where they are and
--     are shown in each land's ledger as "recorded before upgrade"

-- ------------------------------------------------------------------ 1. land purchase details
ALTER TABLE lands
  ADD COLUMN land_code           TEXT,
  ADD COLUMN rate_per_marla      NUMERIC(16,2) CHECK (rate_per_marla IS NULL OR rate_per_marla >= 0),
  ADD COLUMN price_is_manual     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN price_adjust_reason TEXT,
  ADD COLUMN purchased_by        TEXT,
  ADD COLUMN agreement_details   TEXT,
  ADD COLUMN registry_details    TEXT;

UPDATE lands SET
  land_code = 'FH-L-' || lpad(id::text, 5, '0'),
  rate_per_marla = CASE WHEN total_marla > 0 THEN round(purchase_price / total_marla, 2) ELSE 0 END,
  price_is_manual = (purchase_price > 0),
  price_adjust_reason = CASE WHEN purchase_price > 0 THEN 'Purchase price entered before the land ledger upgrade' END;

ALTER TABLE lands ALTER COLUMN land_code SET NOT NULL;
CREATE UNIQUE INDEX lands_code_uq ON lands (land_code);

INSERT INTO counters (name, prefix, pad, next_value) VALUES
  ('land',         'FH-L-',   5, (SELECT COALESCE(MAX(id), 0) + 1 FROM lands)),
  ('land_payment', 'FH-LP-',  5, 1),
  ('investment',   'FH-INV-', 5, 1);

-- Every change of a land's total purchase price (manual or recalculated) is kept here.
CREATE TABLE land_price_adjustments (
  id           SERIAL PRIMARY KEY,
  land_id      INT NOT NULL REFERENCES lands(id),
  old_price    NUMERIC(16,2) NOT NULL,
  new_price    NUMERIC(16,2) NOT NULL,
  auto_price   NUMERIC(16,2),
  change_type  TEXT NOT NULL CHECK (change_type IN ('MANUAL','RECALCULATED')),
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   INT REFERENCES users(id)
);
CREATE INDEX land_price_adjustments_land_idx ON land_price_adjustments (land_id);

-- ------------------------------------------------------------------ 2. payments to land owners
CREATE TABLE land_payments (
  id                  SERIAL PRIMARY KEY,
  payment_no          TEXT NOT NULL UNIQUE,
  land_id             INT NOT NULL REFERENCES lands(id),
  payment_date        DATE NOT NULL,
  amount              NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  -- PAYMENT reduces the amount payable; ADDITIONAL is an authorised payment beyond the agreed price
  kind                TEXT NOT NULL DEFAULT 'PAYMENT' CHECK (kind IN ('PAYMENT','ADDITIONAL')),
  method              TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','OTHER')),
  reference_no        TEXT,
  description         TEXT,
  paid_to             TEXT,
  authorization_note  TEXT,
  status              TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','REVERSED')),
  reversed_at         TIMESTAMPTZ,
  reversed_by         INT REFERENCES users(id),
  reversal_reason     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          INT REFERENCES users(id),
  CHECK (kind = 'PAYMENT' OR authorization_note IS NOT NULL)
);
CREATE INDEX land_payments_land_idx ON land_payments (land_id, payment_date);

-- ------------------------------------------------------------------ 3. personal investment (capital contributions)
CREATE TABLE capital_contributions (
  id                     SERIAL PRIMARY KEY,
  contribution_no        TEXT NOT NULL UNIQUE,
  investor_name          TEXT NOT NULL,
  contribution_date      DATE NOT NULL,
  amount                 NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method                 TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','OTHER')),
  reference_no           TEXT,
  notes                  TEXT,
  source_land_payment_id INT REFERENCES land_payments(id),   -- made together with this land payment
  source_expense_id      INT REFERENCES expenses(id),        -- made together with this land expense
  status                 TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','REVERSED')),
  reversed_at            TIMESTAMPTZ,
  reversed_by            INT REFERENCES users(id),
  reversal_reason        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             INT REFERENCES users(id)
);

-- ------------------------------------------------------------------ 4. funding of land payments / land expenses
CREATE TABLE fund_allocations (
  id               SERIAL PRIMARY KEY,
  land_id          INT NOT NULL REFERENCES lands(id),
  use_type         TEXT NOT NULL CHECK (use_type IN ('LAND_PAYMENT','LAND_EXPENSE')),
  land_payment_id  INT REFERENCES land_payments(id),
  expense_id       INT REFERENCES expenses(id),
  source_type      TEXT NOT NULL CHECK (source_type IN ('PERSONAL','CUSTOMER')),
  capital_id       INT REFERENCES capital_contributions(id),
  payment_id       INT REFERENCES payments(id),             -- the original customer receipt
  amount           NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVERSED')),
  reversed_at      TIMESTAMPTZ,
  reversed_by      INT REFERENCES users(id),
  reversal_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       INT REFERENCES users(id),
  CHECK ((use_type = 'LAND_PAYMENT') = (land_payment_id IS NOT NULL)),
  CHECK ((use_type = 'LAND_EXPENSE') = (expense_id IS NOT NULL)),
  CHECK ((source_type = 'PERSONAL') = (capital_id IS NOT NULL)),
  CHECK ((source_type = 'CUSTOMER') = (payment_id IS NOT NULL))
);
CREATE INDEX fund_allocations_land_idx ON fund_allocations (land_id);
CREATE INDEX fund_allocations_capital_idx ON fund_allocations (capital_id);
CREATE INDEX fund_allocations_payment_idx ON fund_allocations (payment_id);
CREATE INDEX fund_allocations_lp_idx ON fund_allocations (land_payment_id);
CREATE INDEX fund_allocations_exp_idx ON fund_allocations (expense_id);

-- ------------------------------------------------------------------ 5. cash book entry types
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_entry_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check CHECK (entry_type IN (
  'PAYMENT_RECEIVED','PAYMENT_REVERSED','REFUND_PAID','EXPENSE_PAID','EXPENSE_CANCELLED',
  'CAPITAL_CONTRIBUTION','CAPITAL_REVERSED','LAND_PAYMENT','LAND_PAYMENT_REVERSED'));
ALTER TABLE ledger_entries ADD COLUMN land_id INT REFERENCES lands(id);

-- ------------------------------------------------------------------ 6. expense categories
-- New payments to land owners go through "Pay Land Owner" (with payment source). The old category is switched off;
-- every existing "Land Purchase" expense is kept and still counted as paid to the seller.
UPDATE expense_categories SET is_active = FALSE WHERE cost_type = 'LAND_PAYMENT';
INSERT INTO expense_categories (name, cost_type, sort_order)
  SELECT 'Land Purchase Expenses', 'PROJECT', 0
  WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE lower(name) = 'land purchase expenses');

-- ------------------------------------------------------------------ 7. live balances
CREATE VIEW v_capital_balance AS
SELECT c.*,
  COALESCE(a.used, 0)::numeric(16,2)              AS used,
  COALESCE(a.used_land_payment, 0)::numeric(16,2) AS used_land_payment,
  COALESCE(a.used_land_expense, 0)::numeric(16,2) AS used_land_expense,
  (CASE WHEN c.status = 'VALID' THEN c.amount - COALESCE(a.used, 0) ELSE 0 END)::numeric(16,2) AS available
FROM capital_contributions c
LEFT JOIN (
  SELECT capital_id, SUM(amount) AS used,
    SUM(amount) FILTER (WHERE use_type = 'LAND_PAYMENT') AS used_land_payment,
    SUM(amount) FILTER (WHERE use_type = 'LAND_EXPENSE') AS used_land_expense
  FROM fund_allocations WHERE status = 'ACTIVE' AND capital_id IS NOT NULL GROUP BY capital_id
) a ON a.capital_id = c.id;

CREATE VIEW v_receipt_funds AS
SELECT p.id AS payment_id, p.receipt_no, p.payment_date, p.amount, p.status, p.purpose, p.booking_id, p.customer_id, p.plot_id,
  COALESCE(a.allocated, 0)::numeric(16,2) AS allocated,
  (CASE WHEN p.status = 'VALID' THEN p.amount - COALESCE(a.allocated, 0) ELSE 0 END)::numeric(16,2) AS available
FROM payments p
LEFT JOIN (
  SELECT payment_id, SUM(amount) AS allocated FROM fund_allocations
  WHERE status = 'ACTIVE' AND payment_id IS NOT NULL GROUP BY payment_id
) a ON a.payment_id = p.id;

CREATE VIEW v_land_finance AS
SELECT l.id AS land_id,
  COALESCE(lp.paid, 0)::numeric(16,2)                                          AS paid_new,
  COALESCE(le.legacy_paid, 0)::numeric(16,2)                                   AS paid_legacy,
  (COALESCE(lp.paid, 0) + COALESCE(le.legacy_paid, 0))::numeric(16,2)         AS total_paid,
  COALESCE(lp.additional, 0)::numeric(16,2)                                    AS additional_paid,
  (l.purchase_price - COALESCE(lp.paid, 0) - COALESCE(le.legacy_paid, 0))::numeric(16,2) AS remaining_payable,
  COALESCE(le.extra_cost, 0)::numeric(16,2)                                    AS extra_cost,
  (l.purchase_price + COALESCE(lp.additional, 0) + COALESCE(le.extra_cost, 0))::numeric(16,2) AS total_investment,
  COALESCE(fa.personal, 0)::numeric(16,2)                                      AS personal_funded,
  COALESCE(fa.customer, 0)::numeric(16,2)                                      AS customer_funded,
  COALESCE(lp.n, 0)::int                                                       AS payment_count
FROM lands l
LEFT JOIN (
  SELECT land_id,
    SUM(amount) FILTER (WHERE kind = 'PAYMENT')    AS paid,
    SUM(amount) FILTER (WHERE kind = 'ADDITIONAL') AS additional,
    COUNT(*) AS n
  FROM land_payments WHERE status = 'VALID' GROUP BY land_id
) lp ON lp.land_id = l.id
LEFT JOIN (
  SELECT e.land_id,
    SUM(e.amount) FILTER (WHERE c.cost_type = 'LAND_PAYMENT')  AS legacy_paid,
    SUM(e.amount) FILTER (WHERE c.cost_type <> 'LAND_PAYMENT') AS extra_cost
  FROM expenses e JOIN expense_categories c ON c.id = e.category_id
  WHERE e.status = 'ACTIVE' AND e.land_id IS NOT NULL GROUP BY e.land_id
) le ON le.land_id = l.id
LEFT JOIN (
  SELECT land_id,
    SUM(amount) FILTER (WHERE source_type = 'PERSONAL') AS personal,
    SUM(amount) FILTER (WHERE source_type = 'CUSTOMER') AS customer
  FROM fund_allocations WHERE status = 'ACTIVE' GROUP BY land_id
) fa ON fa.land_id = l.id;
