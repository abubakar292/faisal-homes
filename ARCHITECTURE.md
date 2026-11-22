# FAISAL HOMES — System Architecture

Real Estate Society, Land, Plotting & Installment Management Software.

## 1. Technology stack (and why)

| Layer | Choice | Reason |
|---|---|---|
| Database | **PostgreSQL 16** | Real transactions, row locking (prevents double booking), exact `NUMERIC` money, free, runs on Windows and Linux |
| Backend | **Node.js 22 + Express 5** | One small process, easy to run on an office PC or a VPS |
| DB access | Plain SQL with `pg` + numbered SQL migrations | Exact control of money maths and locking, no binary engines to download, easy to audit |
| Frontend | **React 18 + Vite + Tailwind CSS** | Fast, responsive, built once into static files served by the same Node process |
| PDF | `pdfkit` (server-side) | Receipts, booking confirmations, transfer letters, report PDFs look identical on every PC |
| Excel | `exceljs` | Native `.xlsx` with real number/date cells |
| Auth | bcrypt password hashing + server-side sessions in PostgreSQL | Sessions can be expired/revoked; idle timeout enforced on the server |
| Backups | `pg_dump` + uploaded documents zipped together | Full restore of database and files in one step |

Why not Next.js: this is an internal office system with no public SEO pages. A React SPA served by one Express
server is simpler to install on a Windows office PC (one process, one port) and needs less memory.

Everything is self-hosted. There is no paid software licence or subscription in the stack.

## 2. High-level design

```
Browser (staff PCs, tablets, phones on office LAN or internet)
        │  HTTPS / HTTP on LAN
        ▼
Node.js (Express)  ── serves built React app (client/dist)
   ├── /api/auth        login, logout, session timeout, change password
   ├── /api/dashboard   statistics
   ├── /api/lands       land records, land ledger, Pay Land Owner (split funding), land expenses, reversals
   ├── /api/investments personal investment (capital contributions) + customer money available for land
   ├── /api/societies   societies/projects + blocks
   ├── /api/plots       inventory, bulk create, reserve, map
   ├── /api/customers   customer database + profile
   ├── /api/bookings    sale/booking, payment plans, schedules, cancellation, charges
   ├── /api/payments    collections, receipts, reversals
   ├── /api/transfers   ownership transfers + letters
   ├── /api/expenses    expenses + categories
   ├── /api/documents   uploads linked to customer/plot/land/booking/transfer/expense
   ├── /api/reports     financial & operational reports (JSON / Excel / PDF)
   ├── /api/users       user & role management
   ├── /api/audit       audit log
   └── /api/backup      manual/automatic backup, download, restore, data export
        │
        ▼
PostgreSQL  +  storage/uploads (documents)  +  storage/backups
```

Code layout:

```
server/src/
  index.js              start server + backup scheduler
  app.js                express app, security headers, routes, SPA fallback
  config.js             environment settings
  db/                   pool, migrator, migrations/*.sql, create-admin, demo seed
  lib/                  money, dates, schedule generator, allocation, permissions, audit, pdf, excel, words
  middleware/           auth/session, error handler
  routes/               one file per module
  services/             booking, payment, transfer, reports, backup (business logic, all inside DB transactions)
client/src/
  components/           layout, tables, forms, modals, pickers, documents panel
  pages/                one file per screen
  lib/                  api client, auth context, formatting
  i18n/                 translation dictionaries (English now, Urdu-ready)
```

## 3. Database schema

All money columns are `NUMERIC(16,2)`; all Marla sizes are `NUMERIC(10,4)` (decimal Marla allowed).
Calculations are done in integer paisa in code, never with floating point.

| Table | Purpose / key columns |
|---|---|
| `users` | username, full_name, password_hash (bcrypt), role (ADMIN, ACCOUNTANT, SALES, VIEWER), is_active |
| `sessions` | hashed token, user, last_seen_at, expires_at (sliding idle timeout) |
| `settings` | key → JSON value: company, measurement (Marla sq ft, Kanal), number format, late fee, backup, receipt texts |
| `counters` | gap-free numbering for customers, bookings, receipts, transfers, expenses, refunds, lands (FH-L-), land payments (FH-LP-), investments (FH-INV-) |
| `lands` | land code, name, location, Kanal/Marla/SqFt entered + total, expected saleable Marla, per-land Marla conversion, rate per Marla, purchase price (automatic = Marla × rate, or manual by admin with reason), purchase date, purchased by, original owner (seller) details, agreement and registry/mutation details, khasra/khewat |
| `land_price_adjustments` | every change of a land's purchase price: old/new/automatic price, MANUAL or RECALCULATED, reason, user |
| `land_payments` | payments to land owners: payment no, date, amount, PAYMENT or authorized ADDITIONAL (with authorization note), method, reference, status VALID/REVERSED + reason |
| `capital_contributions` | owner's personal investment entries (FH-INV-): investor, date, amount, method, made with which land payment/expense, status + reversal |
| `fund_allocations` | where the money for each land payment / land expense came from: PERSONAL (→ capital contribution) or CUSTOMER (→ original receipt, hence customer, booking, plot); ACTIVE/REVERSED |
| `societies` | projects; optional link to land; own Marla conversion |
| `blocks` | blocks inside a society |
| `plots` | plot no, block, street, size (Marla), front/depth, corner/main road/park facing, category, rate/Marla, list price (computed), discount, status, current booking, reservation |
| `customers` | auto customer code, name, father name, CNIC (unique), mobile, WhatsApp, address, nominee, guarantor, notes, photo |
| `bookings` | sale agreement: plot, current holder, original buyer, size/rate snapshot, total, discount, final price, booking amount, down payment, plan type + plan settings, status, transfer count, cancellation & refund |
| `installments` | payment schedule rows: kind (BOOKING, DOWN_PAYMENT, MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY, BALLOON, FULL, CUSTOM), due date, amount, paid amount |
| `schedule_revisions` | every manual schedule change with old/new rows, reason, user |
| `payments` | receipts: unique receipt no, booking, payer, purpose (INSTALLMENT or CHARGE), date, amount, method, reference, balance before/after snapshot, status VALID/REVERSED + reason |
| `payment_allocations` | which installment(s) each payment paid (oldest due first) |
| `charges` | late fees (only when an admin posts them), transfer fees, other charges; can be waived with reason |
| `refunds` | money returned on cancellation |
| `transfers` | transfer no, booking, plot, from/to customer, date, fee, dues at transfer, override reason, witnesses, approving admin |
| `ownership_history` | every owner of every plot with start/end dates and how ownership started/ended |
| `expense_categories` | name + cost type: LAND_PAYMENT (retired in 1.1.0: kept for old records only), PROJECT (capitalised into plot cost) or OPERATING |
| `expenses` | expense no, date, category, description, amount, method, paid to, optional land/society link, entered by, cancel reason |
| `ledger_entries` | the cash book: every money IN/OUT (payments, reversals, refunds, expenses, expense cancellations, capital contributions, land payments and their reversals); optional land link |
| `documents` | uploaded files linked to any record (customer, plot, land, booking, transfer, expense, payment) |
| `audit_logs` | who did what and when, with before/after data |

Integrity rules enforced in the database:
- One active booking per plot: unique partial index `bookings(plot_id) WHERE status = 'ACTIVE'`.
- Plot numbers unique within a block; block names unique within a society; CNIC unique.
- Money cannot be negative; payment amounts must be positive.
- Financial rows are never deleted. Payments are **reversed**, expenses and bookings are **cancelled**, each with a reason, user and time.

## 4. Module relationships

```
Land ──< Society ──< Block ──< Plot ──< Booking >── Customer
                                          │  ├──< Installment ──< PaymentAllocation >── Payment ── Ledger
                                          │  ├──< Charge (late fee / transfer fee) ──< Payment
                                          │  ├──< Transfer (from customer → to customer)
                                          │  └──< Refund ── Ledger
Expense ── Category (cost type) ── optional Land / Society ── Ledger
Land ──< LandPayment ──< FundAllocation >── CapitalContribution (personal) ── Ledger (cash in)
                     └─ FundAllocation >── Payment (customer receipt, already in Ledger; no new cash entry)
Land ──< LandPriceAdjustment
Document → any record      AuditLog → every change
```

## 5. Business rules

**Plot status**
- AVAILABLE → can be reserved or booked.
- RESERVED → held for someone (optional expiry), no money; can be booked or released.
- BOOKED → active booking with balance remaining.
- SOLD → active booking fully paid (set automatically when balance reaches 0; goes back to BOOKED if a payment is reversed).
- TRANSFERRED → active booking that has been transferred to a new owner and still has a balance (becomes SOLD when fully paid).
- CANCELLED → plot withdrawn from sale by an admin (e.g. disputed/merged). Cancelling a *booking* returns the plot to AVAILABLE.

**Booking** — plot row is locked (`SELECT … FOR UPDATE`) during booking, and the unique index is a second guard,
so two staff members can never sell the same plot. Price = size × rate − discount. The booking amount is received
immediately and a receipt is generated.

**Payment plans** — Full payment, Monthly, Quarterly, Half-yearly, Yearly, or Custom rows; any periodic plan can add
extra balloon payments (e.g. 36 monthly + 6 half-yearly). Installments are rounded (Rs 1/100/500/1000) and the last
installment absorbs the difference so the schedule always equals the final price exactly. Admins can edit any schedule;
the total must still equal the final price and the old schedule is kept in `schedule_revisions`.

**Payments** — partial payments allowed; each payment is applied to the oldest unpaid installment first.
Over-payment beyond the balance is refused. Future dates are refused. Cheque payments require a cheque number.
Balances are recalculated from the payments after every payment, reversal or schedule change.

**Late fees** — never automatic. Off by default. When an admin enables the setting, the overdue report shows the
suggested fee and an admin must post it explicitly; it can be waived with a reason.

**Transfers** — admin only. Blocked if the plot has overdue installments or unpaid charges, unless the admin enters an
override reason (recorded). Transfer fee becomes a charge (paid now with a receipt, or later). Ownership history keeps every owner.

**Cancellations & refunds** — admin only, reason required, refund cannot exceed the amount paid; the retained amount is
reported as forfeited income; the plot returns to inventory.

## 6. Accounting definitions (no "received minus land cost" shortcuts)

| Figure | Definition |
|---|---|
| Booked sales | Sum of final prices of active bookings (contract value) |
| Collections | Valid payments received against active bookings |
| Receivables | Booked sales − collections (+ unpaid charges) |
| Land investment | Land purchase prices + expenses linked to a land (excluding the land-payment category) + authorized additional payments to owners |
| Development expenses | PROJECT-type expenses not linked to a land (development, construction, roads, electricity, water) |
| Cost per Marla | (Land investment + development expenses) ÷ saleable Marla (the larger of plotted Marla and the expected saleable area on land records) |
| Cost of booked area | Booked Marla × cost per Marla |
| Expected gross profit | Booked sales − cost of booked area |
| Realised gross profit | Expected gross profit × (collections ÷ booked sales) — the installment method: profit is recognised only as cash is actually collected |
| Realised net profit | Realised gross profit + other income (fees, forfeited amounts) − operating expenses |
| Net cash position | All cash IN − all cash OUT from the ledger |
| Land payable | Land purchase prices − payments made to owners (`land_payments` of kind PAYMENT + old LAND_PAYMENT expenses from before 1.1.0) |
| Total expenses | All active expenses **except** payments to land owners (those are land payments, not expenses) |
| Personal investment | Valid capital contributions. Used = active allocations; remaining = amount − used. Customer money is never counted here |
| Customer money used for land | Active CUSTOMER allocations. Never more than the receipt amount (and, for a cancelled booking, never the refunded part) |

## 7. Roles & permissions

| Area | Admin | Accountant | Sales | Viewer |
|---|---|---|---|---|
| Dashboard financial cards | ✓ | ✓ | – | ✓ |
| Land records | edit | view | – | view |
| Pay land owner / land expenses | ✓ | ✓ | – | – |
| Manual land price, additional payment, reverse land payment/investment | ✓ | – | – | – |
| Personal investment | view + add | view + add | – | view |
| Societies, blocks, plots | edit | view | view + reserve | view |
| Customers | edit | view | edit | view (CNIC masked) |
| New booking | ✓ | – | ✓ | – |
| Cancel booking / edit schedule / post or waive charges | ✓ | – | – | – |
| Collect payment / receipts | ✓ | ✓ | view | view |
| Reverse payment | ✓ | – | – | – |
| Transfers | create | view | view | view |
| Expenses | edit + cancel | add/edit | – | view |
| Reports & exports | ✓ | ✓ | – | ✓ |
| Documents | upload/view/delete | upload/view | upload/view | – |
| Users, settings, audit log, backup/restore | ✓ | – | – | – |

Security: bcrypt hashing, httpOnly SameSite cookies, CSRF header check, login lockout after 5 failures, idle session
timeout (default 30 min, configurable), security headers, uploaded documents served only to logged-in users with permission,
CNIC masked for viewers, every create/update/cancel/reverse/login/download/backup/restore written to the audit log.

## 8. Development roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, schema, migrations, auth, roles, audit, settings | Done and tested |
| 2 | Land, societies, blocks, plots (bulk), plot map, customers, documents | Done and tested |
| 3 | Bookings, payment plans, installments, payments, receipts, reversals, cancellations, refunds, transfers | Done and tested |
| 4 | Expenses, dashboard, financial reports, Excel/PDF export, backup/restore | Done and tested |
| 5 | Automated tests, browser testing, deployment guide | Done and tested |
| 6 (next) | Excel import of existing records, full Urdu translation, drawn site-plan map, SMS gateway, multi-branch | planned |
