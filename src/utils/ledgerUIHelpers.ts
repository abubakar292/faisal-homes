import { format, isValid, startOfDay, isBefore, addDays } from 'date-fns';
import type { Customer, Sale, Plot, Installment, DownPaymentTransaction } from '../types';
import type { LedgerRow, CustomerStatement } from './ledgerStatement';

export interface PaymentReceiptItem {
  id: string;
  date: Date;
  amount: number;
  type: 'Booking' | 'Down Payment' | 'Installment' | 'Possession';
  description: string;
  plotLabel: string;
  saleId: string;
  receiptNumber: string;
  paymentMethod: string;
  bankName: string;
  chequeNumber: string;
  notes: string;
}

export type ScheduleRowStatus = 'paid' | 'overdue' | 'due_soon' | 'upcoming';

export interface VirtualYearHeader {
  kind: 'year_header';
  id: string;
  year: number;
  count: number;
  totalDue: number;
  totalPaid: number;
  overdueCount: number;
}

export interface VirtualScheduleRow {
  kind: 'row';
  id: string;
  row: LedgerRow;
  year: number;
  monthLabel: string;
  statusKind: ScheduleRowStatus;
  semiAnnualBadge?: string;
  isSemiAnnual: boolean;
}

export type VirtualScheduleItem = VirtualYearHeader | VirtualScheduleRow;

export interface ChartTimelinePoint {
  key: string;
  dateLabel: string;
  scheduled: number;
  paid: number;
}

/**
 * Determine the visual status chip for a schedule row.
 * - Paid: green
 * - Overdue: red
 * - Due soon (within 7 days): amber
 * - Upcoming: grey
 */
export function getScheduleRowStatus(r: LedgerRow, now: Date = new Date()): ScheduleRowStatus {
  if (r.status === 'paid' || (r.amountPaid >= r.amountDue && r.amountDue > 0)) {
    return 'paid';
  }
  if (r.status === 'overdue') {
    return 'overdue';
  }
  if (r.dueDate) {
    const today = startOfDay(now);
    const dueDay = startOfDay(r.dueDate);
    if (isBefore(dueDay, today)) {
      return 'overdue';
    }
    const daysUntil = r.daysUntilDue !== undefined ? r.daysUntilDue : Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil >= 0 && daysUntil <= 7) {
      return 'due_soon';
    }
  }
  return 'upcoming';
}

/**
 * Formats a semi-annual label like "Semi-Annual 1 of 6"
 */
export function formatSemiAnnualLabel(installmentNumber: number, totalSemiAnnualCount: number): string {
  const total = totalSemiAnnualCount > 0 ? totalSemiAnnualCount : installmentNumber;
  return `Semi-Annual ${installmentNumber} of ${total}`;
}

/**
 * Consolidates all completed payment receipts for a customer.
 */
export function consolidateCustomerPaymentReceipts(
  sales: Sale[],
  plots: Plot[],
  dpTransactions: DownPaymentTransaction[],
  installments: Installment[],
  scope: 'all' | string
): PaymentReceiptItem[] {
  const activeSales = scope === 'all'
    ? sales.filter(s => s.status !== 'cancelled')
    : sales.filter(s => s.id === scope && s.status !== 'cancelled');

  const activeSaleIds = new Set(activeSales.map(s => s.id));
  const receipts: PaymentReceiptItem[] = [];

  // 1. Booking payments
  activeSales.forEach(sale => {
    const bPaid = sale.bookingAmountPaid || 0;
    if (bPaid > 0) {
      const plot = plots.find(p => p.id === sale.plotId);
      const plotLabel = plot ? `${plot.plotNumber} - ${plot.block}` : 'Plot';
      receipts.push({
        id: `receipt_booking_${sale.id}`,
        date: sale.saleDate ? new Date(sale.saleDate) : new Date(),
        amount: bPaid,
        type: 'Booking',
        description: `Booking Advance - ${plotLabel}`,
        plotLabel,
        saleId: sale.id,
        receiptNumber: sale.saleNumber ? `BK-${sale.saleNumber}` : 'Booking',
        paymentMethod: 'Cash',
        bankName: '',
        chequeNumber: '',
        notes: 'Initial booking deposit',
      });
    }
  });

  // 2. Down Payment Transactions
  dpTransactions.forEach(tx => {
    if (!activeSaleIds.has(tx.saleId)) return;
    const sale = activeSales.find(s => s.id === tx.saleId);
    const plot = plots.find(p => p.id === (tx.plotId || sale?.plotId));
    const plotLabel = plot ? `${plot.plotNumber} - ${plot.block}` : 'Plot';
    receipts.push({
      id: `receipt_dp_${tx.id}`,
      date: tx.paymentDate ? new Date(tx.paymentDate) : new Date(),
      amount: tx.amount || 0,
      type: 'Down Payment',
      description: `Down Payment - ${plotLabel}`,
      plotLabel,
      saleId: tx.saleId,
      receiptNumber: tx.receiptNumber || `DP-${tx.id.slice(0, 6)}`,
      paymentMethod: tx.paymentMethod || 'Cash',
      bankName: tx.bankName || '',
      chequeNumber: tx.chequeNumber || '',
      notes: tx.notes || '',
    });
  });

  // 3. Installments with amountPaid > 0 (excluding pure down payment installment duplicates)
  installments.forEach(inst => {
    if (!activeSaleIds.has(inst.saleId)) return;
    if (inst.type === 'down_payment') return;
    const paid = inst.amountPaid || 0;
    if (paid > 0) {
      const sale = activeSales.find(s => s.id === inst.saleId);
      const plot = plots.find(p => p.id === (inst.plotId || sale?.plotId));
      const plotLabel = plot ? `${plot.plotNumber} - ${plot.block}` : 'Plot';
      const isSemi = inst.type === 'semi_annual';
      receipts.push({
        id: `receipt_inst_${inst.id}`,
        date: inst.paymentDate ? new Date(inst.paymentDate) : (inst.dueDate ? new Date(inst.dueDate) : new Date()),
        amount: paid,
        type: 'Installment',
        description: isSemi ? `Semi-Annual #${inst.installmentNumber} - ${plotLabel}` : `Installment #${inst.installmentNumber} - ${plotLabel}`,
        plotLabel,
        saleId: inst.saleId,
        receiptNumber: inst.receiptNumber || `INST-${inst.id.slice(0, 6)}`,
        paymentMethod: inst.paymentMethod || 'Cash',
        bankName: inst.bankName || '',
        chequeNumber: inst.chequeNumber || '',
        notes: inst.notes || '',
      });
    }
  });

  // 4. On Possession payments if recorded as Paid on sale
  activeSales.forEach(sale => {
    if (sale.onPossessionStatus === 'Paid' && (sale.onPossessionAmount || 0) > 0) {
      const plot = plots.find(p => p.id === sale.plotId);
      const plotLabel = plot ? `${plot.plotNumber} - ${plot.block}` : 'Plot';
      receipts.push({
        id: `receipt_poss_${sale.id}`,
        date: sale.onPossessionPaidDate ? new Date(sale.onPossessionPaidDate) : (sale.saleDate ? new Date(sale.saleDate) : new Date()),
        amount: sale.onPossessionAmount || 0,
        type: 'Possession',
        description: `Possession Clearance - ${plotLabel}`,
        plotLabel,
        saleId: sale.id,
        receiptNumber: 'POSS-PAID',
        paymentMethod: 'Cash',
        bankName: '',
        chequeNumber: '',
        notes: sale.onPossessionNotes || 'Possession payment cleared',
      });
    }
  });

  // Sort receipts descending (newest first)
  return receipts.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Builds virtualized schedule items grouped by year with month timeline markers.
 */
export function buildVirtualScheduleList(
  rows: LedgerRow[],
  semiAnnualCountsBySale: Record<string, number>
): VirtualScheduleItem[] {
  if (rows.length === 0) return [];

  // Group by year
  const yearMap = new Map<number, LedgerRow[]>();
  rows.forEach(r => {
    const d = r.dueDate ? new Date(r.dueDate) : new Date();
    const y = isValid(d) ? d.getFullYear() : new Date().getFullYear();
    if (!yearMap.has(y)) {
      yearMap.set(y, []);
    }
    yearMap.get(y)!.push(r);
  });

  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
  const items: VirtualScheduleItem[] = [];

  sortedYears.forEach(year => {
    const yearRows = yearMap.get(year)!;
    // Sort rows within the year by due date ascending
    yearRows.sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));

    let totalDue = 0;
    let totalPaid = 0;
    let overdueCount = 0;

    yearRows.forEach(r => {
      totalDue += r.amountDue || 0;
      totalPaid += r.amountPaid || 0;
      if (getScheduleRowStatus(r) === 'overdue') {
        overdueCount++;
      }
    });

    // Add Year Header item
    items.push({
      kind: 'year_header',
      id: `year_header_${year}`,
      year,
      count: yearRows.length,
      totalDue,
      totalPaid,
      overdueCount,
    });

    // Add row items
    yearRows.forEach(r => {
      const d = r.dueDate ? new Date(r.dueDate) : new Date();
      const monthLabel = isValid(d) ? format(d, 'MMM') : '—';
      const isSemi = r.type === 'semi_annual';
      const statusKind = getScheduleRowStatus(r);

      // Extract installment number from label if possible
      let semiAnnualBadge: string | undefined;
      if (isSemi) {
        const match = r.label.match(/\d+/);
        const instNum = match ? parseInt(match[0], 10) : 1;
        const totalSemi = semiAnnualCountsBySale[r.id] || semiAnnualCountsBySale['default'] || 0;
        semiAnnualBadge = formatSemiAnnualLabel(instNum, totalSemi);
      }

      items.push({
        kind: 'row',
        id: `row_${r.id}`,
        row: r,
        year,
        monthLabel,
        statusKind,
        semiAnnualBadge,
        isSemiAnnual: isSemi,
      });
    });
  });

  return items;
}

/**
 * Builds cumulative scheduled vs paid time series points for Recharts.
 */
export function buildChartTimeline(
  sales: Sale[],
  statement: CustomerStatement,
  receipts: PaymentReceiptItem[]
): ChartTimelinePoint[] {
  if (sales.length === 0) return [];

  // 1. Gather all events:
  // - Scheduled events: sale down payment / booking (at sale date), each installment (at due date)
  // - Paid events: each receipt (at receipt date)
  interface TimeEvent {
    date: Date;
    scheduledDelta: number;
    paidDelta: number;
  }

  const events: TimeEvent[] = [];

  sales.forEach(sale => {
    if (sale.status === 'cancelled') return;
    const sDate = sale.saleDate ? new Date(sale.saleDate) : new Date();
    // At sale start: booking + expected down payment are due
    const initialExpected = (sale.bookingAmountPaid || 0) + (sale.downPaymentAmount || sale.downPayment || 0);
    if (initialExpected > 0) {
      events.push({
        date: sDate,
        scheduledDelta: initialExpected,
        paidDelta: 0,
      });
    }
  });

  // Installments scheduled
  statement.rows.forEach(r => {
    if (r.dueDate) {
      events.push({
        date: new Date(r.dueDate),
        scheduledDelta: r.amountDue || 0,
        paidDelta: 0,
      });
    }
  });

  // Payments received
  receipts.forEach(rc => {
    events.push({
      date: new Date(rc.date),
      scheduledDelta: 0,
      paidDelta: rc.amount || 0,
    });
  });

  if (events.length === 0) return [];

  // Sort events chronologically
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Determine earliest and latest month
  const minDate = events[0].date;
  const maxDate = events[events.length - 1].date;

  const startYear = minDate.getFullYear();
  const startMonth = minDate.getMonth();
  const endYear = maxDate.getFullYear();
  const endMonth = maxDate.getMonth();

  const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  const monthKeys: { key: string; dateLabel: string; endOfMonth: Date }[] = [];

  for (let m = 0; m < totalMonths; m++) {
    const curYear = startYear + Math.floor((startMonth + m) / 12);
    const curMonth = (startMonth + m) % 12;
    const dateObj = new Date(curYear, curMonth, 1);
    const endOfMonth = new Date(curYear, curMonth + 1, 0, 23, 59, 59, 999);
    monthKeys.push({
      key: `${curYear}-${String(curMonth + 1).padStart(2, '0')}`,
      dateLabel: format(dateObj, "MMM ''yy"),
      endOfMonth,
    });
  }

  // Calculate cumulative scheduled and paid at each month's end
  const points: ChartTimelinePoint[] = [];
  let cumScheduled = 0;
  let cumPaid = 0;
  let eventIndex = 0;

  monthKeys.forEach(({ key, dateLabel, endOfMonth }) => {
    while (eventIndex < events.length && events[eventIndex].date <= endOfMonth) {
      cumScheduled += events[eventIndex].scheduledDelta;
      cumPaid += events[eventIndex].paidDelta;
      eventIndex++;
    }

    points.push({
      key,
      dateLabel,
      scheduled: cumScheduled,
      paid: cumPaid,
    });
  });

  // In case events occurred past the last bucket
  while (eventIndex < events.length) {
    cumScheduled += events[eventIndex].scheduledDelta;
    cumPaid += events[eventIndex].paidDelta;
    eventIndex++;
  }

  if (points.length > 0) {
    points[points.length - 1].scheduled = Math.max(points[points.length - 1].scheduled, cumScheduled);
    points[points.length - 1].paid = Math.max(points[points.length - 1].paid, cumPaid);
  }

  return points;
}
