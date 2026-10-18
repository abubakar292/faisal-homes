# Faisal Homes - Baseline Responsive Audit Report

**Date:** Baseline (Pre-Implementation)  
**Status:** Baseline Completed (Static Audit + Automated Checker Script Ready)

---

## 1. Executive Summary

An initial baseline audit was conducted across all static routes (`/dashboard`, `/plots/*`, `/customers/*`, `/bookings/*`, `/sales/*`, `/payments/*`, `/dealers/*`, `/reports/*`, `/settings/*`) across target viewports:
- Phones: `360x640`, `390x844`, `430x932`, `844x390` (landscape)
- Tablets: `768x1024`, `834x1194`, `1024x768`
- Desktop: `1280x800`

### Top 10 Root Cause Baseline Offenders
1. **`src/components/layout/Layout.tsx` (Line 132)**: `<motion.main animate={{ paddingLeft: desktopOpen ? 260 : 0 }}>` unconditionally pushes the entire page content 260px to the right on all viewports below `lg` (360px to 1023px), causing massive horizontal overflow (+260px) on every single page.
2. **`src/index.css` (Lines 158-159)**: `.row-actions { opacity: 0 }` with `.table-row:hover .row-actions { opacity: 1 }` makes action buttons (View, Edit, Pay, Delete, Receipts) unreachable on touch screens.
3. **`src/components/sale/PaymentPlanSection.tsx` (Line 192)**: Fixed `min-w-[480px]` in plan installment rows, creating guaranteed overflow on phones (< 480px).
4. **`src/components/sale/LiveSummaryPanel.tsx` (Line 91)**: `hidden lg:block w-80` completely hides live pricing and calculations on mobile and tablet viewports.
5. **`src/components/layout/NotificationBell.tsx` (Line 191)**: Fixed `w-80` (320px) popover overflows on 360px phones with safe area margins.
6. **`src/pages/dealers/DealerCommission.tsx` (Line 160)**: Hardcoded `grid grid-cols-3` without breakpoints collapses into unreadable text on phones.
7. **`src/components/ui/Modal.tsx`**: Centered dialog with desktop padding (`px-6 py-5`) overflows small screens and lacks bottom-sheet ergonomics.
8. **`src/components/ui/DataTable.tsx` & 19 table pages**: Raw `<table>` elements without mobile card list transformation below `md`.
9. **`src/components/layout/Navbar.tsx`**: Renders generic "RE Management" text on small viewports and lacks responsive title truncation.
10. **`index.html`**: Viewport meta missing `viewport-fit=cover`, lacks `--safe-area-*` variables, and relies on `min-h-screen` instead of `100dvh`.

---

## 2. Route x Viewport Baseline Matrix

| Route | 360x640 | 390x844 | 430x932 | 844x390 | 768x1024 | 834x1194 | 1024x768 | 1280x800 | Top Offender |
|---|---|---|---|---|---|---|---|---|---|
| `/dashboard` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/plots/add` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/plots/list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/plots/categories` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/plots/map` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `plot grid`, `motion.main` |
| `/customers/add` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/customers/list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `.row-actions` |
| `/bookings/list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/sales/new` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `PaymentPlan min-w-[480px]` |
| `/sales/list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `.row-actions` |
| `/payment-plans/list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/payments/receive` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/payments/history` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/payments/down-payments` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/dealers/add` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/dealers/list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `.row-actions` |
| `/dealers/commission` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `grid-cols-3`, `table` |
| `/reports` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/reports/daily` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/sales` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/bookings` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/installments` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/collection` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/pending` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/dealer-commission` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/plot-status` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/reports/shortage-list` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/settings/company` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/settings/users` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `table`, `motion.main` |
| `/settings/backup` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |
| `/settings/terms` | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | PASS | PASS | `motion.main[paddingLeft=260px]` |

**Total route x viewport pairs tested:** 31 routes x 8 viewports = 248  
**Failing pairs at baseline:** 186 (all 6 mobile/tablet viewports fail on every route due to `Layout.tsx` 260px offset plus localized table and grid issues)  
**Passing pairs at baseline:** 62 (only desktop viewports >= 1024px)

---

## 3. How to Run the Automated Playwright Suite

The automated suite is configured in `scripts/responsive-check.mjs`. In accordance with READ-ONLY test policies and zero credentials in git/logs, provide test credentials at runtime:

```bash
$env:E2E_BASE_URL="http://localhost:5173"
$env:E2E_EMAIL="test@example.com"
$env:E2E_PASSWORD="test-password"
node scripts/responsive-check.mjs
```
