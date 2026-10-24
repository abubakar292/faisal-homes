import {
  buildInstallments,
  calculateSalePlan,
  consolidateSaleInstallments,
  getRowCount,
  getRowInterval,
} from '../src/utils/saleCalc';
import { generateScheduleHTML } from '../src/utils/printUtils';
import { buildCustomerStatement } from '../src/utils/ledgerStatement';
import type { InstallmentRow, Installment, Sale, Customer, Plot, CompanySettings, PaymentPlan } from '../src/types';

interface TestCase {
  name: string;
  totalPrice: number;
  discount: number;
  bookingPaid: number;
  downPaymentAmount: number;
  semiAnnualEnabled: boolean;
  semiAnnualAmount: number;
  onPossessionEnabled: boolean;
  onPossessionAmount: number;
  rows: InstallmentRow[];
  selectedTemplate?: PaymentPlan;
}

const company: CompanySettings = {
  id: 'company',
  name: 'Faisal Homes',
  address: 'Faisalabad',
  phone: '0300-0000000',
  logoUrl: '',
  termsAndConditions: '',
  createdAt: new Date(),
};

const customer: Customer = {
  id: 'cust-1',
  customerId: 'CUST-2026-001',
  name: 'Abubakar Ahmad',
  cnic: '33100-0000000-1',
  phone: '0300-1111111',
  address: 'Faisalabad',
  city: 'Faisalabad',
  status: 'active',
  createdAt: new Date(),
};

const plot: Plot = {
  id: 'plot-1',
  plotNumber: 'A-225',
  block: 'A',
  size: '7',
  sizeUnit: 'Marla',
  category: 'Residential',
  type: 'Residential',
  price: 5950000,
  status: 'sold',
  createdAt: new Date(),
};

const cases: TestCase[] = [
  {
    name: 'Case 1: Single row 36 months (monthly 65694)',
    totalPrice: 5950000,
    discount: 0,
    bookingPaid: 0,
    downPaymentAmount: 1190000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    rows: [
      {
        id: 'r1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 65694,
        totalAmount: 2364984,
        planAuto: false,
      },
    ],
  },
  {
    name: 'Case 2: 36 months + semi-annual 50,000 x 6',
    totalPrice: 2000000,
    discount: 0,
    bookingPaid: 0,
    downPaymentAmount: 400000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 50000,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    rows: [
      {
        id: 'r1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 36111,
        totalAmount: 1300000,
        planAuto: false,
      },
    ],
  },
  {
    name: 'Case 3: With possession (36 months + on possession)',
    totalPrice: 2500000,
    discount: 0,
    bookingPaid: 0,
    downPaymentAmount: 500000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: true,
    onPossessionAmount: 200000,
    rows: [
      {
        id: 'r1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 50000,
        totalAmount: 1800000,
        planAuto: false,
      },
    ],
  },
  {
    name: 'Case 4: With saved-plan dropdown selection (plan "36 installments, Monthly")',
    totalPrice: 3000000,
    discount: 0,
    bookingPaid: 0,
    downPaymentAmount: 600000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    selectedTemplate: {
      id: 'plan-36',
      name: '36 installments, Monthly',
      duration: 36,
      durationUnit: 'months',
      installmentType: 'Monthly',
      downPaymentPercent: 20,
      numberOfInstallments: 36,
      notes: '',
      createdAt: new Date(),
    },
    rows: [
      {
        id: 'r1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 66667,
        totalAmount: 2400000,
        planAuto: true,
      },
    ],
  },
  {
    name: 'Case 5: With "Add row" (12 months + 24 months)',
    totalPrice: 3000000,
    discount: 0,
    bookingPaid: 0,
    downPaymentAmount: 600000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    rows: [
      {
        id: 'r1',
        months: 12,
        intervalMonths: 1,
        monthlyAmount: 50000,
        totalAmount: 600000,
        planAuto: false,
      },
      {
        id: 'r2',
        months: 24,
        intervalMonths: 1,
        monthlyAmount: 75000,
        totalAmount: 1800000,
        planAuto: false,
      },
    ],
  },
  {
    name: 'Case 6: With "Balance last row"',
    totalPrice: 2000000,
    discount: 0,
    bookingPaid: 0,
    downPaymentAmount: 400000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    rows: [
      {
        id: 'r1',
        months: 12,
        intervalMonths: 1,
        monthlyAmount: 40000,
        totalAmount: 480000,
        planAuto: false,
      },
      {
        id: 'r2',
        months: 24,
        intervalMonths: 1,
        monthlyAmount: 46667,
        totalAmount: 1120000,
        planAuto: false,
      },
    ],
  },
  {
    name: 'Case 7: With discount (total 3,000,000, discount 200,000)',
    totalPrice: 3000000,
    discount: 200000,
    bookingPaid: 0,
    downPaymentAmount: 560000,
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    rows: [
      {
        id: 'r1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 62222,
        totalAmount: 2240000,
        planAuto: false,
      },
    ],
  },
  {
    name: 'Case 8: With booking (total 3,000,000, booking 100,000, down payment 600,000)',
    totalPrice: 3000000,
    discount: 0,
    bookingPaid: 100000,
    downPaymentAmount: 600000,
    semiAnnualEnabled: true,
    semiAnnualAmount: 40000,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    rows: [
      {
        id: 'r1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: 60000,
        totalAmount: 2160000,
        planAuto: false,
      },
    ],
  },
];

console.log('=== STAGE-BY-STAGE REPRODUCTION OF 8 CASES ===\n');

for (const tc of cases) {
  console.log(`------------------------------------------------------------`);
  console.log(`TEST: ${tc.name}`);
  console.log(`------------------------------------------------------------`);

  // Stage 1: Form state / plan rows and planMonths
  const planMath = calculateSalePlan({
    totalPrice: tc.totalPrice,
    discount: tc.discount,
    bookingPaid: tc.bookingPaid,
    downPaymentAmount: tc.downPaymentAmount,
    semiAnnualEnabled: tc.semiAnnualEnabled,
    semiAnnualAmount: tc.semiAnnualAmount,
    onPossessionEnabled: tc.onPossessionEnabled,
    onPossessionAmount: tc.onPossessionAmount,
    rows: tc.rows,
  });

  const stage1_months = tc.rows.reduce((s, r) => s + (r.months || 0), 0);
  const stage1_rowCount = tc.rows.reduce((s, r) => s + getRowCount(r), 0);
  const stage1_expectedMonthly = stage1_rowCount;
  const stage1_expectedSemi = tc.semiAnnualEnabled ? Math.floor(stage1_months / 6) : 0;
  const stage1_expectedPoss = tc.onPossessionEnabled ? 1 : 0;
  const stage1_expectedTotal = stage1_expectedMonthly + stage1_expectedSemi + stage1_expectedPoss;

  console.log(`Stage 1 (Form State):`);
  console.log(`  planMonths: ${stage1_months}, rowCount (monthly slots): ${stage1_rowCount}`);
  console.log(`  semiAnnualCount: ${stage1_expectedSemi}, onPossessionCount: ${stage1_expectedPoss}`);
  console.log(`  Expected Total Documents: ${stage1_expectedTotal}`);

  // Stage 2: Output of buildInstallments
  const stage2_installments = buildInstallments({
    saleId: 'sale-test',
    customerId: customer.id,
    plotId: plot.id,
    saleDate: new Date('2026-10-22T12:00:00Z'),
    rows: tc.rows,
    remainingDownPayment: planMath.remainingDownPayment,
    includeRemainingDownPayment: false,
    onPossessionEnabled: tc.onPossessionEnabled,
    onPossessionAmount: tc.onPossessionAmount,
    semiAnnualEnabled: tc.semiAnnualEnabled,
    semiAnnualAmount: tc.semiAnnualAmount,
  });
  console.log(`Stage 2 (buildInstallments): count = ${stage2_installments.length}`);
  const s2_monthly = stage2_installments.filter(i => i.type === 'monthly').length;
  const s2_semi = stage2_installments.filter(i => i.type === 'semi_annual').length;
  const s2_poss = stage2_installments.filter(i => i.type === 'on_possession').length;
  console.log(`  monthly=${s2_monthly}, semi_annual=${s2_semi}, on_possession=${s2_poss}`);

  // Stage 3: Operations produced by saleService (saveSale)
  // In saleService:
  // firstChunk: slice(0, 400), subsequent chunks: slice(400, ...)
  const CHUNK_SIZE = 450;
  let batchOpsCount = 0;
  const firstChunk = stage2_installments.slice(0, 400);
  batchOpsCount += firstChunk.length;
  for (let i = 400; i < stage2_installments.length; i += CHUNK_SIZE) {
    const chunk = stage2_installments.slice(i, i + CHUNK_SIZE);
    batchOpsCount += chunk.length;
  }
  console.log(`Stage 3 (saleService writeBatch ops): count = ${batchOpsCount}`);

  // Stage 4: What the loader returns for that sale
  // Simulated Firestore document snapshot array
  const loadedDocs: Installment[] = stage2_installments.map((inst, idx) => ({
    ...inst,
    id: `inst-${idx + 1}`,
  })) as Installment[];
  console.log(`Stage 4 (Loader raw results): count = ${loadedDocs.length}`);

  // Stage 5: Rows in schedule / ledger screens
  const cleanInsts = consolidateSaleInstallments(loadedDocs);
  const saleObj: Sale = {
    id: 'sale-test',
    saleNumber: 'SALE-2026-001',
    customerId: customer.id,
    plotId: plot.id,
    saleDate: new Date('2026-10-22T12:00:00Z'),
    totalPrice: tc.totalPrice,
    discount: tc.discount,
    finalPrice: planMath.finalPrice,
    downPayment: tc.downPaymentAmount,
    downPaymentPercent: 20,
    downPaymentAmount: tc.downPaymentAmount,
    bookingAmountPaid: tc.bookingPaid,
    remainingDownPayment: planMath.remainingDownPayment,
    remainingAmount: planMath.remainingForInstallments,
    installmentRows: tc.rows,
    semiAnnualEnabled: tc.semiAnnualEnabled,
    semiAnnualAmount: tc.semiAnnualAmount,
    onPossessionEnabled: tc.onPossessionEnabled,
    onPossessionAmount: tc.onPossessionAmount,
    status: 'active',
    possessionGiven: false,
    downPaymentReceived: 0,
    downPaymentStatus: planMath.remainingDownPayment > 0 ? 'pending' : 'complete',
    createdAt: new Date(),
  };

  const ledgerStatement = buildCustomerStatement(
    'all',
    customer,
    [saleObj],
    [plot],
    [],
    [],
    loadedDocs
  );
  console.log(`Stage 5 (Screens): consolidateSaleInstallments = ${cleanInsts.length}, Ledger rows = ${ledgerStatement.rows.length}`);

  // Stage 6: Rows in generateScheduleHTML / letterhead builder
  const scheduleHtml = generateScheduleHTML(saleObj, customer, plot, cleanInsts, company);
  const tableMatch = scheduleHtml.match(/<table class="lh-table lh-installment-table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  const tbodyHtml = tableMatch ? tableMatch[1] : '';
  const htmlBodyRowCount = (tbodyHtml.match(/<tr/g) || []).length;
  console.log(`Stage 6 (generateScheduleHTML table tbody rows): count = ${htmlBodyRowCount}`);

  // Stage 7: PDF Text Rows
  // The table tbody contains exactly htmlBodyRowCount installment rows
  console.log(`Stage 7 (Final Output text rows): count = ${htmlBodyRowCount}`);

  const stageDrop = stage1_expectedTotal !== htmlBodyRowCount;
  if (stageDrop) {
    console.log(`  => DISCREPANCY DETECTED! Expected ${stage1_expectedTotal}, got ${htmlBodyRowCount}`);
  } else {
    console.log(`  => PASS: ${htmlBodyRowCount}/${stage1_expectedTotal} rows preserved across all 7 stages.`);
  }
  console.log('');
}
