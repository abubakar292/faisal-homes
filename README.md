# Faisal Homes Management System

A Project of **SK Real Estate & Builders**

Enterprise real estate management platform for property allocations, booking workflows, installment collections, customer ledgers, dealer commission tracking, and reporting.

---

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom Design System tokens
- **Animations**: GSAP (GreenSock) + Framer Motion
- **Icons**: Lucide React
- **Backend & Database**: Firebase Authentication + Cloud Firestore
- **Charts & Reporting**: Recharts + Custom Print Engine (`printContent`)

---

## Brand & Motion Design

- **Primary Colors**:
  - Brand Navy: `#1a3c6e`
  - Accent Gold: `#e7b861`
- **Startup Splash Screen**:
  - Two-stage GSAP sequence: Faisal Homes brand mark intro followed by "A Project of SK Real Estate & Builders" attribution.
  - Smooth backdrop cross-fade with session storage awareness.
- **Section-Change Loader**:
  - Centered minimal brand loader (`RouteLoader`) powered by `MarkParts` and `BrandLoader`.
  - Seamless route change transitions managed via `LoaderContext`.

---

## Information Architecture & Routes

### Core Operations
- `/` - Operational Dashboard with financial KPIs, live collection charts, and quick actions
- `/sales/new` - Unified all-in-one sale & booking creator (supports `?mode=booking` and `?bookingId=<id>`)
- `/sales/list` - Sales master list, agreements, and installment schedule generator
- `/bookings` - Booking intake registry, confirmation flow, and receipt issuance

### Payments & Collections
- `/payments/receive` - Receive payments (installments, down payments, possession dues)
- `/payments/down-payments` - Down payment ledger and tracking
- `/payments/history` - Historical transaction records and payment verification

### Inventory & CRM
- `/plots` - Complete plot inventory and block allocations
- `/plots/add` - Add new plot records
- `/plots/categories` - Categorization and rate management
- `/plots/map` - Visual block layout and status map
- `/customers` - Customer directory, profile management, and ledger statements
- `/dealers` - Authorized dealer directory and deal associations
- `/dealers/commission` - Dealer commission ledger, payouts, and payment history

### Reports Suite (`/reports`)
Universal report interface (`ReportLayout`) with KPI count-up metrics, responsive filter controls, CSV export, and print formatting:
- `/reports` - Reports Hub overview with grouped categories
- `/reports/daily` - Daily operations, collections, and intake snapshot
- `/reports/sale` - Comprehensive sales registry and revenue metrics
- `/reports/booking` - Booking trends and status breakdown
- `/reports/installment` - Installment aging and recovery analysis
- `/reports/collection` - Cash flow and payment method distribution
- `/reports/pending` - Pending payments & defaulter aging analysis
- `/reports/shortage` - Shortage and overdue customer recovery list
- `/reports/dealer-commission` - Dealer commission accruals and disbursements
- `/reports/plot-status` - Plot inventory distribution by block and development status

### Settings & Administration
- `/settings/company` - Company profile, branding, and contact details
- `/settings/terms` - Terms & conditions templates for print agreements
- `/settings/users` - Role-based user access management
- `/settings/backup` - Cloud backup export and disaster recovery

---

## Development & Build

### Install Dependencies
```bash
npm install
```

### Run Locally
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Run Type Checking
```bash
npx tsc -b
```

---

## Safety & Standards

- **Safe Currency Formatting**: Always use `formatCurrency(amount)` (already prefixes currency unit).
- **Safe Printing**: All printable documents and receipts pass through `printContent(html, title)`.
- **ASCII Integrity**: All application source code maintains strict UTF-8 / ASCII compliance.

