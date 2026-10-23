import { buildInstallments, consolidateSaleInstallments, sortInstallments } from '../src/utils/saleCalc';
import type { PlanRow } from '../src/types';

interface TestCase {
  name: string;
  months: number;
  monthlyAmount: number;
  semiAnnualEnabled: boolean;
  semiAnnualAmount: number;
  onPossessionEnabled: boolean;
  onPossessionAmount: number;
  expectedRows: number;
  checkMonth6Duplicate?: boolean;
}

const testCases: TestCase[] = [
  // 12 months
  {
    name: '12 months (standard)',
    months: 12,
    monthlyAmount: 20000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 12,
  },
  {
    name: '12 months with 2 semi-annuals',
    months: 12,
    monthlyAmount: 20000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 50000,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 14,
  },
  {
    name: '12 months with semi-annual and possession',
    months: 12,
    monthlyAmount: 20000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 50000,
    onPossessionEnabled: true,
    onPossessionAmount: 100000,
    expectedRows: 15,
  },

  // 36 months
  {
    name: '36 months (standard)',
    months: 36,
    monthlyAmount: 25000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 36,
  },
  {
    name: '36 months with 6 semi-annuals (42 rows total)',
    months: 36,
    monthlyAmount: 25000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 50000,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 42,
    checkMonth6Duplicate: true,
  },
  {
    name: '36 months with 6 semi-annuals and possession (43 rows)',
    months: 36,
    monthlyAmount: 25000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 50000,
    onPossessionEnabled: true,
    onPossessionAmount: 150000,
    expectedRows: 43,
    checkMonth6Duplicate: true,
  },

  // 60 months
  {
    name: '60 months (standard)',
    months: 60,
    monthlyAmount: 15000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 60,
  },
  {
    name: '60 months with 10 semi-annuals (70 rows)',
    months: 60,
    monthlyAmount: 15000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 40000,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 70,
  },
  {
    name: '60 months with semi-annual and possession (71 rows)',
    months: 60,
    monthlyAmount: 15000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 40000,
    onPossessionEnabled: true,
    onPossessionAmount: 200000,
    expectedRows: 71,
  },

  // 120 months
  {
    name: '120 months (standard)',
    months: 120,
    monthlyAmount: 10000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 120,
  },
  {
    name: '120 months with 20 semi-annuals (140 rows)',
    months: 120,
    monthlyAmount: 10000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 30000,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    expectedRows: 140,
  },
  {
    name: '120 months with semi-annual and possession (141 rows)',
    months: 120,
    monthlyAmount: 10000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 30000,
    onPossessionEnabled: true,
    onPossessionAmount: 300000,
    expectedRows: 141,
  },
];

console.log('=== RUNNING SCHEDULE UNIT TESTS ===\n');

let allPassed = true;

for (const tc of testCases) {
  const row: PlanRow = {
    months: tc.months,
    interval: 1,
    monthlyAmount: tc.monthlyAmount,
    totalAmount: tc.months * tc.monthlyAmount,
  };

  const saleDate = '2026-01-01';
  const posDate = '2029-01-01';

  const installments = buildInstallments({
    saleId: 'SALE_TEST',
    customerId: 'CUST_TEST',
    plotId: 'PLOT_TEST',
    saleDate,
    rows: [row],
    remainingDownPayment: 0,
    includeRemainingDownPayment: false,
    onPossessionEnabled: tc.onPossessionEnabled,
    onPossessionAmount: tc.onPossessionAmount,
    onPossessionDate: posDate,
    semiAnnualEnabled: tc.semiAnnualEnabled,
    semiAnnualAmount: tc.semiAnnualAmount,
  });

  const rowCount = installments.length;
  const isCountOk = rowCount === tc.expectedRows;

  // Expected sum calculation
  const expectedMonthlyTotal = tc.months * tc.monthlyAmount;
  const semiCount = tc.semiAnnualEnabled ? Math.floor(tc.months / 6) : 0;
  const expectedSemiTotal = semiCount * tc.semiAnnualAmount;
  const expectedPossessionTotal = tc.onPossessionEnabled ? tc.onPossessionAmount : 0;
  const expectedTotal = expectedMonthlyTotal + expectedSemiTotal + expectedPossessionTotal;

  const actualTotal = installments.reduce((sum, i) => sum + i.amountDue, 0);
  const isSumOk = actualTotal === expectedTotal;

  // Check due date ordering (ascending)
  let orderOk = true;
  for (let i = 1; i < installments.length; i++) {
    const prevDate = new Date(installments[i - 1].dueDate).getTime();
    const currDate = new Date(installments[i].dueDate).getTime();
    if (currDate < prevDate) {
      orderOk = false;
      break;
    }
  }

  // Check month 6 duplicate due date and unmerged amounts if required
  let month6Ok = true;
  let month6Details = '';
  if (tc.checkMonth6Duplicate) {
    const monthly6 = installments.find(i => i.type === 'monthly' && i.installmentNumber === 6);
    const semi1 = installments.find(i => i.type === 'semi_annual' && i.installmentNumber === 1);
    if (!monthly6 || !semi1) {
      month6Ok = false;
      month6Details = 'Could not find monthly #6 or semi-annual #1';
    } else {
      const timeMonthly = new Date(monthly6.dueDate).getTime();
      const timeSemi = new Date(semi1.dueDate).getTime();
      const idxMonthly = installments.indexOf(monthly6);
      const idxSemi = installments.indexOf(semi1);

      if (timeMonthly !== timeSemi) {
        month6Ok = false;
        month6Details = `Due dates differ: monthly=${monthly6.dueDate}, semi=${semi1.dueDate}`;
      } else if (idxSemi !== idxMonthly + 1) {
        month6Ok = false;
        month6Details = `Semi-annual is not immediately adjacent after monthly: monthly idx=${idxMonthly}, semi idx=${idxSemi}`;
      } else if (monthly6.amountDue !== tc.monthlyAmount || semi1.amountDue !== tc.semiAnnualAmount) {
        month6Ok = false;
        month6Details = `Amounts merged: monthly=${monthly6.amountDue}, semi=${semi1.amountDue}`;
      } else {
        month6Details = `Month 6 verified: Monthly #6 (${monthly6.amountDue}) and Semi-Annual #1 (${semi1.amountDue}) are adjacent, unmerged, with identical dueDate (${new Date(monthly6.dueDate).toISOString()})`;
      }
    }
  }

  // Check consolidation does not alter counts
  // (Simulating loaded installments from DB)
  const fullInstallments = installments.map((inst, idx) => ({
    ...inst,
    id: `inst_${idx}`,
  }));
  const consolidated = consolidateSaleInstallments(fullInstallments as any);
  const isConsolidateOk = consolidated.length === tc.expectedRows;

  const passed = isCountOk && isSumOk && orderOk && month6Ok && isConsolidateOk;
  if (!passed) allPassed = false;

  console.log(`Test: ${tc.name}`);
  console.log(`  Count: ${rowCount} / expected ${tc.expectedRows} -> ${isCountOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Sum: ${actualTotal} / expected ${expectedTotal} -> ${isSumOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Date order: ${orderOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Consolidation preserves rows: ${isConsolidateOk ? 'PASS' : 'FAIL'}`);
  if (tc.checkMonth6Duplicate) {
    console.log(`  Month 6 check: ${month6Ok ? 'PASS' : 'FAIL'} (${month6Details})`);
  }
  console.log(`  Status: ${passed ? 'PASSED' : 'FAILED'}\n`);
}

if (!allPassed) {
  console.error('SOME UNIT TESTS FAILED!');
  process.exit(1);
} else {
  console.log('ALL SCHEDULE UNIT TESTS PASSED!');
}
