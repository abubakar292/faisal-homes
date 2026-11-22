-- FAISAL HOMES: initial schema
-- Money: NUMERIC(16,2). Marla: NUMERIC(10,4). Financial rows are never deleted.

CREATE TABLE users (
  id               SERIAL PRIMARY KEY,
  username         TEXT NOT NULL,
  full_name        TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('ADMIN','ACCOUNTANT','SALES','VIEWER')),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       INT REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INT REFERENCES users(id)
);
CREATE UNIQUE INDEX users_username_uq ON users (lower(username));

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,               -- sha256 of the cookie token
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

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
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  location         TEXT,
  area_kanal       NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (area_kanal >= 0),
  area_marla       NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (area_marla >= 0),
  area_sqft        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (area_sqft >= 0),
  marla_sqft       NUMERIC(10,4) NOT NULL CHECK (marla_sqft > 0),
  kanal_marla      NUMERIC(8,4)  NOT NULL DEFAULT 20 CHECK (kanal_marla > 0),
  total_sqft       NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_marla      NUMERIC(14,4) NOT NULL DEFAULT 0,
  purchase_price   NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  purchase_date    DATE,
  seller_name      TEXT,
  seller_father_name TEXT,
  seller_cnic      TEXT,
  seller_mobile    TEXT,
  seller_address   TEXT,
  owner_name       TEXT,
  ownership_details TEXT,
  registry_no      TEXT,
  registry_date    DATE,
  mutation_no      TEXT,
  mutation_date    DATE,
  khasra_no        TEXT,
  khewat_no        TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       INT REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INT REFERENCES users(id)
);

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
  id               SERIAL PRIMARY KEY,
  society_id       INT NOT NULL REFERENCES societies(id),
  block_id         INT NOT NULL REFERENCES blocks(id),
  plot_no          TEXT NOT NULL,
  street_no        TEXT,
  size_marla       NUMERIC(10,4) NOT NULL CHECK (size_marla > 0),
  front_ft         NUMERIC(10,2),
  depth_ft         NUMERIC(10,2),
  category         TEXT NOT NULL DEFAULT 'RESIDENTIAL' CHECK (category IN ('RESIDENTIAL','COMMERCIAL')),
  is_corner        BOOLEAN NOT NULL DEFAULT FALSE,
  is_main_road     BOOLEAN NOT NULL DEFAULT FALSE,
  is_park_facing   BOOLEAN NOT NULL DEFAULT FALSE,
  location_note    TEXT,
  price_per_marla  NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (price_per_marla >= 0),
  list_price       NUMERIC(16,2) GENERATED ALWAYS AS (round(size_marla * price_per_marla, 2)) STORED,
  discount         NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  status           TEXT NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE','RESERVED','BOOKED','SOLD','TRANSFERRED','CANCELLED')),
  current_booking_id INT,
  reserved_for     TEXT,
  reserved_customer_id INT REFERENCES customers(id),
  reserved_until   DATE,
  reserved_by      INT REFERENCES users(id),
  status_note      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       INT REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       INT REFERENCES users(id)
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
  id                  SERIAL PRIMARY KEY,
  transfer_no         TEXT NOT NULL UNIQUE,
  booking_id          INT NOT NULL REFERENCES bookings(id),
  plot_id             INT NOT NULL REFERENCES plots(id),
  from_customer_id    INT NOT NULL REFERENCES customers(id),
  to_customer_id      INT NOT NULL REFERENCES customers(id),
  transfer_date       DATE NOT NULL,
  transfer_fee        NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
  fee_paid_by         TEXT NOT NULL DEFAULT 'FROM' CHECK (fee_paid_by IN ('FROM','TO')),
  final_price         NUMERIC(16,2) NOT NULL,
  paid_at_transfer    NUMERIC(16,2) NOT NULL,
  balance_at_transfer NUMERIC(16,2) NOT NULL,
  overdue_at_transfer NUMERIC(16,2) NOT NULL DEFAULT 0,
  unpaid_charges_at_transfer NUMERIC(16,2) NOT NULL DEFAULT 0,
  dues_override       BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason     TEXT,
  witness_1           TEXT,
  witness_2           TEXT,
  notes               TEXT,
  approved_by         INT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          INT REFERENCES users(id),
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
  id               SERIAL PRIMARY KEY,
  receipt_no       TEXT NOT NULL UNIQUE,
  booking_id       INT NOT NULL REFERENCES bookings(id),
  customer_id      INT NOT NULL REFERENCES customers(id),
  plot_id          INT NOT NULL REFERENCES plots(id),
  purpose          TEXT NOT NULL CHECK (purpose IN ('INSTALLMENT','CHARGE')),
  charge_id        INT REFERENCES charges(id),
  payment_date     DATE NOT NULL,
  amount           NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method           TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CHEQUE','OTHER')),
  reference_no     TEXT,
  bank_name        TEXT,
  notes            TEXT,
  final_price_snapshot NUMERIC(16,2) NOT NULL,
  balance_before   NUMERIC(16,2) NOT NULL,
  balance_after    NUMERIC(16,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','REVERSED')),
  reversed_at      TIMESTAMPTZ,
  reversed_by      INT REFERENCES users(id),
  reversal_reason  TEXT,
  print_count      INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       INT REFERENCES users(id),
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

-- ---------------------------------------------------------------- expenses / ledger
CREATE TABLE expense_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  cost_type   TEXT NOT NULL CHECK (cost_type IN ('LAND_PAYMENT','PROJECT','OPERATING')),
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

CREATE TABLE ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  entry_date    DATE NOT NULL,
  entry_type    TEXT NOT NULL CHECK (entry_type IN ('PAYMENT_RECEIVED','PAYMENT_REVERSED','REFUND_PAID','EXPENSE_PAID','EXPENSE_CANCELLED')),
  direction     TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  amount        NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  method        TEXT,
  source_type   TEXT NOT NULL,
  source_id     INT NOT NULL,
  reference     TEXT,
  booking_id    INT REFERENCES bookings(id),
  customer_id   INT REFERENCES customers(id),
  plot_id       INT REFERENCES plots(id),
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    INT REFERENCES users(id)
);
CREATE INDEX ledger_date_idx ON ledger_entries (entry_date);

-- ---------------------------------------------------------------- documents / audit
CREATE TABLE documents (
  id             SERIAL PRIMARY KEY,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('CUSTOMER','PLOT','LAND','BOOKING','TRANSFER','EXPENSE','PAYMENT','SOCIETY')),
  entity_id      INT NOT NULL,
  doc_type       TEXT NOT NULL,
  title          TEXT,
  original_name  TEXT NOT NULL,
  stored_name    TEXT NOT NULL,
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
  username     TEXT,
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
