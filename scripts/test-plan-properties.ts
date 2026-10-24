import fc from 'fast-check';
import {
  computeSchedule,
  expectedCounts,
  validateSchedule,
  normalizeRows,
  PlanInput,
  PlanRow,
  ScheduleDocument,
} from '../src/domain/plan';

console.log('=== RUNNING PROPERTY-BASED TESTS WITH FAST-CHECK (>= 1,000 RUNS) ===\n');

// Custom arbitrary for valid plan rows
const intervalArb = fc.constantFrom(1, 3, 6, 12);

const planRowArb = fc
  .tuple(intervalArb, fc.integer({ min: 1, max: 15 }), fc.integer({ min: 1000, max: 500000 }))
  .map(([interval, multiplier, monthlyAmount]): PlanRow => {
    const months = interval * multiplier; // Guaranteed multiple of interval, 1..180
    const count = Math.floor(months / interval);
    const totalAmount = count * monthlyAmount;
    return {
      months,
      intervalMonths: interval,
      monthlyAmount,
      totalAmount,
      planAuto: false,
    };
  });

const planRowsArb = fc.array(planRowArb, { minLength: 1, maxLength: 4 });

const planInputArb = fc
  .record({
    rows: planRowsArb,
    semiAnnualEnabled: fc.boolean(),
    semiAnnualAmount: fc.integer({ min: 10000, max: 200000 }),
    onPossessionEnabled: fc.boolean(),
    onPossessionAmount: fc.integer({ min: 50000, max: 500000 }),
    discount: fc.integer({ min: 0, max: 100000 }),
    bookingPaid: fc.integer({ min: 0, max: 100000 }),
    additionalDownPayment: fc.integer({ min: 0, max: 400000 }),
    saleDateOffsetDays: fc.integer({ min: -365, max: 365 }),
  })
  .map((rec): PlanInput => {
    const downPaymentAmount = rec.bookingPaid + rec.additionalDownPayment;
    const possessionDeduction = rec.onPossessionEnabled ? rec.onPossessionAmount : 0;
    const totalMonths = rec.rows.reduce((sum, r) => sum + r.months, 0);
    const semiCount = rec.semiAnnualEnabled ? Math.floor(totalMonths / 6) : 0;
    const semiTotal = semiCount * rec.semiAnnualAmount;
    const monthlyTotal = rec.rows.reduce((sum, r) => sum + r.totalAmount, 0);

    const requiredForInstallments = monthlyTotal + semiTotal;
    const totalPrice =
      requiredForInstallments + downPaymentAmount + possessionDeduction + rec.discount;

    const saleDate = new Date(Date.now() + rec.saleDateOffsetDays * 86400000);

    return {
      saleId: 'sale-prop-test',
      customerId: 'cust-prop-test',
      plotId: 'plot-prop-test',
      saleDate,
      totalPrice,
      discount: rec.discount,
      bookingPaid: rec.bookingPaid,
      downPaymentAmount,
      rows: rec.rows,
      semiAnnualEnabled: rec.semiAnnualEnabled,
      semiAnnualAmount: rec.semiAnnualAmount,
      onPossessionEnabled: rec.onPossessionEnabled,
      onPossessionAmount: rec.onPossessionAmount,
      includeRemainingDownPayment: false,
    };
  });

let iterationCount = 0;

fc.assert(
  fc.property(planInputArb, (input: PlanInput) => {
    iterationCount++;

    const expected = expectedCounts(input);
    const documents = computeSchedule(input);
    const validation = validateSchedule(input, documents);

    // 1. Document count equals expectedCounts
    if (documents.length !== expected.totalCount) {
      throw new Error(
        `[Run ${iterationCount}] Count mismatch: expected ${expected.totalCount}, got ${documents.length}`
      );
    }

    // 2. Monthly numbers are 1..N continuous
    const monthlyDocs = documents.filter((d) => d.type === 'monthly');
    monthlyDocs.forEach((doc, idx) => {
      if (doc.installmentNumber !== idx + 1) {
        throw new Error(
          `[Run ${iterationCount}] Non-continuous monthly installment number: expected ${idx + 1}, got ${doc.installmentNumber}`
        );
      }
    });

    // 3. Due dates are non-decreasing for monthly installments
    for (let i = 1; i < monthlyDocs.length; i++) {
      const prevTime = new Date(monthlyDocs[i - 1].dueDate).getTime();
      const currTime = new Date(monthlyDocs[i].dueDate).getTime();
      if (currTime < prevTime) {
        throw new Error(
          `[Run ${iterationCount}] Decreasing due date at monthly installment ${i + 1}`
        );
      }
    }

    // 4. Unique per (type, number)
    const seenTypeNum = new Set<string>();
    for (const doc of documents) {
      const key = `${doc.type}-${doc.installmentNumber}`;
      if (seenTypeNum.has(key)) {
        throw new Error(`[Run ${iterationCount}] Duplicate installment key: ${key}`);
      }
      seenTypeNum.add(key);
    }

    // 5. Semi-annual documents fall on months 6k
    const semiDocs = documents.filter((d) => d.type === 'semi_annual');
    const saleDate = new Date(input.saleDate);
    const saleMonth = saleDate.getFullYear() * 12 + saleDate.getMonth();
    for (const sDoc of semiDocs) {
      const sDueDate = new Date(sDoc.dueDate);
      const dueMonth = sDueDate.getFullYear() * 12 + sDueDate.getMonth();
      const monthDiff = dueMonth - saleMonth;
      if (monthDiff % 6 !== 0 || monthDiff <= 0) {
        throw new Error(
          `[Run ${iterationCount}] Semi-annual installment ${sDoc.installmentNumber} not on 6k: monthDiff = ${monthDiff}`
        );
      }
    }

    // 6. Sum of documents equals amount to schedule (within Rs 1)
    const scheduledTotal = documents
      .filter((d) => d.type !== 'down_payment')
      .reduce((sum, d) => sum + d.amountDue, 0);

    const targetInstallmentTotal = expected.amountToSchedule + expected.possessionAmount;
    const diff = Math.abs(scheduledTotal - targetInstallmentTotal);
    if (diff > 1) {
      throw new Error(
        `[Run ${iterationCount}] Sum mismatch: expected ${targetInstallmentTotal}, got ${scheduledTotal} (diff: ${diff})`
      );
    }

    // 7. No amount is negative
    for (const doc of documents) {
      if (doc.amountDue < 0) {
        throw new Error(
          `[Run ${iterationCount}] Negative amount in document: ${doc.amountDue}`
        );
      }
    }

    // 8. General validateSchedule result must be valid
    if (!validation.valid) {
      throw new Error(
        `[Run ${iterationCount}] validateSchedule failed: ${validation.errors.join('; ')}`
      );
    }

    return true;
  }),
  { numRuns: 1500 }
);

console.log(`SUCCESS: Fast-check passed ${iterationCount} runs with 0 errors!`);
console.log('All 7 contract invariants verified over 1,500 random inputs.');
