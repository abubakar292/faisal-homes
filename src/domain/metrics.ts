import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type {
  Customer,
  Sale,
  Plot,
  Installment,
  DownPaymentTransaction,
  DealerCommission,
  PlotStatus,
} from '../types';

/**
 * The official business timezone for Faisal Homes.
 * All daily and date-range metrics are evaluated with inclusive boundaries in this timezone.
 */
export const KARACHI_TIMEZONE = 'Asia/Karachi';

// ─── Timezone Date Boundary Utilities ──────────────────────────────────────────

/**
 * Computes the inclusive start of a calendar day (00:00:00.000) in Asia/Karachi.
 */
export function startOfDayKarachi(date: Date | string | number): Date {
  const d = new Date(date);
  const zoned = toZonedTime(d, KARACHI_TIMEZONE);
  const y = zoned.getFullYear();
  const m = zoned.getMonth();
  const day = zoned.getDate();
  return fromZonedTime(new Date(y, m, day, 0, 0, 0, 0), KARACHI_TIMEZONE);
}

/**
 * Computes the inclusive end of a calendar day (23:59:59.999) in Asia/Karachi.
 */
export function endOfDayKarachi(date: Date | string | number): Date {
  const d = new Date(date);
  const zoned = toZonedTime(d, KARACHI_TIMEZONE);
  const y = zoned.getFullYear();
  const m = zoned.getMonth();
  const day = zoned.getDate();
  return fromZonedTime(new Date(y, m, day, 23, 59, 59, 999), KARACHI_TIMEZONE);
}

/**
 * Checks if a given timestamp falls within [startDate, endDate] inclusive in Asia/Karachi.
 */
export function isDateInRangeKarachi(
  date: Date | string | number | null | undefined,
  start: Date | string | number,
  end: Date | string | number
): boolean {
  if (!date) return false;
  const target = new Date(date).getTime();
  const startBound = startOfDayKarachi(start).getTime();
  const endBound = endOfDayKarachi(end).getTime();
  return target >= startBound && target <= endBound;
}

/**
 * Checks if a given timestamp falls on "today" in Asia/Karachi.
 */
export function isDateTodayKarachi(
  date: Date | string | number | null | undefined,
  now: Date = new Date()
): boolean {
  if (!date) return false;
  const target = new Date(date).getTime();
  const startToday = startOfDayKarachi(now).getTime();
  const endToday = endOfDayKarachi(now).getTime();
  return target >= startToday && target <= endToday;
}

/**
 * Returns integer days overdue for an installment in Asia/Karachi.
 * Returns 0 if not overdue.
 */
export function getDaysOverdueKarachi(
  dueDate: Date | string | number | null | undefined,
  now: Date = new Date()
): number {
  if (!dueDate) return 0;
  const dueDayStart = startOfDayKarachi(dueDate).getTime();
  const todayStart = startOfDayKarachi(now).getTime();
  if (todayStart <= dueDayStart) return 0;
  return Math.round((todayStart - dueDayStart) / (1000 * 60 * 60 * 24));
}

/**
 * Returns integer days until an installment is due in Asia/Karachi.
 * Returns negative if past due.
 */
export function getDaysUntilDueKarachi(
  dueDate: Date | string | number | null | undefined,
  now: Date = new Date()
): number {
  if (!dueDate) return 0;
  const dueDayStart = startOfDayKarachi(dueDate).getTime();
  const todayStart = startOfDayKarachi(now).getTime();
  return Math.round((dueDayStart - todayStart) / (1000 * 60 * 60 * 24));
}

// ─── Installment Predicates & Helpers ──────────────────────────────────────────

/**
 * Computes exact outstanding balance on an installment.
 */
export function getInstallmentOutstanding(inst: Installment): number {
  const due = Number(inst.amountDue) || 0;
  const paid = Number(inst.amountPaid) || 0;
  return Math.max(0, due - paid);
}

/**
 * Determines if an installment is overdue.
 * An installment is overdue if it is not a pure down payment row,
 * has remaining outstanding balance > 0, and its due date is strictly before today in Karachi.
 */
export function isInstallmentOverdue(inst: Installment, now: Date = new Date()): boolean {
  if (inst.type === 'down_payment') return false;
  const out = getInstallmentOutstanding(inst);
  if (out <= 0) return false;
  if (inst.status === 'overdue') return true;
  if (!inst.dueDate) return false;
  const dueStart = startOfDayKarachi(inst.dueDate).getTime();
  const todayStart = startOfDayKarachi(now).getTime();
  return dueStart < todayStart;
}

/**
 * Determines if an installment is due soon (within 7 calendar days).
 */
export function isInstallmentDueSoon(inst: Installment, now: Date = new Date()): boolean {
  if (inst.type === 'down_payment') return false;
  const out = getInstallmentOutstanding(inst);
  if (out <= 0) return false;
  if (isInstallmentOverdue(inst, now)) return false;
  const days = getDaysUntilDueKarachi(inst.dueDate, now);
  return days >= 0 && days <= 7;
}

/**
 * Determines if an installment is pending (future or today with outstanding balance).
 */
export function isInstallmentPending(inst: Installment, now: Date = new Date()): boolean {
  if (inst.type === 'down_payment') return false;
  const out = getInstallmentOutstanding(inst);
  if (out <= 0) return false;
  return !isInstallmentOverdue(inst, now);
}

/**
 * Determines if an installment is fully paid.
 */
export function isInstallmentFullyPaid(inst: Installment): boolean {
  if (inst.type === 'down_payment') return false;
  const due = Number(inst.amountDue) || 0;
  const paid = Number(inst.amountPaid) || 0;
  return (due > 0 && paid >= due) || (due === 0 && inst.status === 'paid');
}

/**
 * Determines if an installment is partially paid.
 */
export function isInstallmentPartiallyPaid(inst: Installment): boolean {
  if (inst.type === 'down_payment') return false;
  const due = Number(inst.amountDue) || 0;
  const paid = Number(inst.amountPaid) || 0;
  return paid > 0 && paid < due;
}

// ─── Metrics Types ─────────────────────────────────────────────────────────────

export interface CollectionMetrics {
  total: number;
  bookingAmount: number;
  downPaymentAmount: number;
  installmentsAmount: number;
  possessionAmount: number;
  transactionCount: number;
}

export interface OverdueMetrics {
  count: number;
  amount: number;
  maxDaysOverdue: number;
  installmentIds: string[];
}

export interface PendingMetrics {
  count: number;
  amount: number;
}

export interface DueSoonMetrics {
  count: number;
  amount: number;
}

export interface PartialPaymentsMetrics {
  count: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface PlotCountMetrics {
  available: number;
  booked: number;
  sold: number;
  reserved: number;
  cancelled: number;
  total: number;
}

export interface SalesTotalMetrics {
  grossPrice: number;
  discount: number;
  finalPrice: number;
  activeCount: number;
  cancelledCount: number;
}

export interface CommissionMetrics {
  earned: number;
  paid: number;
  pending: number;
}

export interface DownPaymentMetrics {
  expected: number;
  received: number;
  remaining: number;
  pendingCount: number;
  completeCount: number;
}

export interface EnterpriseMetrics {
  collectedToday: CollectionMetrics;
  receivables: number;
  overdue: OverdueMetrics;
  pending: PendingMetrics;
  dueSoon: DueSoonMetrics;
  partialPayments: PartialPaymentsMetrics;
  plots: PlotCountMetrics;
  sales: SalesTotalMetrics;
  commissions: CommissionMetrics;
  downPayments: DownPaymentMetrics;
}

// ─── Metric Calculators (Single Source of Truth) ───────────────────────────────

/**
 * Helper returning the set of non-cancelled active sale IDs.
 */
export function getActiveSaleIds(sales: Sale[]): Set<string> {
  const set = new Set<string>();
  sales.forEach(s => {
    if (s.status !== 'cancelled') {
      set.add(s.id);
    }
  });
  return set;
}

/**
 * Computes total collections across booking advances, down payments, installments, and possession payments.
 * Optionally filtered by a date range in Asia/Karachi.
 */
export function computeTotalCollected(
  sales: Sale[],
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[],
  dateRange?: { start: Date | string; end: Date | string }
): CollectionMetrics {
  const activeSaleIds = getActiveSaleIds(sales);
  const activeSales = sales.filter(s => activeSaleIds.has(s.id));

  let bookingAmount = 0;
  let downPaymentAmount = 0;
  let installmentsAmount = 0;
  let possessionAmount = 0;
  let transactionCount = 0;

  // 1. Booking collections (recorded on sale creation)
  activeSales.forEach(sale => {
    const bPaid = Number(sale.bookingAmountPaid) || 0;
    if (bPaid > 0) {
      const sDate = sale.saleDate ? new Date(sale.saleDate) : sale.createdAt ? new Date(sale.createdAt) : null;
      if (!dateRange || (sDate && isDateInRangeKarachi(sDate, dateRange.start, dateRange.end))) {
        bookingAmount += bPaid;
        transactionCount++;
      }
    }
  });

  // 2. Down Payment transactions (prefer dpTransactions for down payments)
  dpTransactions.forEach(tx => {
    if (!activeSaleIds.has(tx.saleId)) return;
    const amt = Number(tx.amount) || 0;
    if (amt > 0) {
      if (!dateRange || isDateInRangeKarachi(tx.paymentDate, dateRange.start, dateRange.end)) {
        downPaymentAmount += amt;
        transactionCount++;
      }
    }
  });

  // 3. Regular Installment payments (excluding type === 'down_payment' to avoid double-counting)
  installments.forEach(inst => {
    if (!activeSaleIds.has(inst.saleId)) return;
    if (inst.type === 'down_payment') return;
    const paid = Number(inst.amountPaid) || 0;
    if (paid > 0) {
      const pDate = inst.paymentDate ? new Date(inst.paymentDate) : inst.dueDate ? new Date(inst.dueDate) : null;
      if (!dateRange || (pDate && isDateInRangeKarachi(pDate, dateRange.start, dateRange.end))) {
        installmentsAmount += paid;
        transactionCount++;
      }
    }
  });

  // 4. Possession payments
  activeSales.forEach(sale => {
    if (sale.onPossessionStatus === 'Paid') {
      const pAmt = Number(sale.onPossessionAmount) || 0;
      if (pAmt > 0) {
        const pDate = sale.onPossessionPaidDate ? new Date(sale.onPossessionPaidDate) : sale.saleDate ? new Date(sale.saleDate) : null;
        if (!dateRange || (pDate && isDateInRangeKarachi(pDate, dateRange.start, dateRange.end))) {
          possessionAmount += pAmt;
          transactionCount++;
        }
      }
    }
  });

  const total = bookingAmount + downPaymentAmount + installmentsAmount + possessionAmount;
  return {
    total,
    bookingAmount,
    downPaymentAmount,
    installmentsAmount,
    possessionAmount,
    transactionCount,
  };
}

/**
 * Computes total collections for "today" in Asia/Karachi.
 */
export function computeCollectedToday(
  sales: Sale[],
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[],
  now: Date = new Date()
): CollectionMetrics {
  return computeTotalCollected(sales, installments, dpTransactions, {
    start: startOfDayKarachi(now),
    end: endOfDayKarachi(now),
  });
}

/**
 * Computes total lifetime collections for a specific sale.
 */
export function computeSaleTotalCollected(
  sale: Sale,
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[]
): number {
  if (sale.status === 'cancelled') return 0;
  const metrics = computeTotalCollected([sale], installments, dpTransactions);
  return metrics.total;
}

/**
 * Computes total receivables (remaining uncollected balance across all active sales).
 * Invariant: Receivables = Total Final Price - Total Received.
 */
export function computeReceivables(
  sales: Sale[],
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[]
): number {
  const activeSaleIds = getActiveSaleIds(sales);
  let totalFinal = 0;
  let totalRec = 0;

  sales.forEach(sale => {
    if (!activeSaleIds.has(sale.id)) return;
    const fPrice = Number(sale.finalPrice || sale.totalPrice) || 0;
    const saleRec = computeSaleTotalCollected(sale, installments, dpTransactions);
    totalFinal += fPrice;
    totalRec += saleRec;
  });

  return Math.max(0, totalFinal - totalRec);
}

/**
 * Computes overdue count, amount, and max days overdue across all active property sales.
 * Must produce the identical figure across Dashboard, Pending Payments, Shortage List,
 * Notifications, and Customer Ledger.
 */
export function computeOverdueMetrics(
  sales: Sale[],
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[],
  now: Date = new Date()
): OverdueMetrics {
  const activeSaleIds = getActiveSaleIds(sales);

  let count = 0;
  let amount = 0;
  let maxDaysOverdue = 0;
  const installmentIds: string[] = [];

  // 1. Check regular installments
  installments.forEach(inst => {
    if (!activeSaleIds.has(inst.saleId)) return;
    if (inst.type === 'down_payment') return;

    if (isInstallmentOverdue(inst, now)) {
      const out = getInstallmentOutstanding(inst);
      if (out > 0) {
        count++;
        amount += out;
        installmentIds.push(inst.id);
        const days = getDaysOverdueKarachi(inst.dueDate, now);
        if (days > maxDaysOverdue) {
          maxDaysOverdue = days;
        }
      }
    }
  });

  // 2. Check remaining down payments on sales that were booked/sold before today
  sales.forEach(sale => {
    if (!activeSaleIds.has(sale.id)) return;
    const dpExpected = Number(sale.downPaymentAmount || sale.downPayment) || 0;
    const bPaid = Number(sale.bookingAmountPaid) || 0;
    const saleDPTxs = dpTransactions.filter(tx => tx.saleId === sale.id);
    const dpTxReceived = saleDPTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const dpRemaining = sale.remainingDownPayment !== undefined
      ? Number(sale.remainingDownPayment)
      : Math.max(0, dpExpected - bPaid - dpTxReceived);

    if (dpRemaining > 0) {
      const sDate = sale.saleDate ? new Date(sale.saleDate) : sale.createdAt ? new Date(sale.createdAt) : null;
      if (sDate && startOfDayKarachi(sDate).getTime() < startOfDayKarachi(now).getTime()) {
        // Down payment is overdue if sale is older than today and DP remains unpaid
        // Note: We count installments as the primary items, and add DP only if not covered by installment rows
        const hasDPInst = installments.some(i => i.saleId === sale.id && i.type === 'down_payment');
        if (!hasDPInst) {
          count++;
          amount += dpRemaining;
          const days = getDaysOverdueKarachi(sDate, now);
          if (days > maxDaysOverdue) maxDaysOverdue = days;
        }
      }
    }
  });

  return {
    count,
    amount,
    maxDaysOverdue,
    installmentIds,
  };
}

/**
 * Computes pending count and amount (installments due today or in future).
 */
export function computePendingMetrics(
  sales: Sale[],
  installments: Installment[],
  now: Date = new Date()
): PendingMetrics {
  const activeSaleIds = getActiveSaleIds(sales);
  let count = 0;
  let amount = 0;

  installments.forEach(inst => {
    if (!activeSaleIds.has(inst.saleId)) return;
    if (inst.type === 'down_payment') return;

    if (isInstallmentPending(inst, now)) {
      const out = getInstallmentOutstanding(inst);
      if (out > 0) {
        count++;
        amount += out;
      }
    }
  });

  return { count, amount };
}

/**
 * Computes due soon count and amount (due in 0 to 7 days).
 */
export function computeDueSoonMetrics(
  sales: Sale[],
  installments: Installment[],
  now: Date = new Date()
): DueSoonMetrics {
  const activeSaleIds = getActiveSaleIds(sales);
  let count = 0;
  let amount = 0;

  installments.forEach(inst => {
    if (!activeSaleIds.has(inst.saleId)) return;
    if (inst.type === 'down_payment') return;

    if (isInstallmentDueSoon(inst, now)) {
      const out = getInstallmentOutstanding(inst);
      if (out > 0) {
        count++;
        amount += out;
      }
    }
  });

  return { count, amount };
}

/**
 * Computes partial payments metrics.
 */
export function computePartialPaymentsMetrics(
  sales: Sale[],
  installments: Installment[]
): PartialPaymentsMetrics {
  const activeSaleIds = getActiveSaleIds(sales);
  let count = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  installments.forEach(inst => {
    if (!activeSaleIds.has(inst.saleId)) return;
    if (isInstallmentPartiallyPaid(inst)) {
      count++;
      totalPaid += Number(inst.amountPaid) || 0;
      totalOutstanding += getInstallmentOutstanding(inst);
    }
  });

  return { count, totalPaid, totalOutstanding };
}

/**
 * Computes plot status counts (available, booked, sold, reserved, cancelled, total).
 */
export function computePlotCounts(plots: Plot[]): PlotCountMetrics {
  let available = 0;
  let booked = 0;
  let sold = 0;
  let reserved = 0;
  let cancelled = 0;

  plots.forEach(p => {
    const s: PlotStatus = p.status;
    if (s === 'available') available++;
    else if (s === 'booked') booked++;
    else if (s === 'sold') sold++;
    else if (s === 'reserved') reserved++;
    else if (s === 'cancelled') cancelled++;
  });

  return {
    available,
    booked,
    sold,
    reserved,
    cancelled,
    total: plots.length,
  };
}

/**
 * Computes gross sales, discounts, and net final prices.
 */
export function computeSalesTotals(sales: Sale[]): SalesTotalMetrics {
  let grossPrice = 0;
  let discount = 0;
  let finalPrice = 0;
  let activeCount = 0;
  let cancelledCount = 0;

  sales.forEach(s => {
    if (s.status === 'cancelled') {
      cancelledCount++;
    } else {
      activeCount++;
      grossPrice += Number(s.totalPrice) || 0;
      discount += Number(s.discount) || 0;
      finalPrice += Number(s.finalPrice || s.totalPrice) || 0;
    }
  });

  return {
    grossPrice,
    discount,
    finalPrice,
    activeCount,
    cancelledCount,
  };
}

/**
 * Computes dealer commissions (earned, paid, pending).
 */
export function computeCommissionTotals(
  sales: Sale[],
  commissions: DealerCommission[] = []
): CommissionMetrics {
  const activeSaleIds = getActiveSaleIds(sales);
  let earned = 0;
  let paid = 0;
  let pending = 0;

  if (commissions.length > 0) {
    commissions.forEach(c => {
      const amt = Number(c.commissionAmount) || 0;
      earned += amt;
      if (c.paymentStatus === 'paid') {
        paid += amt;
      } else {
        pending += amt;
      }
    });
  } else {
    // Derive from active sales
    sales.forEach(s => {
      if (!activeSaleIds.has(s.id)) return;
      const commAmt = Number(s.dealerCommissionAmount) || 0;
      if (commAmt > 0) {
        earned += commAmt;
        if (s.dealerCommissionStatus === 'paid') {
          paid += commAmt;
        } else {
          pending += commAmt;
        }
      }
    });
  }

  return { earned, paid, pending };
}

/**
 * Computes down payment totals (expected, received, remaining).
 */
export function computeDownPaymentTotals(
  sales: Sale[],
  dpTransactions: DownPaymentTransaction[]
): DownPaymentMetrics {
  const activeSaleIds = getActiveSaleIds(sales);
  let expected = 0;
  let received = 0;
  let remaining = 0;
  let pendingCount = 0;
  let completeCount = 0;

  sales.forEach(s => {
    if (!activeSaleIds.has(s.id)) return;
    const dpExp = Number(s.downPaymentAmount || s.downPayment) || 0;
    const bPaid = Number(s.bookingAmountPaid) || 0;
    const sTxs = dpTransactions.filter(tx => tx.saleId === s.id);
    const txRec = sTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const totalRec = bPaid + txRec;
    const rem = s.remainingDownPayment !== undefined
      ? Number(s.remainingDownPayment)
      : Math.max(0, dpExp - totalRec);

    expected += dpExp;
    received += totalRec;
    remaining += rem;

    if (rem <= 0 || s.downPaymentStatus === 'complete') {
      completeCount++;
    } else {
      pendingCount++;
    }
  });

  return {
    expected,
    received,
    remaining,
    pendingCount,
    completeCount,
  };
}

/**
 * Enterprise Aggregate: Computes all domain metrics from a single call.
 */
export function computeEnterpriseMetrics(
  plots: Plot[],
  sales: Sale[],
  installments: Installment[],
  dpTransactions: DownPaymentTransaction[],
  commissions: DealerCommission[] = [],
  now: Date = new Date()
): EnterpriseMetrics {
  return {
    collectedToday: computeCollectedToday(sales, installments, dpTransactions, now),
    receivables: computeReceivables(sales, installments, dpTransactions),
    overdue: computeOverdueMetrics(sales, installments, dpTransactions, now),
    pending: computePendingMetrics(sales, installments, now),
    dueSoon: computeDueSoonMetrics(sales, installments, now),
    partialPayments: computePartialPaymentsMetrics(sales, installments),
    plots: computePlotCounts(plots),
    sales: computeSalesTotals(sales),
    commissions: computeCommissionTotals(sales, commissions),
    downPayments: computeDownPaymentTotals(sales, dpTransactions),
  };
}
