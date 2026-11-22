# FAISAL HOMES — System Architecture

Real Estate Society, Land, Plotting & Installment Management Software.

## 1. Technology stack (and why)

| Layer | Choice | Reason |
|---|---|---|
| Database | **Supabase PostgreSQL** (17) | Real transactions, row locking (prevents double booking), exact `NUMERIC` money, managed backups |
| Login | **Supabase Auth** (email + password) | Hosted, hashed passwords, signed access tokens (checked on every API call), no emails needed for staff logins |
| Files | **Supabase Storage** (private bucket) | Documents never pass through the API: browsers upload with one-time links and open files with 60-second links |
| Backend | **Node.js + Express 5**, deployed as a **Vercel** serverless function (`api/index.js`) | The business rules stay on the server, inside database transactions |
| DB access | Plain SQL with `pg` through the Supabase **transaction pooler** | Exact control of money maths and locking, easy to audit |
| Frontend | **React 18 + Vite + Tailwind CSS**, served by Vercel | Fast, responsive, static files on Vercel's CDN |
| PDF | `pdfkit` (server-side) | Receipts, booking confirmations, transfer letters, report PDFs look identical on every PC |
| Excel | `exceljs` | Native `.xlsx` with real number/date cells |
| Schema | One file, `supabase/schema.sql`, run in the Supabase SQL Editor | Fresh start; later changes as numbered SQL files |

Why the browser does not read Supabase directly: the money rules (locking plots, applying payments oldest-due-first, land
funding, reversals, cancellations, PDFs) need server-side transactions and permission checks. The browser only uses Supabase
for signing in and for uploading files with a link the server created.

## 2. High-level design

```
Browser (staff PCs, tablets, phones)
   │  sign-in + file uploads ───────────────►  Supabase Auth / Supabase Storage
   │  HTTPS, Authorization: Bearer <Supabase access token>
   ▼
Vercel ── static React app (dist/, built from client/)
   └── /api/*  → serverless function api/index.js (Express)
   ├── /api/public      branding, logo, public Supabase settings (URL + publishable key)
   ├── /api/auth        first-time setup, profile + permissions, login/logout events, change password
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
   ├── /api/documents   documents linked to customer/plot/land/booking/transfer/expense (Supabase Storage)
   ├── /api/reports     financial & operational reports (JSON / Excel / PDF)
   ├── /api/users       staff users: Supabase login + role, disable/enable, password reset
   ├── /api/audit       audit log
   └── /api/backup      full data export (Excel); database backups are made by Supabase
        │
        ▼
Supabase: PostgreSQL (transaction pooler)  +  Storage bucket "documents"  +  Auth
```

Code layout:

```
package.json            one package for the whole project (server + web app dependencies, scripts)
vite.config.mjs         web app build (client/ → dist/), Tailwind settings in tailwind.config.cjs
supabase/schema.sql     the complete database (tables, views, settings, security, storage bucket)
api/index.js            Vercel serverless function: the Express app
server/src/
  index.js              local development server
  app.js                express app, security headers (CSP allows the Supabase URL), routes
  config.js             environment settings (Supabase, database, SSL)
  db/                   pool, apply-schema (tests / empty databases), check-supabase (read-only setup check)
  lib/                  money, dates, schedule generator, allocation, permissions, audit, pdf, excel, words,
                        supabase (token check, Auth admin, Storage)
  middleware/           auth (Supabase token → FAISAL HOMES user), error handler
  routes/               one file per module
  services/             booking, payment, transfer, land, reports (business logic, all inside DB transactions)
client/src/
  components/           layout, tables, forms, modals, pickers, documents panel
  pages/                one file per screen
  lib/                  api client, auth context (Supabase sign-in), supabase client, formatting
  i18n/                 translation dictionaries (English now, Urdu-ready)
```

## 3. Database schema

All money columns are `NUMERIC(16,2)`; all Marla sizes are `NUMERIC(10,4)` (decimal Marla allowed).
Calculations are done in integer paisa in code, never with floating point.

| Table | Purpose / key columns |
|---|---|
| `users` | auth_user_id (the Supabase Auth login), email, full_name, role (ADMIN, ACCOUNTANT, SALES, VIEWER), is_active, must_change_password |
| `settings` | key → JSON value: company, measurement (Marla sq ft, Kanal), number format, late fee, receipt texts, branding (logo in Storage) |
| `schema_migrations` | which database files have been run (`001_initial` = `supabase/schema.sql`) |
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
| `expense_categories` | name + cost type: PROJECT (capitalised into plot cost) or OPERATING. Payments to land owners are never expenses |
| `expenses` | expense no, date, category, description, amount, method, paid to, optional land/society link, entered by, cancel reason |
| `ledger_entries` | the cash book: every money IN/OUT (payments, reversals, refunds, expenses, expense cancellations, capital contributions, land payments and their reversals); optional land link |
| `documents` | files linked to any record (customer, plot, land, booking, transfer, expense, payment); `stored_name` = path in the Storage bucket |
| `audit_logs` | who did what and when, with before/after data |

Integrity rules enforced in the database:
- One active booking per plot: unique partial index `bookings(plot_id) WHERE status = 'ACTIVE'`.
- Plot numbers unique within a block; block names unique within a society; CNIC unique.
- Money cannot be negative; payment amounts must be positive.
- Financial rows are never deleted. Payments are **reversed**, expenses and bookings are **cancelled**, each with a reason, user and time.
- Row level security is on for every table and Supabase's public API roles (`anon`, `authenticated`) have no access: only the
  server (which connects as the table owner) can read or change data. Views use `security_invoker`.

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
| Land payable | Land purchase prices − payments made to owners (`land_payments` of kind PAYMENT) |
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
| Users, settings, audit log, data export | ✓ | – | – | – |

Security:
- **Login:** Supabase Auth handles passwords and failed-attempt rate limits. Each API call carries the Supabase access token,
  which the server verifies with the project's public signing keys (or the legacy secret), and then loads the FAISAL HOMES user:
  a login without a user, or a disabled user, gets no access. Disabling a user also blocks them in Supabase Auth.
- **Browser links:** PDF/Excel links and document images cannot send the token header, so the web app mirrors the token into a
  `SameSite=Strict` cookie limited to `/api`.
- **Requests:** a CSRF header is required on every change, the app logs out after the idle time set in Settings (default 30 min),
  and security headers (CSP allowing only this site and the Supabase URL) are sent.
- **Files and records:** documents are reachable only through 60-second links issued after a permission check. CNICs are masked for
  viewers. Every create/update/cancel/reverse/login/export is written to the audit log.

## 8. Development roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, schema, migrations, auth, roles, audit, settings | Done and tested |
| 2 | Land, societies, blocks, plots (bulk), plot map, customers, documents | Done and tested |
| 3 | Bookings, payment plans, installments, payments, receipts, reversals, cancellations, refunds, transfers | Done and tested |
| 4 | Expenses, dashboard, financial reports, Excel/PDF export, backup/restore | Done and tested |
| 5 | Automated tests, browser testing, deployment guide | Done and tested |
| 6 | Move to Supabase (database, Auth, Storage) + Vercel, fresh `schema.sql` | Done and tested (2.0.0) |
| 7 (next) | Backups/restore inside the app for Supabase, Excel import, full Urdu translation, drawn site-plan map, SMS gateway | planned |
