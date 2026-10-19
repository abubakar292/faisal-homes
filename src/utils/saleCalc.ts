import { addMonths } from 'date-fns';
import type { Installment, InstallmentRow } from '../types';

export const INTERVAL_FREQUENCY: Record<number, string> = {
  1: 'Monthly',
  3: 'Quarterly',
  6: 'Semi-Annual',
  12: 'Annual',
};

export function calculateMarlas(size: number, sizeUnit: string): number {
  const unit = (sizeUnit || '').toLowerCase().trim();
  if (unit === 'kanal') return size * 20;
  if (unit === 'sqft' || unit === 'sq.ft' || unit === 'sq. ft' || unit === 'sq ft') {
    return size / 272.25;
  }
  return size;
}

export function calculateTotalPriceFromRate(
  rate: number,
  size: number,
  sizeUnit: string
): number {
  if (!rate || rate <= 0 || !size || size <= 0) return 0;
  const marlas = calculateMarlas(size, sizeUnit);
  return Math.round(rate * marlas);
}

export function calculateFinalPrice(totalPrice: number, discount: number = 0): number {
  return Math.max(0, (totalPrice || 0) - (discount || 0));
}

export function calculateDownPaymentAmount(finalPrice: number, percent: number): number {
  if (!finalPrice || finalPrice <= 0) return 0;
  const clampedPct = Math.max(0, Math.min(100, percent || 0));
  return Math.round((finalPrice * clampedPct) / 100);
}

export function calculateDownPaymentPercent(finalPrice: number, amount: number): number {
  if (!finalPrice || finalPrice <= 0) return 0;
  const clampedAmt = Math.max(0, Math.min(finalPrice, amount || 0));
  return Number(((clampedAmt / finalPrice) * 100).toFixed(2));
}

export function calculateRemainingDownPayment(
  downPaymentAmount: number,
  bookingPaid: number = 0
): number {
  return (downPaymentAmount || 0) - (bookingPaid || 0);
}

export function calculateSemiAnnualCount(totalMonths: number): number {
  return Math.floor(Math.max(0, totalMonths || 0) / 6);
}

export function calculateSemiAnnualTotal(
  totalMonths: number,
  semiAnnualAmount: number,
  enabled: boolean = true
): number {
  if (!enabled || !semiAnnualAmount || semiAnnualAmount <= 0) return 0;
  return calculateSemiAnnualCount(totalMonths) * semiAnnualAmount;
}

export function getRowInterval(row: { intervalMonths?: number }): number {
  return row.intervalMonths && row.intervalMonths > 0 ? row.intervalMonths : 1;
}

export function getRowCount(row: { months: number; intervalMonths?: number }): number {
  const interval = getRowInterval(row);
  return row.months > 0 ? Math.floor(row.months / interval) : 0;
}

export function isRowMisaligned(row: { months: number; intervalMonths?: number }): boolean {
  const interval = getRowInterval(row);
  return row.months > 0 && row.months % interval !== 0;
}

export interface SaleCalculationsInput {
  totalPrice: number;
  discount?: number;
  bookingPaid?: number;
  downPaymentAmount: number;
  onPossessionEnabled?: boolean;
  onPossessionAmount?: number;
  semiAnnualEnabled?: boolean;
  semiAnnualAmount?: number;
  rows: InstallmentRow[];
}

export interface SaleCalculationsResult {
  finalPrice: number;
  balanceAfterBooking: number;
  remainingDownPayment: number;
  onPossessionDeduction: number;
  remainingForInstallments: number;
  totalMonths: number;
  regularCount: number;
  semiAnnualCount: number;
  semiAnnualTotal: number;
  exactMonthlyTotal: number;
  remainingForMonthly: number;
  grandTotal: number;
  remainingToAllocate: number;
  difference: number;
  isExact: boolean;
  isRounding: boolean;
  isMismatch: boolean;
  planValid: boolean;
  hasMisalignedRow: boolean;
}

export function calculateSalePlan(input: SaleCalculationsInput): SaleCalculationsResult {
  const discount = input.discount || 0;
  const bookingPaid = input.bookingPaid || 0;
  const downPaymentAmount = input.downPaymentAmount || 0;
  const onPossessionAmount = input.onPossessionAmount || 0;
  const semiAnnualAmount = input.semiAnnualAmount || 0;
  const rows = input.rows || [];

  const finalPrice = calculateFinalPrice(input.totalPrice, discount);
  const balanceAfterBooking = Math.max(0, finalPrice - bookingPaid);
  const remainingDownPayment = calculateRemainingDownPayment(downPaymentAmount, bookingPaid);
  const onPossessionDeduction = input.onPossessionEnabled ? onPossessionAmount : 0;
  const remainingForInstallments = Math.max(
    0,
    finalPrice - downPaymentAmount - onPossessionDeduction
  );

  const totalMonths = rows.reduce((s, r) => s + (r.months || 0), 0);
  const regularCount = rows.reduce((s, r) => s + getRowCount(r), 0);

  const semiAnnualCount = input.semiAnnualEnabled ? calculateSemiAnnualCount(totalMonths) : 0;
  const semiAnnualTotal = calculateSemiAnnualTotal(
    totalMonths,
    semiAnnualAmount,
    !!input.semiAnnualEnabled
  );

  const exactMonthlyTotal = rows.reduce(
    (s, r) => s + (getRowCount(r) > 0 ? r.totalAmount || 0 : 0),
    0
  );

  const remainingForMonthly = remainingForInstallments - semiAnnualTotal;
  const grandTotal = exactMonthlyTotal;
  const remainingToAllocate = remainingForMonthly - grandTotal;
  const difference = Math.abs(remainingToAllocate);
  const isExact = difference < 1;
  const isRounding = difference >= 1 && difference <= 100;
  const isMismatch = difference > 100;
  const planValid = isExact || isRounding;
  const hasMisalignedRow = rows.some(isRowMisaligned);

  return {
    finalPrice,
    balanceAfterBooking,
    remainingDownPayment,
    onPossessionDeduction,
    remainingForInstallments,
    totalMonths,
    regularCount,
    semiAnnualCount,
    semiAnnualTotal,
    exactMonthlyTotal,
    remainingForMonthly,
    grandTotal,
    remainingToAllocate,
    difference,
    isExact,
    isRounding,
    isMismatch,
    planValid,
    hasMisalignedRow,
  };
}

export interface BuildInstallmentsParams {
  saleId: string;
  customerId: string;
  plotId: string;
  saleDate: Date;
  rows: InstallmentRow[];
  remainingDownPayment: number;
  includeRemainingDownPayment?: boolean;
  onPossessionEnabled?: boolean;
  onPossessionAmount?: number;
  onPossessionDate?: Date | null;
  onPossessionNotes?: string;
  semiAnnualEnabled?: boolean;
  semiAnnualAmount?: number;
}

export function buildInstallments(
  params: BuildInstallmentsParams
): Omit<Installment, 'id'>[] {
  const {
    saleId,
    customerId,
    plotId,
    saleDate,
    rows,
    remainingDownPayment,
    includeRemainingDownPayment = false,
    onPossessionEnabled = false,
    onPossessionAmount = 0,
    onPossessionDate,
    onPossessionNotes = '',
    semiAnnualEnabled = false,
    semiAnnualAmount = 0,
  } = params;

  const allInsts: Omit<Installment, 'id'>[] = [];
  const regularCount = rows.reduce((s, r) => s + getRowCount(r), 0);
  let instNum = 1;

  // Regular installments: one per interval inside each row
  // Semi-annual amounts are combined into the corresponding 6th, 12th, 18th... month on the SAME row
  let offset = 0;
  for (const row of rows) {
    const interval = getRowInterval(row);
    const count = getRowCount(row);
    const frequency = INTERVAL_FREQUENCY[interval] || `Every ${interval} months`;
    for (let k = 1; k <= count; k++) {
      const isLast = k === count;
      const baseMonthlyAmount = isLast
        ? row.monthlyAmount + (row.totalAmount - row.monthlyAmount * count)
        : row.monthlyAmount;

      const monthIndex = offset + k * interval;
      const isSemiAnnual = semiAnnualEnabled && semiAnnualAmount > 0 && monthIndex % 6 === 0;
      const totalAmountDue = isSemiAnnual
        ? baseMonthlyAmount + semiAnnualAmount
        : baseMonthlyAmount;

      const note = isSemiAnnual
        ? `Includes Rs. ${semiAnnualAmount.toLocaleString()} Semi-Annual Payment`
        : '';

      allInsts.push({
        receiptNumber: '',
        saleId,
        customerId,
        plotId,
        installmentNumber: instNum++,
        totalInstallments: regularCount,
        type: isSemiAnnual ? 'semi_annual' : 'monthly',
        frequency,
        dueDate: addMonths(saleDate, monthIndex),
        amountDue: totalAmountDue,
        amountPaid: 0,
        paymentDate: null,
        paymentMethod: '',
        bankName: '',
        chequeNumber: '',
        status: 'pending',
        notes: note,
        createdAt: new Date(),
      });
    }
    offset += row.months;
  }

  // On Possession (if enabled)
  if (onPossessionEnabled && onPossessionAmount > 0) {
    const totalMonths = rows.reduce((s, r) => s + (r.months || 0), 0);
    allInsts.push({
      receiptNumber: '',
      saleId,
      customerId,
      plotId,
      installmentNumber: instNum++,
      totalInstallments: regularCount + 1,
      type: 'on_possession',
      dueDate: onPossessionDate || addMonths(saleDate, totalMonths),
      amountDue: onPossessionAmount,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: onPossessionNotes || 'On Possession Payment',
      createdAt: new Date(),
    });
  }

  return allInsts;
}

/**
 * Consolidates installments for a sale so that:
 * 1. Down payments are NEVER included as installment rows.
 * 2. Separate semi-annual installments (e.g. 42 rows) are merged into the corresponding
 *    monthly row for month 6, 12, 18, 24, 30, 36, producing exactly 36 monthly rows.
 * 3. Installment numbers are sequential (1..36) and totalInstallments is 36.
 */
export function consolidateSaleInstallments(rawList: Installment[]): Installment[] {
  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) return [];

  // 1. Exclude any down payment rows completely
  const validInsts = rawList.filter(i => i && i.type !== 'down_payment');

  // Separate possession from regular installments
  const possessionInsts = validInsts.filter(i => i.type === 'on_possession');
  const regularInsts = validInsts.filter(i => i.type !== 'on_possession');

  // Check if we have separate semi-annual rows that need to be merged
  const monthlyList = regularInsts.filter(i => i.type === 'monthly');
  const separateSemiList = regularInsts.filter(i => i.type === 'semi_annual');

  let mergedRegular: Installment[] = [];

  // If there are separate semi-annual rows alongside monthly rows (e.g. 36 monthly + 6 semi = 42 rows)
  if (separateSemiList.length > 0 && monthlyList.length > 0 && regularInsts.length > monthlyList.length) {
    // Sort monthly by due date or installmentNumber
    const sortedMonthly = [...monthlyList].sort((a, b) => {
      const timeA = new Date(a.dueDate).getTime();
      const timeB = new Date(b.dueDate).getTime();
      return timeA - timeB;
    });

    // Unmatched semi-annuals queue
    const remainingSemi = [...separateSemiList];

    mergedRegular = sortedMonthly.map((mInst, idx) => {
      const monthNumber = idx + 1;
      const mDate = new Date(mInst.dueDate);
      const mKey = `${mDate.getFullYear()}-${mDate.getMonth()}`;

      // Check if this month matches a semi-annual installment
      // Matches either by month/year key or by being month 6, 12, 18, 24, 30, 36
      let matchIdx = remainingSemi.findIndex(s => {
        const sDate = new Date(s.dueDate);
        return `${sDate.getFullYear()}-${sDate.getMonth()}` === mKey;
      });

      if (matchIdx === -1 && monthNumber % 6 === 0 && remainingSemi.length > 0) {
        matchIdx = 0; // Take the next available semi-annual
      }

      if (matchIdx !== -1) {
        const [matchedSemi] = remainingSemi.splice(matchIdx, 1);
        const combinedDue = (mInst.amountDue || 0) + (matchedSemi.amountDue || 0);
        const combinedPaid = (mInst.amountPaid || 0) + (matchedSemi.amountPaid || 0);
        const isPaid = combinedPaid >= combinedDue && combinedDue > 0;
        const isPartial = combinedPaid > 0 && !isPaid;

        const semiNote = `Includes Rs. ${(matchedSemi.amountDue || 0).toLocaleString('en-PK')} Semi-Annual Payment`;
        const existingNote = mInst.notes ? `${mInst.notes}; ` : '';

        return {
          ...mInst,
          amountDue: combinedDue,
          amountPaid: combinedPaid,
          type: 'semi_annual' as const,
          notes: existingNote ? `${existingNote}${semiNote}` : semiNote,
          status: isPaid ? ('paid' as const) : isPartial ? ('partial' as const) : mInst.status,
          paymentDate: isPaid ? (mInst.paymentDate || matchedSemi.paymentDate || new Date()) : (mInst.paymentDate || null),
        };
      }

      return { ...mInst };
    });

    // If any unmatched semi-annual remains, append them
    if (remainingSemi.length > 0) {
      mergedRegular.push(...remainingSemi);
    }
  } else {
    // Already combined or purely monthly / purely semi-annual
    mergedRegular = [...regularInsts];
  }

  // Sort chronologically by dueDate
  mergedRegular.sort((a, b) => {
    const timeA = new Date(a.dueDate).getTime();
    const timeB = new Date(b.dueDate).getTime();
    return timeA - timeB;
  });

  const totalRegularCount = mergedRegular.length;
  const totalCount = totalRegularCount + possessionInsts.length;

  // Re-number 1..N
  const finalRegular = mergedRegular.map((inst, idx) => ({
    ...inst,
    installmentNumber: idx + 1,
    totalInstallments: totalCount,
  }));

  const finalPossession = possessionInsts.map((inst, idx) => ({
    ...inst,
    installmentNumber: totalRegularCount + idx + 1,
    totalInstallments: totalCount,
  }));

  return [...finalRegular, ...finalPossession];
}
