import { addMonths } from 'date-fns';
import type { Installment, InstallmentRow } from '../types';

export interface PlanRow {
  id?: string;
  months: number;
  intervalMonths?: number;
  monthlyAmount: number;
  totalAmount: number;
  planAuto?: boolean;
}

export interface PlanInput {
  saleId?: string;
  customerId?: string;
  plotId?: string;
  saleDate: Date | string;
  totalPrice: number;
  discount?: number;
  bookingPaid?: number;
  downPaymentAmount: number;
  remainingDownPayment?: number;
  rows: PlanRow[];
  semiAnnualEnabled?: boolean;
  semiAnnualAmount?: number;
  onPossessionEnabled?: boolean;
  onPossessionAmount?: number;
  onPossessionDate?: Date | string | null;
  onPossessionNotes?: string;
  includeRemainingDownPayment?: boolean;
}

export interface ExpectedCounts {
  monthlyCount: number;
  semiAnnualCount: number;
  possessionCount: number;
  downPaymentCount: number;
  totalCount: number;
  totalMonths: number;
  finalPrice: number;
  amountToSchedule: number;
  amountForMonthly: number;
  semiAnnualTotal: number;
  possessionAmount: number;
  remainingDownPayment: number;
}

export type ScheduleDocument = Omit<Installment, 'id'>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const INTERVAL_FREQUENCY_MAP: Record<number, string> = {
  1: 'Monthly',
  3: 'Quarterly',
  6: 'Semi-Annual',
  12: 'Annual',
};

/**
 * Normalizes input date to local 12:00 (Asia/Karachi timezone safe)
 * so calendar day never shifts across UTC/local conversions.
 */
export function makeDateAtNoon(dateInput: Date | string): Date {
  const d = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Adds calendar months to dateInput and ensures the time is pinned to 12:00 local.
 */
export function makeLocalDateAtNoon(baseDate: Date | string, monthsToAdd: number): Date {
  const base = makeDateAtNoon(baseDate);
  const target = addMonths(base, monthsToAdd);
  target.setHours(12, 0, 0, 0);
  return target;
}

export interface NormalizedPlanRow {
  id: string;
  months: number;
  intervalMonths: number;
  monthlyAmount: number;
  totalAmount: number;
  planAuto: boolean;
}

/**
 * Normalizes rows to ensure valid integer rupees and counts.
 */
export function normalizeRows(rows: PlanRow[]): NormalizedPlanRow[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [
      {
        id: 'row-default',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 0,
        totalAmount: 0,
        planAuto: true,
      },
    ];
  }

  return rows.map((r, idx) => {
    const months = Math.max(1, Math.round(r.months || 0));
    const intervalMonths = Math.max(1, Math.round(r.intervalMonths || 1));
    const count = Math.max(1, Math.floor(months / intervalMonths));
    const totalAmount = Math.max(0, Math.round(r.totalAmount || 0));
    const monthlyAmount =
      r.monthlyAmount > 0
        ? Math.round(r.monthlyAmount)
        : count > 0
        ? Math.round(totalAmount / count)
        : 0;

    return {
      id: r.id || `row-${idx + 1}`,
      months,
      intervalMonths,
      monthlyAmount,
      totalAmount,
      planAuto: !!r.planAuto,
    };
  });
}

/**
 * Calculates expected document counts and financial targets.
 */
export function expectedCounts(input: PlanInput): ExpectedCounts {
  const normalizedRows = normalizeRows(input.rows);
  const totalPrice = Math.max(0, Math.round(input.totalPrice || 0));
  const discount = Math.max(0, Math.round(input.discount || 0));
  const finalPrice = Math.max(0, totalPrice - discount);

  const downPaymentAmount = Math.max(0, Math.round(input.downPaymentAmount || 0));
  const bookingPaid = Math.max(0, Math.round(input.bookingPaid || 0));
  const remainingDownPayment = Math.max(0, downPaymentAmount - bookingPaid);

  const possessionAmount = input.onPossessionEnabled
    ? Math.max(0, Math.round(input.onPossessionAmount || 0))
    : 0;

  const totalMonths = normalizedRows.reduce((sum, r) => sum + r.months, 0);
  const monthlyCount = normalizedRows.reduce(
    (sum, r) => sum + Math.floor(r.months / r.intervalMonths),
    0
  );

  const semiAnnualCount =
    input.semiAnnualEnabled && (input.semiAnnualAmount || 0) > 0
      ? Math.floor(totalMonths / 6)
      : 0;
  const semiAnnualTotal = semiAnnualCount * Math.round(input.semiAnnualAmount || 0);

  const possessionCount = input.onPossessionEnabled && possessionAmount > 0 ? 1 : 0;
  const downPaymentCount =
    input.includeRemainingDownPayment && remainingDownPayment > 0 ? 1 : 0;

  const totalCount = monthlyCount + semiAnnualCount + possessionCount + downPaymentCount;

  const amountToSchedule = Math.max(0, finalPrice - downPaymentAmount - possessionAmount);
  const amountForMonthly = Math.max(0, amountToSchedule - semiAnnualTotal);

  return {
    monthlyCount,
    semiAnnualCount,
    possessionCount,
    downPaymentCount,
    totalCount,
    totalMonths,
    finalPrice,
    amountToSchedule,
    amountForMonthly,
    semiAnnualTotal,
    possessionAmount,
    remainingDownPayment,
  };
}

/**
 * Strict sort order:
 * 1. Due date ascending
 * 2. Type: down_payment (0) < monthly (1) < semi_annual (2) < on_possession (3)
 * 3. Installment number ascending
 */
export function sortScheduleDocuments<T extends { dueDate: Date | string; type?: string; installmentNumber?: number }>(
  list: T[]
): T[] {
  const typeRank = (type?: string) => {
    if (type === 'down_payment') return 0;
    if (type === 'monthly') return 1;
    if (type === 'semi_annual') return 2;
    if (type === 'on_possession') return 3;
    return 4;
  };

  return [...list].sort((a, b) => {
    const timeA = new Date(a.dueDate).getTime();
    const timeB = new Date(b.dueDate).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const rankDiff = typeRank(a.type) - typeRank(b.type);
    if (rankDiff !== 0) return rankDiff;
    return (a.installmentNumber || 0) - (b.installmentNumber || 0);
  });
}

/**
 * Computes the exact schedule documents according to the contract:
 * - One monthly document per slot, numbered continuously 1..N across rows.
 * - If semi-annual enabled: floor(totalMonths / 6) separate documents at months 6, 12, ...
 * - On possession document if enabled.
 * - Down payment document if includeRemainingDownPayment and remainingDownPayment > 0.
 * - Integer rupees: remainder absorbed by the last monthly installment of the row.
 */
export function computeSchedule(input: PlanInput): ScheduleDocument[] {
  const normalizedRows = normalizeRows(input.rows);
  const counts = expectedCounts(input);
  const saleId = input.saleId || '';
  const customerId = input.customerId || '';
  const plotId = input.plotId || '';
  const baseDate = makeDateAtNoon(input.saleDate);

  const docs: ScheduleDocument[] = [];
  let instNum = 1;
  let offsetMonths = 0;

  // 1. Monthly installments
  for (const row of normalizedRows) {
    const count = Math.floor(row.months / row.intervalMonths);
    const interval = row.intervalMonths;
    const frequency = INTERVAL_FREQUENCY_MAP[interval] || `Every ${interval} months`;

    // Integer rupees split: base amount and remainder to last installment of the row
    const targetTotal = row.totalAmount;
    const baseAmount = count > 0 ? Math.floor(targetTotal / count) : 0;
    const remainder = targetTotal - baseAmount * count;

    for (let k = 1; k <= count; k++) {
      const isLast = k === count;
      const amountDue = isLast ? baseAmount + remainder : baseAmount;
      const monthIndex = offsetMonths + k * interval;
      const dueDate = makeLocalDateAtNoon(baseDate, monthIndex);

      docs.push({
        receiptNumber: '',
        saleId,
        customerId,
        plotId,
        installmentNumber: instNum++,
        totalInstallments: counts.monthlyCount,
        type: 'monthly',
        frequency,
        dueDate,
        amountDue,
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

    offsetMonths += row.months;
  }

  // 2. Separate semi-annual installments
  if (counts.semiAnnualCount > 0) {
    const semiAmount = Math.round(input.semiAnnualAmount || 0);
    for (let s = 1; s <= counts.semiAnnualCount; s++) {
      const monthIndex = s * 6;
      const dueDate = makeLocalDateAtNoon(baseDate, monthIndex);

      docs.push({
        receiptNumber: '',
        saleId,
        customerId,
        plotId,
        installmentNumber: s,
        totalInstallments: counts.semiAnnualCount,
        type: 'semi_annual',
        frequency: 'Semi-Annual',
        dueDate,
        amountDue: semiAmount,
        amountPaid: 0,
        paymentDate: null,
        paymentMethod: '',
        bankName: '',
        chequeNumber: '',
        status: 'pending',
        notes: `Semi-Annual ${s} of ${counts.semiAnnualCount}`,
        createdAt: new Date(),
      });
    }
  }

  // 3. On Possession
  if (counts.possessionCount > 0) {
    const posDueDate = input.onPossessionDate
      ? makeDateAtNoon(input.onPossessionDate)
      : makeLocalDateAtNoon(baseDate, counts.totalMonths);

    docs.push({
      receiptNumber: '',
      saleId,
      customerId,
      plotId,
      installmentNumber: 1,
      totalInstallments: 1,
      type: 'on_possession',
      frequency: 'On Possession',
      dueDate: posDueDate,
      amountDue: counts.possessionAmount,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: input.onPossessionNotes || 'On Possession Payment',
      createdAt: new Date(),
    });
  }

  // 4. Down Payment document (if requested)
  if (counts.downPaymentCount > 0) {
    docs.push({
      receiptNumber: '',
      saleId,
      customerId,
      plotId,
      installmentNumber: 0,
      totalInstallments: 1,
      type: 'down_payment',
      frequency: 'Down Payment',
      dueDate: baseDate,
      amountDue: counts.remainingDownPayment,
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

  return sortScheduleDocuments(docs);
}

/**
 * Validates generated schedule documents against input and contract invariants.
 */
export function validateSchedule(
  input: PlanInput,
  documents: ScheduleDocument[]
): ValidationResult {
  const errors: string[] = [];
  const expected = expectedCounts(input);

  if (!Array.isArray(documents)) {
    return { valid: false, errors: ['Documents must be an array'] };
  }

  // 1. Count checks
  if (documents.length !== expected.totalCount) {
    errors.push(
      `Document count mismatch: expected ${expected.totalCount}, got ${documents.length}`
    );
  }

  const monthlyDocs = documents.filter(d => d.type === 'monthly');
  const semiDocs = documents.filter(d => d.type === 'semi_annual');
  const possDocs = documents.filter(d => d.type === 'on_possession');
  const dpDocs = documents.filter(d => d.type === 'down_payment');

  if (monthlyDocs.length !== expected.monthlyCount) {
    errors.push(
      `Monthly count mismatch: expected ${expected.monthlyCount}, got ${monthlyDocs.length}`
    );
  }

  if (semiDocs.length !== expected.semiAnnualCount) {
    errors.push(
      `Semi-annual count mismatch: expected ${expected.semiAnnualCount}, got ${semiDocs.length}`
    );
  }

  if (possDocs.length !== expected.possessionCount) {
    errors.push(
      `Possession count mismatch: expected ${expected.possessionCount}, got ${possDocs.length}`
    );
  }

  if (dpDocs.length !== expected.downPaymentCount) {
    errors.push(
      `Down payment count mismatch: expected ${expected.downPaymentCount}, got ${dpDocs.length}`
    );
  }

  // 2. Continuous 1..N monthly numbering
  const sortedMonthly = [...monthlyDocs].sort(
    (a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0)
  );
  sortedMonthly.forEach((doc, idx) => {
    if (doc.installmentNumber !== idx + 1) {
      errors.push(
        `Monthly installment numbering broken: slot ${idx + 1} has #${doc.installmentNumber}`
      );
    }
  });

  // 3. Unique (type, number) and due dates
  const seenKey = new Set<string>();
  documents.forEach(doc => {
    const key = `${doc.type}-${doc.installmentNumber}`;
    if (seenKey.has(key)) {
      errors.push(`Duplicate installment identifier: ${key}`);
    }
    seenKey.add(key);

    if (doc.amountDue < 0) {
      errors.push(`Negative amount in installment ${key}: ${doc.amountDue}`);
    }
  });

  // 4. Financial totals check
  const scheduledExcludingDP = documents
    .filter(d => d.type !== 'down_payment')
    .reduce((sum, d) => sum + (d.amountDue || 0), 0);

  const targetInstallmentTotal = expected.amountToSchedule + expected.possessionAmount;
  const diff = Math.abs(scheduledExcludingDP - targetInstallmentTotal);
  if (diff > 1) {
    errors.push(
      `Schedule total mismatch: expected Rs ${targetInstallmentTotal}, got Rs ${scheduledExcludingDP} (diff: Rs ${diff})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
