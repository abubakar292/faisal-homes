# FAISAL HOMES — Project Status

Last updated: 22 November 2026 · Version 2.0.0 (Supabase + Vercel, fresh database)

## Version 2.0.0: Supabase + Vercel
The software calculations, screens and reports are unchanged. What changed is where it runs and how people sign in:

| Before (1.1.0) | Now (2.0.0) |
|---|---|
| PostgreSQL on the office PC, 5 upgrade files | Supabase PostgreSQL, one fresh file `supabase/schema.sql` run in the SQL Editor |
| Username + password stored by the app, sessions table | **Supabase Auth**: email + password. The admin creates staff logins on the Users page (no emails sent) |
| Documents and logo in `storage/uploads` on the PC | **Supabase Storage**, private bucket `documents`, uploads go straight from the browser, files open with 60-second links |
| One Node process on the PC, Windows installer | **Vercel**: static web app + the API as a serverless function (`api/index.js`, `vercel.json`) |
| Backup/restore inside the app (`pg_dump`) | Supabase backups (Pro plan) + "Export all data (Excel)". In-app backup for Supabase: next step |

Also in 2.0.0:
- Every table has row level security and no access for Supabase's public API roles; views use `security_invoker`.
- Database timezone is set to Asia/Karachi by the schema (overdue logic uses the Pakistan date).
- The old "Land Purchase" expense type no longer exists: payments to land owners can only be made with Pay Land Owner (this also
  closes the gap where an admin could create such a category and bypass the land ledger).
- `npm run check`: read-only check of a Supabase setup.
- One package for the whole project (`package.json` at the top, one `npm install`), so Vercel builds it from the repository root
  with its standard Vite preset.

Removed: `INSTALL-FAISAL-HOMES.bat`, `start-windows.bat`, `Dockerfile`, `docker-compose.yml`, the 5 old migration files, the backup
service, `create-admin.js`, the demo seed and the old headless-browser smoke test (it used the old username login). All of them are
still in the git history (commit `462f39f`).

## Test evidence
- **Backend integration tests: 53/53 passing** (`npm test`): 34 in `business.test.js`, 19 in `land.test.js`. They run the real
  `supabase/schema.sql` on a temporary PostgreSQL 17 and a real HTTP server, with a stand-in for Supabase Auth (ES256-signed tokens,
  public keys, admin user API) and Supabase Storage, used through the real `@supabase/supabase-js` library. Covered:
  - **Login and users:** first-admin setup only once, Supabase logins, wrong passwords, forged/expired tokens, a login without a
    FAISAL HOMES user, disable/enable (blocked in Supabase too), password change and admin reset with "must change password",
    the last-admin rule, the CSRF header, role permissions.
  - **All earlier business rules:** land area and price, bulk plots, duplicate plot/CNIC, CNIC masking, booking with 30% + 36 monthly
    + 6 half-yearly, sequential and concurrent double-booking prevention, partial payments oldest-due-first, over-payment, future
    dates, cheque rule, payment reversal, SOLD ↔ BOOKED, schedule editing, overdue and manual late fees, charge payments, transfer
    dues check + override, transfer with fee, ledgers, cancellation with refund, expenses, financial-summary identities.
  - **Land module:** split personal/customer funding, reversals, investment totals, land ledgers.
  - **Reports and printing:** every report as JSON/Excel/PDF, receipt reprint (duplicate).
  - **Documents, logo and export:** direct-to-storage document upload, the permission check before a file opens, the token cookie for
    browser links, document type/size limits, customer photo, the logo in Storage (and on PDFs), the Excel export, and the public
    config exposing only the URL + publishable key.
- **Browser check (built-in browser, against the same local stand-ins):**
  - create administrator, then dashboard;
  - register a customer, upload a CNIC image straight to storage, and its thumbnail shows through the cookie + short-lived link;
  - PDF and Excel links work;
  - log out clears access; a wrong password is refused, the right one signs in;
  - the Settings and Backup pages render. No console errors.
- **Not yet tested against a real Supabase project and a real Vercel deployment.** Run `npm run check` with your `.env` after
  running `schema.sql`, then sign in on the Vercel address.

## Earlier test evidence (1.1.0, PostgreSQL on the office PC)
- 51/51 backend tests and 68/68 headless-browser checks passed, and PDFs were checked visually (receipt, booking confirmation,
  transfer letter, report PDFs, land statement, customer money report).

## Completed modules
| # | Module | Status |
|---|---|---|
| 1 | Design/UI: dashboard with 13 statistics, sidebar, responsive (desktop/tablet/mobile), PKR formatting (million or lakh style) | Done |
| 2 | Land management: Kanal/Marla/sq ft, editable Marla conversion (global + per land/society), seller, ownership, registry/mutation, expected saleable area, investment. **Upgraded in 1.1.0: see Module 1 below** | Done |
| 3 | Societies, blocks, streets, plots (single + bulk, decimal Marla, corner/main road/park, category, price, discount), 6 statuses, inventory filters, interactive plot map | Done |
| 4 | Customers: auto ID, CNIC validation/uniqueness, nominee, guarantor, photo + CNIC uploads, full profile with plots/schedule/payments/transfers/documents, search by name/CNIC/mobile/ID | Done |
| 5 | Booking & sales wizard with live schedule preview, booking receipt, booking confirmation PDF, double-booking protection | Done |
| 6 | Installments: monthly/quarterly/half-yearly/yearly/custom/full + balloon payments, rounding, admin schedule editor with history, partial payments, overdue & upcoming lists, WhatsApp reminder links, manual late fees | Done |
| 7 | Payments & receipts: unique numbers, 2-copy A4 receipt PDF, reprint marked DUPLICATE, history search, reversal with reason (never deleted), ledger | Done |
| 8 | Transfers: admin-only, dues verification with override reason, fee (paid now or later), witnesses, transfer letter PDF, ownership history | Done |
| 9 | Expenses: 12 categories with cost types, attachments, land/society links, edit (non-financial fields), cancellation with reversal, daily/monthly/yearly report | Done |
| 10 | Accounting & reports: financial summary (installment-method profit), collections, daily/monthly cash, overdue, upcoming, sales, receivables, expense summary/list, inventory, customer ledger, plot ledger. All export to Excel and PDF | Done |
| 11 | Documents linked to customer/plot/land/booking/transfer/expense, protected download, soft delete | Done |
| 12 | Roles (Admin/Accountant/Sales/Viewer), Supabase Auth login, idle logout, CSRF header, security headers, audit log with before/after data, CNIC masking | Done (2.0.0) |
| 13 | Backups: Supabase backups + full Excel export. In-app backup/restore for Supabase | Excel export done; in-app backup planned |
| 14 | Deployment: Supabase + Vercel (`supabase/schema.sql`, `vercel.json`, `api/index.js`), setup check, cost breakdown | Done (2.0.0), not yet run on a real Vercel project |

## Module 1: Land Management upgrade (Version 1.1.0, 22 Nov 2026) — COMPLETE, all tests passing
Scope: PROPERTY → LAND MANAGEMENT only. No other module was rebuilt. The changes outside Land are listed under "Touch points" below.

**Add Land form** (three cards):
- **A. Original land owner:** name and contact number (required); CNIC and address (optional); father name and location.
- **B. Measurement:** Kanal, Marla and additional sq ft. Total area in Marla and in sq ft is shown live, using the conversion from Settings
  (it can be changed per land).
- **C. Purchase:**
  - Purchase date (not in the future), rate per Marla and purchased by / responsible person are required.
  - The total purchase price is calculated automatically as total Marla × rate.
  - Agreement details, registry/mutation details, revenue record numbers and notes.
  - Optional additional purchase expenses (stamp duty, registry fee…), paid from a named investor's personal investment.
- **Manual price:** only an Admin can override the total price, and a reason is required. Every price change (manual, or recalculated after
  a rate or area edit) is stored in `land_price_adjustments` and the audit log. The price cannot be set below what has already been paid.
- Each land gets an ID: `FH-L-00001`.

**Land page:**
- Summary cards: Total Lands, Total Area, Purchase Value, Total Paid, Remaining Payable, Personal Investment, Customer Money Used.
- The land list can be filtered by All lands, Payment remaining or Fully paid, and exported to Excel or PDF.

**Land detail page:**
- Money summary: price, paid, remaining payable, additional expenses, total land investment, and how much was funded by personal
  investment versus customer money.
- Payments table with the source of each payment, additional expenses, price-change history and documents.

**VIEW LAND LEDGER:**
- Header: owner, contact, area, rate, price, paid, remaining, additional expenses and total investment.
- Full history columns: Date, Transaction ID, Description, Amount, Payment Source, Method, Reference, Entered By, plus a running Remaining
  Payable balance.
- Reversed or cancelled entries stay visible, marked as such.
- Export to Excel or PDF, and Print.

**PAY LAND OWNER:**
- **Payment source is mandatory.**
  - (A) *Owner's personal investment (new money)*: investor name, date, method, reference, notes. This automatically creates a capital
    contribution (`FH-INV-…`) and a cash-in entry.
  - (A2) *Balance of an earlier personal investment*.
  - (B) *Customer advance / recovery*: pick the original receipt. Customer, booking and plot are linked automatically, and the amount
    still available is shown.
- Split sources are allowed and must add up exactly to the payment.
- Partial and multiple payments are allowed.
- A payment above the remaining payable is refused. An Admin may record an *authorized additional payment* with a written authorization
  note. It does not reduce the payable; it is added to the total land investment.
- Cheque payments need a cheque number. Dates cannot be in the future, and a source cannot be dated after the payment.

**Reversals (never deletes):**
- A land payment is reversed with a reason and the user's name. The amount returns to the payable, and its customer-money and investment
  allocations are released.
- The new investment entered with that payment can be reversed too (optional).
- A customer receipt cannot be reversed while its money is used for land; reverse the land payment first.
- A personal investment cannot be reversed while it is in use.
- Cancelling a land expense in Expenses releases its funding.

**Personal Investment page** (sidebar → Money):
- Totals: invested, used for land purchase, used for land expenses, remaining, development expenses paid, received from customers,
  customer money used for land, customer money not used, and cash in business.
- Every investment entry, with what it was used for. Add investment; reverse an unused one.

**Reports** (Reports → "Land purchase", all with Excel + PDF):
- Land Statement (individual land ledger)
- Owner-wise Land Payments
- Land Payment History (period, optional land)
- Outstanding Land Payments
- Personal Investment
- Customer Money Used for Land (receipt-by-receipt, with customer, booking and plot)

**Accounting rules enforced:**
- Payments to land owners are no longer expenses. They have their own `land_payments` table and `LAND_PAYMENT` cash-book entries.
  The financial summary shows them under land, and "Total Expenses" now excludes them; the dashboard card says so.
- No duplicate cash: customer money used for land creates **no** new cash entry (it was already received), only an allocation record
  (`fund_allocations`).
- Allocation limits:
  - A receipt can never be allocated beyond its amount.
  - For a cancelled booking, the refunded money is also excluded.
  - Rows are locked (`FOR UPDATE`), so two users cannot allocate the same money at once.
- Customer money is never counted as personal investment. The customer's own account, receipts and balance are unchanged.

**Land tests (`server/test/land.test.js`, 20 checks).** Each test starts from a database made by the *previous* version, with a land and
old seller payments, then runs the real upgrade. It covers:
- The upgrade itself: a safety backup is made first; the old price, payments and expenses are preserved; old payments appear in the ledger.
- Required fields and permissions; several lands with automatic price.
- Manual price (Admin only, with a reason and an audit record) and recalculation.
- A split payment (2,000,000 personal + 1,500,000 customer).
- Rejections: sources not adding up, a missing investor, over-allocating a receipt, the wrong customer, a viewer trying to pay, and
  failed attempts leaving nothing behind.
- No duplicate cash entries (checked in the daily cash report).
- Partial and multiple payments, using an existing investment, an investment dated after the payment, over-payment, an additional payment
  (refused for an accountant, allowed for an Admin with a note), and a fully paid land refusing more.
- Using the same receipt twice in one payment.
- Reversals and their permission/reason rules; a receipt blocked while used; an investment blocked while used.
- A land expense paid from customer money, then cancelled.
- Investment totals with no double counting.
- Every ledger ending at its remaining payable, rows in date order, and the running balance correct on every row.
- Summary cards equal to the sum of lands.
- The financial summary.
- All land reports as JSON, Excel and PDF.
- Viewer read-only access.

**Existing data after the upgrade:**
- Lands keep their exact purchase price. Because it was typed in by hand, it is marked "manual (entered before the land ledger upgrade)",
  and the rate per Marla is calculated from it.
- Old seller payments recorded as "Land Purchase" expenses still count as paid. They are shown in the ledger as "recorded before upgrade",
  with source "not recorded"; they are **not** counted as personal investment.
- The old category is retired for new entries; its records are kept.
- Before upgrading an existing database, a safety backup (`…-pre-migration.zip`) is made automatically. If it cannot be made, the upgrade
  is not applied and the app explains why.

**Touch points outside Land (small, necessary):**
- Financial summary, monthly cash report and dashboard card: land payments are shown separately, not as expenses.
- Receipt reversal: blocked while the receipt's money is used for land.
- Expense cancellation: releases funding.
- Backup page: shows the "Safety (before upgrade)" kind.
- Demo data: now uses land payments.
- PDF exporter: long column headers now wrap. This also fixed an old bug where the TOTAL row showed "undefined-undefined-TOTAL" in PDF
  reports whose first column is a date, such as Collections.

**Still to do for land:**
- Development expenses entered in the Expenses module are shown as a total only; they do not yet record a funding source. That belongs
  to the Expenses module and was out of scope.
- Payments made before the upgrade have no recorded source. They can stay as they are; the reports show them separately.

## Version 1.0.1 (22 Nov 2026): Windows one-click installer (removed in 2.0.0)
- `INSTALL-FAISAL-HOMES.bat`: finds/extracts the zip, installs Node.js 22 and PostgreSQL 16 if missing (signature-checked), creates a
  limited database user + database, writes a protected `.env`, installs components, runs migrations, makes the first backup, runs the
  self-test on a temporary database, creates a Desktop shortcut and starts the app.
- Tested in the build environment: the installer's database commands, a limited (non-superuser) database user with real password login,
  migrations, the backup command and the full 31-check self-test as that user (31/31 passed, including backup/restore), plus the startup
  error messages. **The Windows PowerShell part itself could not be executed in the build environment** (no Windows or PowerShell
  available), so the first run on a real PC is its first full test. If any step stops, its red message and the log file say why.
- App: clearer start-up errors (database not running, wrong password, port in use), `npm run backup` command, databases always created as
  UTF-8, local-only access by default (`HOST=127.0.0.1`), Desktop icon.

## Database changes
**2.0.0:** everything below is merged into one fresh file, `supabase/schema.sql` (recorded as `001_initial`). Changes from 1.1.0:
- `users`: `auth_user_id` (Supabase Auth) + `email` replace `username` + `password_hash`; the `sessions` table is gone.
- `expense_categories.cost_type` allows only PROJECT and OPERATING (the retired LAND_PAYMENT type and its "Land Purchase" category are gone).
- `documents.stored_name` is the Storage path and is unique. `settings.branding` points to the logo in Storage. No `backup` setting.
- Row level security on all tables, views with `security_invoker`, public API roles revoked, `documents` storage bucket,
  database timezone Asia/Karachi.

History of the 1.x files (removed in 2.0.0):
- `001_init.sql`: all tables, constraints and indexes (incl. one-active-booking-per-plot unique index)
- `002_reference_data.sql`: counters, expense categories, default settings
- `003_views.sql`: `v_booking_finance`, `v_charge_finance` (live balances)
- `004_land_saleable_area.sql`: `lands.saleable_marla` for cost-per-Marla while partly plotted
- `005_land_ledger.sql` (1.1.0, additive only; no existing row deleted or changed except as described):
  - New columns on `lands`: `land_code`, `rate_per_marla`, `price_is_manual`, `price_adjust_reason`, `purchased_by`, `agreement_details`,
    `registry_details`.
  - New tables: `land_price_adjustments`, `land_payments`, `capital_contributions`, `fund_allocations`.
  - New cash-book entry types and `ledger_entries.land_id`.
  - The "Land Purchase" category is retired for new entries; the new category is "Land Purchase Expenses".
  - New views: `v_capital_balance`, `v_receipt_funds`, `v_land_finance`.
  - Tested on a database made by version 1.0.1 (automated test, plus the demo database).

## Known limitations / next phase
0. **Supabase/Vercel specifics (2.0.0):**
   - The in-app backup/restore is not rebuilt yet (use Supabase backups + the Excel export).
   - Failed sign-ins are logged by Supabase (Authentication → Logs), not in the app's audit log.
   - A password reset does not sign out a device that is already signed in; disabling the account does, immediately.
   - The Excel export and large reports go through a Vercel function, whose responses are limited to about 4.5 MB. Very large
     exports will need to be split later.
1. **Import from your current software / Excel**: there is no bulk import yet. Existing customers, plots and past payments must be entered
   (bookings and payments can be back-dated). An Excel import tool is the recommended next step.
2. **Urdu**: translation layer and right-to-left switching are built in, but only some labels are translated.
   Printed PDFs are English-only (Urdu PDF needs a Nastaliq font with text shaping).
3. **Plot map** is an automatic block/street grid coloured by status. It is not a drawn copy of your surveyed site plan.
   Drawing the real layout (from your existing SVG/HTML plans) would be a future enhancement.
4. **Reminders**: WhatsApp reminder buttons open a pre-written message. There are no automatic SMS/WhatsApp sends (those need a paid gateway).
5. Payments are always applied to the oldest unpaid installment. Choosing a specific installment is done by editing the schedule.
6. Changing a booking's price after booking is not a direct action. Use the schedule editor (total must equal price), or cancel and re-book.
7. Two-factor login is not implemented.

## Next steps (suggested order)
1. Run `supabase/schema.sql` on the Supabase project, deploy on Vercel, run `npm run check`, create the administrator, and test with a
   few sample records for some days.
2. Rebuild backup/restore inside the app for Supabase (download a backup file, restore from it).
3. Build the Excel import for existing customers, bookings and payment history.
4. Complete the Urdu translation.
5. Optional: drawn site-plan map, SMS gateway, multi-branch.
