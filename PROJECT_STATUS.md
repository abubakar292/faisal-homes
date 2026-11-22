# FAISAL HOMES — Project Status

Last updated: 22 November 2026 · Version 1.1.0 (Module 1: Land Management upgrade)

## Test evidence
- **Backend integration tests:** 51/51 passing (`npm test` in `server/`): 31 for the original modules (`business.test.js`) and
  20 for the land upgrade (`land.test.js`, listed under Module 1 below). The original 31 were updated only where the land rules changed (seller
  payments now go through Pay Land Owner; the old "Land Purchase" expense category is refused). They run against a real PostgreSQL 16 database and HTTP server,
  covering setup/login/lockout/CSRF, role permissions, land area conversion, bulk plots, duplicate plot/CNIC, CNIC masking, booking with
  30% + 36 monthly + 6 half-yearly, **sequential and concurrent double-booking prevention**, partial payments (oldest due first), over-payment,
  future dates, cheque reference rule, **payment reversal**, SOLD ↔ BOOKED status, **schedule editing**, overdue detection, late fees
  (never automatic), charge payments, **transfer dues check + override**, transfer with fee, ledger balances, **cancellation with refund**
  and forfeiture, re-selling the plot, expenses + cancellation, financial-summary identities, every report as JSON/Excel/PDF, receipt reprint
  (duplicate), documents upload/permissions/soft delete, session expiry, and **backup + restore** (data and sessions).
- **Browser test:** 68/68 checks passing in headless Chrome (`tests/e2e/smoke.js`). It opens every page and every report, then runs
  the land workflows (summary cards, Add Land with automatic price + purchase expense, over-payment refusal, split-funded Pay Land Owner,
  land ledger balance, payment reversal, add investment, land statement Excel/PDF), registration, the booking wizard, payment, partial payment and reversal, over-payment refusal, schedule editor, expense, bulk plots, transfer dues
  check, reservation, backup, the mobile layout and viewer permissions. No console, page or server errors.
- **PDFs checked visually:** receipt (customer + office copy), booking confirmation with schedule, transfer letter, report PDFs,
  land purchase statement, customer money utilization report.

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
| 12 | Roles (Admin/Accountant/Sales/Viewer), bcrypt, server sessions with idle timeout, login lockout, CSRF header, security headers, audit log with before/after data, CNIC masking | Done |
| 13 | Backups: automatic daily + catch-up at startup, manual, download, restore (stored or uploaded), safety backup before restore, off-site copy folder, full Excel export | Done |
| 14 | Deployment: Windows batch setup/start, LAN access, auto-start, Docker + Caddy for VPS, cost breakdown | Done (Docker files not executed in build environment) |

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

## Version 1.0.1 (22 Nov 2026): Windows one-click installer
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
1. Install on the office PC with your real company details and logo, and test with demo data for a few days.
2. Build the Excel import for existing customers, bookings and payment history.
3. Complete the Urdu translation.
4. Optional: drawn site-plan map, SMS gateway, multi-branch.
