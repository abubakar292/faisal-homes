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
  const totalMonths = rows.reduce((s, r) => s + (r.months || 0), 0);
  let instNum = 1;

  // Remaining Down Payment
  if (remainingDownPayment > 0 && includeRemainingDownPayment) {
    allInsts.push({
      receiptNumber: '',
      saleId,
      customerId,
      plotId,
      installmentNumber: 0,
      totalInstallments: regularCount,
      type: 'down_payment',
      dueDate: saleDate,
      amountDue: remainingDownPayment,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: 'Remaining Down Payment',
      createdAt: new Date(),
    });
  }

  // On Possession
  if (onPossessionEnabled && onPossessionAmount > 0) {
    allInsts.push({
      receiptNumber: '',
      saleId,
      customerId,
      plotId,
      installmentNumber: 0,
      totalInstallments: regularCount,
      type: 'on_possession',
      dueDate: onPossessionDate || saleDate,
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

  // Regular installments: one per interval inside each row
  let offset = 0;
  for (const row of rows) {
    const interval = getRowInterval(row);
    const count = getRowCount(row);
    const frequency = INTERVAL_FREQUENCY[interval] || `Every ${interval} months`;
    for (let k = 1; k <= count; k++) {
      const isLast = k === count;
      const amount = isLast
        ? row.monthlyAmount + (row.totalAmount - row.monthlyAmount * count)
        : row.monthlyAmount;
      allInsts.push({
        receiptNumber: '',
        saleId,
        customerId,
        plotId,
        installmentNumber: instNum++,
        totalInstallments: regularCount,
        type: 'monthly',
        frequency,
        dueDate: addMonths(saleDate, offset + k * interval),
        amountDue: amount,
        amountPaid: 0,
        paymentDate: null,
        paymentMethod: '',
        bankName: '',
        chequeNumber: '',
        status: 'pending',
        notes: '',
        createdAt: new Date(),
      });
    }
    offset += row.months;
  }

  // Semi-annual extra payments on months 6, 12, 18...
  if (semiAnnualEnabled && semiAnnualAmount > 0) {
    const semiAnnualCount = Math.floor(totalMonths / 6);
    for (let j = 1; j <= semiAnnualCount; j++) {
      const month = j * 6;
      allInsts.push({
        receiptNumber: '',
        saleId,
        customerId,
        plotId,
        installmentNumber: month,
        totalInstallments: regularCount,
        type: 'semi_annual',
        dueDate: addMonths(saleDate, month),
        amountDue: semiAnnualAmount,
        amountPaid: 0,
        paymentDate: null,
        paymentMethod: '',
        bankName: '',
        chequeNumber: '',
        status: 'pending',
        notes: `Semi-Annual Payment ${j}`,
        createdAt: new Date(),
      });
    }
  }

  return allInsts;
}
