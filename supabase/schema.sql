-- =====================================================================================================
-- FAISAL HOMES — complete database for a FRESH Supabase project.
--
-- How to use: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Run it ONCE on an empty project. It creates every table, view and setting the software needs,
-- the private "documents" storage bucket, and locks the tables so only the FAISAL HOMES server can
-- read them (Supabase's public Data API cannot).
--
-- The same file also works on a plain PostgreSQL database (used by the automatic tests): the
-- Supabase-only parts at the end are skipped when Supabase is not detected.
--
-- Money: NUMERIC(16,2). Marla: NUMERIC(10,4). Financial rows are never deleted.
-- =====================================================================================================

-- Overdue logic uses CURRENT_DATE, which must be the Pakistan date.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Karachi');
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE format('ALTER ROLE %I SET timezone TO %L', current_user, 'Asia/Karachi');
END $$;
SET timezone TO 'Asia/Karachi';

CREATE TABLE schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- users (login is Supabase Auth)
CREATE TABLE users (
  id                   SERIAL PRIMARY KEY,
  auth_user_id         UUID UNIQUE,                 -- Supabase Auth user (auth.users.id)
  email                TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('ADMIN','ACCOUNTANT','SALES','VIEWER')),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           INT REFERENCES users(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           INT REFERENCES users(id)
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INT REFERENCES users(id)
);

CREATE TABLE counters (
  name        TEXT PRIMARY KEY,
  prefix      TEXT NOT NULL,
  pad         INT NOT NULL DEFAULT 5,
  next_value  BIGINT NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------- land
CREATE TABLE lands (
  id                  SERIAL PRIMARY KEY,
  land_code           TEXT NOT NULL,
  name                TEXT NOT NULL,
  location            TEXT,
  area_kanal          NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (area_kanal >= 0),
  area_marla          NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (area_marla >= 0),
  area_sqft           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (area_sqft >= 0),
  marla_sqft          NUMERIC(10,4) NOT NULL CHECK (marla_sqft > 0),
  kanal_marla         NUMERIC(8,4)  NOT NULL DEFAULT 20 CHECK (kanal_marla > 0),
  total_sqft          NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_marla         NUMERIC(14,4) NOT NULL DEFAULT 0,
  saleable_marla      NUMERIC(14,4) CHECK (saleable_marla IS NULL OR saleable_marla >= 0),
  rate_per_marla      NUMERIC(16,2) CHECK (rate_per_marla IS NULL OR rate_per_marla >= 0),
  purchase_price      NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  price_is_manual     BOOLEAN NOT NULL DEFAULT FALSE,
  price_adjust_reason TEXT,
  purchase_date       DATE,
  purchased_by        TEXT,
  agreement_details   TEXT,
  registry_details    TEXT,
  seller_name         TEXT,
  seller_father_name  TEXT,
  seller_cnic         TEXT,
  seller_mobile       TEXT,
  seller_address      TEXT,
  owner_name          TEXT,
  ownership_details   TEXT,
  registry_no         TEXT,
  registry_date       DATE,
  mutation_no         TEXT,
  mutation_date       DATE,
  khasra_no           TEXT,
  khewat_no           TEXT,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          INT REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          INT REFERENCES users(id)
);
CREATE UNIQUE INDEX lands_code_uq ON lands (land_code);

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

-- ---------------------------------------------------------------- society / blocks / plots
CREATE TABLE societies (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT,
  land_id      INT REFERENCES lands(id),
  location     TEXT,
  marla_sqft   NUMERIC(10,4) NOT NULL CHECK (marla_sqft > 0),
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   INT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   INT REFERENCES users(id)
);
CREATE UNIQUE INDEX societies_name_uq ON societies (lower(name));

CREATE TABLE blocks (
  id           SERIAL PRIMARY KEY,
  society_id   INT NOT NULL REFERENCES societies(id),
  name         TEXT NOT NULL,
  description  TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   INT REFERENCES users(id)
);
CREATE UNIQUE INDEX blocks_name_uq ON blocks (society_id, lower(name));

CREATE TABLE customers (
  id                  SERIAL PRIMARY KEY,
  customer_code       TEXT NOT NULL UNIQUE,
  full_name           TEXT NOT NULL,
  father_name         TEXT,
  cnic                TEXT NOT NULL,
  mobile              TEXT,
  whatsapp            TEXT,
  email               TEXT,
  address             TEXT,
  city                TEXT,
  nominee_name        TEXT,
  nominee_relation    TEXT,
  nominee_cnic        TEXT,
  nominee_mobile      TEXT,
  guarantor_name      TEXT,
  guarantor_cnic      TEXT,
  guarantor_mobile    TEXT,
  guarantor_address   TEXT,
  notes               TEXT,
  registration_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  photo_document_id   INT,
  is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          INT REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          INT REFERENCES users(id)
);
CREATE UNIQUE INDEX customers_cnic_uq ON customers (cnic);
CREATE INDEX customers_name_idx ON customers (lower(full_name));
CREATE INDEX customers_mobile_idx ON customers (mobile);

CREATE TABLE plots (
  id                   SERIAL PRIMARY KEY,
  society_id           INT NOT NULL REFERENCES societies(id),
  block_id             INT NOT NULL REFERENCES blocks(id),
  plot_no              TEXT NOT NULL,
  street_no            TEXT,
  size_marla           NUMERIC(10,4) NOT NULL CHECK (size_marla > 0),
  front_ft             NUMERIC(10,2),
  depth_ft             NUMERIC(10,2),
  category             TEXT NOT NULL DEFAULT 'RESIDENTIAL' CHECK (category IN ('RESIDENTIAL','COMMERCIAL')),
  is_corner            BOOLEAN NOT NULL DEFAULT FALSE,
  is_main_road         BOOLEAN NOT NULL DEFAULT FALSE,
  is_park_facing       BOOLEAN NOT NULL DEFAULT FALSE,
  location_note        TEXT,
  price_per_marla      NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (price_per_marla >= 0),
  list_price           NUMERIC(16,2) GENERATED ALWAYS AS (round(size_marla * price_per_marla, 2)) STORED,
  discount             NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  status               TEXT NOT NULL DEFAULT 'AVAILABLE'
                       CHECK (status IN ('AVAILABLE','RESERVED','BOOKED','SOLD','TRANSFERRED','CANCELLED')),
  current_booking_id   INT,
  reserved_for         TEXT,
  reserved_customer_id INT REFERENCES customers(id),
  reserved_until       DATE,
  reserved_by          INT REFERENCES users(id),
  status_note          TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           INT REFERENCES users(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           INT REFERENCES users(id)
);
CREATE UNIQUE INDEX plots_no_uq ON plots (block_id, lower(plot_no));
CREATE INDEX plots_society_idx ON plots (society_id);
CREATE INDEX plots_status_idx ON plots (status);

-- ---------------------------------------------------------------- bookings / schedule
CREATE TABLE bookings (
  id                   SERIAL PRIMARY KEY,
  booking_no           TEXT NOT NULL UNIQUE,
  plot_id              INT NOT NULL REFERENCES plots(id),
  customer_id          INT NOT NULL REFERENCES customers(id),
  original_customer_id INT NOT NULL REFERENCES customers(id),
  booking_date         DATE NOT NULL,
  size_marla           NUMERIC(10,4) NOT NULL,
  rate_per_marla       NUMERIC(16,2) NOT NULL CHECK (rate_per_marla >= 0),
  total_price          NUMERIC(16,2) NOT NULL CHECK (total_price >= 0),
  discount             NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  final_price          NUMERIC(16,2) NOT NULL CHECK (final_price >= 0),
  booking_amount       NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (booking_amount >= 0),
  down_payment         NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
  plan_type            TEXT NOT NULL CHECK (plan_type IN ('FULL','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','CUSTOM')),
  plan_config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  transfer_count       INT NOT NULL DEFAULT 0,
  sales_person         TEXT,
  notes                TEXT,
  cancelled_at         TIMESTAMPTZ,
  cancelled_by         INT REFERENCES users(id),
  cancel_reason        TEXT,
  refund_amount        NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           INT REFERENCES users(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           INT REFERENCES users(id),
  CHECK (discount <= total_price)
);
-- The core guarantee against double booking / double selling:
CREATE UNIQUE INDEX bookings_one_active_per_plot ON bookings (plot_id) WHERE status = 'ACTIVE';
CREATE INDEX bookings_customer_idx ON bookings (customer_id);
ALTER TABLE plots ADD CONSTRAINT plots_current_booking_fk FOREIGN KEY (current_booking_id) REFERENCES bookings(id);

CREATE TABLE installments (
  id           SERIAL PRIMARY KEY,
  booking_id   INT NOT NULL REFERENCES bookings(id),
  seq_no       INT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('BOOKING','DOWN_PAYMENT','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','BALLOON','FULL','CUSTOM')),
  label        TEXT NOT NULL,
  due_date     DATE NOT NULL,
  amount       NUMERIC(16,2) NOT NULL CHECK (amount >= 0),
  paid_amount  NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (paid_amount <= amount)
);
CREATE INDEX installments_booking_idx ON installments (booking_id, due_date);
CREATE INDEX installments_due_idx ON installments (due_date);

CREATE TABLE schedule_revisions (
  id            SERIAL PRIMARY KEY,
  booking_id    INT NOT NULL REFERENCES bookings(id),
  reason        TEXT NOT NULL,
  old_schedule  JSONB NOT NULL,
  new_schedule  JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    INT REFERENCES users(id)
);

CREATE TABLE transfers (
  id                         SERIAL PRIMARY KEY,
  transfer_no                TEXT NOT NULL UNIQUE,
  booking_id                 INT NOT NULL REFERENCES bookings(id),
  plot_id                    INT NOT NULL REFERENCES plots(id),
  from_customer_id           INT NOT NULL REFERENCES customers(id),
  to_customer_id             INT NOT NULL REFERENCES customers(id),
  transfer_date              DATE NOT NULL,
  transfer_fee               NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
  fee_paid_by                TEXT NOT NULL DEFAULT 'FROM' CHECK (fee_paid_by IN ('FROM','TO')),
  final_price                NUMERIC(16,2) NOT NULL,
  paid_at_transfer           NUMERIC(16,2) NOT NULL,
  balance_at_transfer        NUMERIC(16,2) NOT NULL,
  overdue_at_transfer        NUMERIC(16,2) NOT NULL DEFAULT 0,
  unpaid_charges_at_transfer NUMERIC(16,2) NOT NULL DEFAULT 0,
  dues_override              BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason            TEXT,
  witness_1                  TEXT,
  witness_2                  TEXT,
  notes                      TEXT,
  approved_by                INT REFERENCES users(id),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                 INT REFERENCES users(id),
  CHECK (from_customer_id <> to_customer_id)
);
CREATE INDEX transfers_booking_idx ON transfers (booking_id);

CREATE TABLE charges (
  id              SERIAL PRIMARY KEY,
  booking_id      INT NOT NULL REFERENCES bookings(id),
  charge_type     TEXT NOT NULL CHECK (charge_type IN ('LATE_FEE','TRANSFER_FEE','OTHER')),
  description     TEXT NOT NULL,
  charge_date     DATE NOT NULL,
  amount          NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  installment_id  INT REFERENCES installments(id),
  transfer_id     INT REFERENCES transfers(id),
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WAIVED')),
  waived_reason   TEXT,
  waived_at       TIMESTAMPTZ,
  waived_by       INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      INT REFERENCES users(id)
);
CREATE INDEX charges_booking_idx ON charges (booking_id);

CREATE TABLE payments (
  id                   SERIAL PRIMARY KEY,
  receipt_no           TEXT NOT NULL UNIQUE,
  booking_id           INT NOT NULL REFERENCES bookings(id),
  customer_id          INT NOT NULL REFERENCES customers(id),
  plot_id              INT NOT NULL REFERENCES plots(id),
  purpose              TEXT NOT NULL CHECK (purpose IN ('INSTALLMENT','CHARGE')),
  charge_id            INT REFERENCES charges(id),
  payment_date         DATE NOT NULL,
  amount               NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method               TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','OTHER')),
  reference_no         TEXT,
  bank_name            TEXT,
  notes                TEXT,
  final_price_snapshot NUMERIC(16,2) NOT NULL,
  balance_before       NUMERIC(16,2) NOT NULL,
  balance_after        NUMERIC(16,2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','REVERSED')),
  reversed_at          TIMESTAMPTZ,
  reversed_by          INT REFERENCES users(id),
  reversal_reason      TEXT,
  print_count          INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           INT REFERENCES users(id),
  CHECK ((purpose = 'CHARGE') = (charge_id IS NOT NULL))
);
CREATE INDEX payments_booking_idx ON payments (booking_id);
CREATE INDEX payments_customer_idx ON payments (customer_id);
CREATE INDEX payments_date_idx ON payments (payment_date);

CREATE TABLE payment_allocations (
  id              SERIAL PRIMARY KEY,
  payment_id      INT NOT NULL REFERENCES payments(id),
  installment_id  INT NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
  amount          NUMERIC(16,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX payment_allocations_payment_idx ON payment_allocations (payment_id);
CREATE INDEX payment_allocations_inst_idx ON payment_allocations (installment_id);

CREATE TABLE refunds (
  id            SERIAL PRIMARY KEY,
  refund_no     TEXT NOT NULL UNIQUE,
  booking_id    INT NOT NULL REFERENCES bookings(id),
  customer_id   INT NOT NULL REFERENCES customers(id),
  refund_date   DATE NOT NULL,
  amount        NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','OTHER')),
  reference_no  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    INT REFERENCES users(id)
);

CREATE TABLE ownership_history (
  id            SERIAL PRIMARY KEY,
  plot_id       INT NOT NULL REFERENCES plots(id),
  booking_id    INT NOT NULL REFERENCES bookings(id),
  customer_id   INT NOT NULL REFERENCES customers(id),
  start_date    DATE NOT NULL,
  end_date      DATE,
  acquired_via  TEXT NOT NULL CHECK (acquired_via IN ('BOOKING','TRANSFER')),
  ended_via     TEXT CHECK (ended_via IN ('TRANSFER','CANCELLATION')),
  transfer_id   INT REFERENCES transfers(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ownership_plot_idx ON ownership_history (plot_id);
CREATE INDEX ownership_customer_idx ON ownership_history (customer_id);

-- ---------------------------------------------------------------- expenses
-- Payments to land owners are NOT expenses: they go through "Pay Land Owner" (land_payments below).
CREATE TABLE expense_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  cost_type   TEXT NOT NULL CHECK (cost_type IN ('PROJECT','OPERATING')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX expense_categories_name_uq ON expense_categories (lower(name));

CREATE TABLE expenses (
  id             SERIAL PRIMARY KEY,
  expense_no     TEXT NOT NULL UNIQUE,
  expense_date   DATE NOT NULL,
  category_id    INT NOT NULL REFERENCES expense_categories(id),
  description    TEXT NOT NULL,
  amount         NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method         TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','OTHER')),
  reference_no   TEXT,
  paid_to        TEXT,
  land_id        INT REFERENCES lands(id),
  society_id     INT REFERENCES societies(id),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  cancel_reason  TEXT,
  cancelled_at   TIMESTAMPTZ,
  cancelled_by   INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     INT REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     INT REFERENCES users(id)
);
CREATE INDEX expenses_date_idx ON expenses (expense_date);

-- ---------------------------------------------------------------- payments to land owners + funding
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

-- Owner's personal investment (capital contributions).
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

-- Where the money for each land payment / land expense came from.
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

-- ---------------------------------------------------------------- cash book
CREATE TABLE ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  entry_date    DATE NOT NULL,
  entry_type    TEXT NOT NULL CHECK (entry_type IN (
                  'PAYMENT_RECEIVED','PAYMENT_REVERSED','REFUND_PAID','EXPENSE_PAID','EXPENSE_CANCELLED',
                  'CAPITAL_CONTRIBUTION','CAPITAL_REVERSED','LAND_PAYMENT','LAND_PAYMENT_REVERSED')),
  direction     TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  amount        NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method        TEXT,
  source_type   TEXT NOT NULL,
  source_id     INT NOT NULL,
  reference     TEXT,
  booking_id    INT REFERENCES bookings(id),
  customer_id   INT REFERENCES customers(id),
  plot_id       INT REFERENCES plots(id),
  land_id       INT REFERENCES lands(id),
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    INT REFERENCES users(id)
);
CREATE INDEX ledger_date_idx ON ledger_entries (entry_date);

-- ---------------------------------------------------------------- documents / audit
-- stored_name is the file's path inside the Supabase Storage bucket "documents".
CREATE TABLE documents (
  id             SERIAL PRIMARY KEY,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('CUSTOMER','PLOT','LAND','BOOKING','TRANSFER','EXPENSE','PAYMENT','SOCIETY')),
  entity_id      INT NOT NULL,
  doc_type       TEXT NOT NULL,
  title          TEXT,
  original_name  TEXT NOT NULL,
  stored_name    TEXT NOT NULL UNIQUE,
  mime_type      TEXT NOT NULL,
  size_bytes     INT NOT NULL,
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at     TIMESTAMPTZ,
  deleted_by     INT REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by    INT REFERENCES users(id)
);
CREATE INDEX documents_entity_idx ON documents (entity_type, entity_id);
ALTER TABLE customers ADD CONSTRAINT customers_photo_fk FOREIGN KEY (photo_document_id) REFERENCES documents(id);

CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      INT REFERENCES users(id),
  username     TEXT,                                 -- the user's email at the time
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  summary      TEXT,
  before_data  JSONB,
  after_data   JSONB,
  ip           TEXT
);
CREATE INDEX audit_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------- live balances (never stored by hand)
CREATE VIEW v_booking_finance WITH (security_invoker = true) AS
SELECT b.id AS booking_id,
  COALESCE(p.paid, 0)::numeric(16,2)                  AS paid,
  (b.final_price - COALESCE(p.paid, 0))::numeric(16,2) AS balance,
  COALESCE(i.overdue_amount, 0)::numeric(16,2)        AS overdue_amount,
  COALESCE(i.overdue_count, 0)::int                   AS overdue_count,
  i.oldest_overdue_date,
  n.next_due_date,
  n.next_due_amount::numeric(16,2)                    AS next_due_amount,
  COALESCE(i.paid_count, 0)::int                      AS paid_count,
  COALESCE(i.unpaid_count, 0)::int                    AS unpaid_count,
  COALESCE(i.total_count, 0)::int                     AS total_count,
  COALESCE(c.charges_due, 0)::numeric(16,2)           AS charges_due
FROM bookings b
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS paid FROM payments
  WHERE purpose = 'INSTALLMENT' AND status = 'VALID' GROUP BY booking_id
) p ON p.booking_id = b.id
LEFT JOIN (
  SELECT booking_id,
    SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE AND paid_amount < amount) AS overdue_amount,
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND paid_amount < amount)                  AS overdue_count,
    MIN(due_date) FILTER (WHERE due_date < CURRENT_DATE AND paid_amount < amount)             AS oldest_overdue_date,
    COUNT(*) FILTER (WHERE paid_amount >= amount)                                              AS paid_count,
    COUNT(*) FILTER (WHERE paid_amount < amount)                                               AS unpaid_count,
    COUNT(*)                                                                                   AS total_count
  FROM installments GROUP BY booking_id
) i ON i.booking_id = b.id
LEFT JOIN LATERAL (
  SELECT x.due_date AS next_due_date, (x.amount - x.paid_amount) AS next_due_amount
  FROM installments x WHERE x.booking_id = b.id AND x.paid_amount < x.amount
  ORDER BY x.due_date, x.seq_no LIMIT 1
) n ON TRUE
LEFT JOIN (
  SELECT ch.booking_id, SUM(ch.amount - COALESCE(cp.paid, 0)) AS charges_due
  FROM charges ch
  LEFT JOIN (SELECT charge_id, SUM(amount) AS paid FROM payments WHERE purpose = 'CHARGE' AND status = 'VALID' GROUP BY charge_id) cp
    ON cp.charge_id = ch.id
  WHERE ch.status = 'ACTIVE'
  GROUP BY ch.booking_id
) c ON c.booking_id = b.id;

CREATE VIEW v_charge_finance WITH (security_invoker = true) AS
SELECT ch.*,
  COALESCE(cp.paid, 0)::numeric(16,2)               AS paid,
  CASE WHEN ch.status = 'ACTIVE' THEN (ch.amount - COALESCE(cp.paid, 0)) ELSE 0 END::numeric(16,2) AS due
FROM charges ch
LEFT JOIN (SELECT charge_id, SUM(amount) AS paid FROM payments WHERE purpose = 'CHARGE' AND status = 'VALID' GROUP BY charge_id) cp
  ON cp.charge_id = ch.id;

CREATE VIEW v_capital_balance WITH (security_invoker = true) AS
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

CREATE VIEW v_receipt_funds WITH (security_invoker = true) AS
SELECT p.id AS payment_id, p.receipt_no, p.payment_date, p.amount, p.status, p.purpose, p.booking_id, p.customer_id, p.plot_id,
  COALESCE(a.allocated, 0)::numeric(16,2) AS allocated,
  (CASE WHEN p.status = 'VALID' THEN p.amount - COALESCE(a.allocated, 0) ELSE 0 END)::numeric(16,2) AS available
FROM payments p
LEFT JOIN (
  SELECT payment_id, SUM(amount) AS allocated FROM fund_allocations
  WHERE status = 'ACTIVE' AND payment_id IS NOT NULL GROUP BY payment_id
) a ON a.payment_id = p.id;

-- paid_legacy stays in the view so the software's land formulas are unchanged; on a fresh database it is always 0.
CREATE VIEW v_land_finance WITH (security_invoker = true) AS
SELECT l.id AS land_id,
  COALESCE(lp.paid, 0)::numeric(16,2)                                          AS paid_new,
  0::numeric(16,2)                                                             AS paid_legacy,
  COALESCE(lp.paid, 0)::numeric(16,2)                                          AS total_paid,
  COALESCE(lp.additional, 0)::numeric(16,2)                                    AS additional_paid,
  (l.purchase_price - COALESCE(lp.paid, 0))::numeric(16,2)                     AS remaining_payable,
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
  SELECT e.land_id, SUM(e.amount) AS extra_cost
  FROM expenses e WHERE e.status = 'ACTIVE' AND e.land_id IS NOT NULL GROUP BY e.land_id
) le ON le.land_id = l.id
LEFT JOIN (
  SELECT land_id,
    SUM(amount) FILTER (WHERE source_type = 'PERSONAL') AS personal,
    SUM(amount) FILTER (WHERE source_type = 'CUSTOMER') AS customer
  FROM fund_allocations WHERE status = 'ACTIVE' GROUP BY land_id
) fa ON fa.land_id = l.id;

-- ---------------------------------------------------------------- reference data and default settings
INSERT INTO counters (name, prefix, pad) VALUES
  ('customer',     'FH-C-',   5),
  ('booking',      'FH-B-',   5),
  ('receipt',      'FH-R-',   6),
  ('transfer',     'FH-T-',   5),
  ('expense',      'FH-E-',   5),
  ('refund',       'FH-RF-',  5),
  ('land',         'FH-L-',   5),
  ('land_payment', 'FH-LP-',  5),
  ('investment',   'FH-INV-', 5);

INSERT INTO expense_categories (name, cost_type, sort_order) VALUES
  ('Land Purchase Expenses', 'PROJECT',    1),
  ('Development',            'PROJECT',    2),
  ('Construction',           'PROJECT',    3),
  ('Road Work',              'PROJECT',    4),
  ('Electricity',            'PROJECT',    5),
  ('Water Supply',           'PROJECT',    6),
  ('Marketing',              'OPERATING',  7),
  ('Staff Salaries',         'OPERATING',  8),
  ('Office Expenses',        'OPERATING',  9),
  ('Commission',             'OPERATING', 10),
  ('Legal Expenses',         'OPERATING', 11),
  ('Other Expenses',         'OPERATING', 12);

INSERT INTO settings (key, value) VALUES
  ('company', '{"name":"FAISAL HOMES","tagline":"Real Estate & Developers","address":"","phone":"","email":"","website":""}'),
  ('measurement', '{"marla_sqft":272.25,"kanal_marla":20}'),
  ('display', '{"number_format":"intl","date_format":"DD-MM-YYYY","language":"en"}'),
  ('security', '{"session_timeout_minutes":30}'),
  ('late_fee', '{"enabled":false,"mode":"FIXED","value":0,"grace_days":0}'),
  ('installments', '{"default_rounding":100}'),
  ('branding', '{"logo_path":null,"logo_version":0}'),
  ('receipt', '{"footer_note":"This is a computer generated receipt. Please keep it safe for future reference.","signature_label":"Authorized Signature","booking_terms":"1. Installments must be paid on or before the due date.\n2. The booking can be cancelled by the company as per the agreement if installments remain unpaid.\n3. Transfer of the plot is subject to clearance of all dues and company approval."}');

INSERT INTO schema_migrations (name) VALUES ('001_initial');

-- ---------------------------------------------------------------- security
-- Row level security on every table, with no policies: nobody can read or change rows through
-- Supabase's public Data API. The FAISAL HOMES server connects as the table owner, which is not
-- affected by these rules.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Supabase-only steps (skipped automatically on plain PostgreSQL).
DO $$
BEGIN
  -- 1. The public API roles get no access at all to the software's tables, views, sequences and functions.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;

  -- 2. Each software user is linked to their Supabase Auth login.
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_user_fk FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- 3. Private storage bucket for customer photos, CNIC copies, agreements, bills and the company logo.
  --    Files are only reachable through short-lived links made by the server after a permission check.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('documents', 'documents', false, 10485760, ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
