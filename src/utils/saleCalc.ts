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

import {
  computeSchedule,
  sortScheduleDocuments,
  normalizeRows as normalizeDomainRows,
  expectedCounts,
} from '../domain/plan';

export function sortInstallments<T extends { dueDate: Date | string; type?: string; installmentNumber?: number }>(
  list: T[]
): T[] {
  return sortScheduleDocuments(list);
}

export function buildInstallments(
  params: BuildInstallmentsParams
): Omit<Installment, 'id'>[] {
  return computeSchedule({
    saleId: params.saleId,
    customerId: params.customerId,
    plotId: params.plotId,
    saleDate: params.saleDate,
    totalPrice: 0,
    downPaymentAmount: 0,
    rows: params.rows,
    remainingDownPayment: params.remainingDownPayment,
    includeRemainingDownPayment: params.includeRemainingDownPayment,
    onPossessionEnabled: params.onPossessionEnabled,
    onPossessionAmount: params.onPossessionAmount,
    onPossessionDate: params.onPossessionDate,
    onPossessionNotes: params.onPossessionNotes,
    semiAnnualEnabled: params.semiAnnualEnabled,
    semiAnnualAmount: params.semiAnnualAmount,
  });
}

/**
 * Normalizes installments for a sale so that:
 * 1. Down payments are excluded as regular installment rows.
 * 2. All installment rows are preserved (never grouped or merged).
 * 3. Rows are sorted by due date, then monthly before semi-annual.
 */
export function consolidateSaleInstallments(rawList: Installment[]): Installment[] {
  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) return [];
  const validInsts = rawList.filter(i => i && i.type !== 'down_payment');
  return sortInstallments(validInsts);
}
