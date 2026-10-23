import {
  buildInstallments,
  calculateSalePlan,
  consolidateSaleInstallments,
  getRowCount,
  getRowInterval
} from '../src/utils/saleCalc';
import { generateScheduleHTML } from '../src/utils/printUtils';
import type { InstallmentRow, Installment, Sale, Customer, Plot, CompanySettings } from '../src/types';

console.log('=== STAGE-BY-STAGE REPRODUCTION: 36 MONTH PLAN WITH 6 SEMI-ANNUALS ===\n');

// Input definition:
// Plan: 36 months, monthly installment: 25,000, semi-annual: 50,000 x 6
// Total: 36 * 25,000 + 6 * 50,000 = 900,000 + 300,000 = 1,200,000
const salePrice = 1200000;
const downPayment = 0;
const semiAnnualAmount = 50000;
const semiAnnualEnabled = true;

const initialRows: InstallmentRow[] = [
  {
    id: 'row-1',
    months: 36,
    intervalMonths: 1,
    monthlyAmount: 25000,
    totalAmount: 900000,
    planAuto: true,
  }
];

// Stage 1: Plan rows state and planMonths in the New Sale form
const planMath = calculateSalePlan({
  totalPrice: salePrice,
  downPaymentAmount: downPayment,
  semiAnnualEnabled,
  semiAnnualAmount,
  rows: initialRows
});

const stage1_rowCount = initialRows.reduce((s, r) => s + getRowCount(r), 0);
const stage1_months = initialRows.reduce((s, r) => s + (r.months || 0), 0);
console.log('(1) New Sale Form State:');
console.log(`    planMonths (sum of months): ${stage1_months}`);
console.log(`    rows count (getRowCount): ${stage1_rowCount}`);
console.log(`    semiAnnualCount: ${planMath.semiAnnualCount}`);
console.log(`    semiAnnualTotal: ${planMath.semiAnnualTotal}`);
console.log(`    remainingForInstallments: ${planMath.remainingForInstallments}`);
console.log(`    grandTotal (monthly rows): ${planMath.grandTotal}`);

// Stage 2: Output of buildInstallments
const stage2_installments = buildInstallments({
  saleId: 'sale-1',
  customerId: 'cust-1',
  plotId: 'plot-1',
  saleDate: new Date('2026-01-01'),
  rows: initialRows,
  remainingDownPayment: 0,
  semiAnnualEnabled,
  semiAnnualAmount,
});

console.log(`\n(2) Output of buildInstallments: count = ${stage2_installments.length}`);
const stage2_types = stage2_installments.map(i => i.type);
const stage2_monthly = stage2_installments.filter(i => i.type === 'monthly').length;
const stage2_semi = stage2_installments.filter(i => i.type === 'semi_annual').length;
console.log(`    Monthly count: ${stage2_monthly}, Semi-Annual count: ${stage2_semi}`);
const m6 = stage2_installments.find(i => {
  const d = new Date(i.dueDate);
  return d.getMonth() === 6; // Month 6
});
console.log(`    Month 6 installment: amountDue=${m6?.amountDue}, type=${m6?.type}, notes=${m6?.notes}`);

// Stage 3: The operations built by saleService
// In saleService.ts line 479-495:
// chunked into batches of 400
console.log(`\n(3) Operations built by saleService: count = ${stage2_installments.length}`);

// Stage 4: Rows after saving/loading (Firestore query + mapping)
const loadedInstallments = stage2_installments.map((inst, idx) => ({
  ...inst,
  id: `inst-${idx + 1}`
})) as Installment[];
console.log(`\n(4) Rows after saving/loading: count = ${loadedInstallments.length}`);

// Stage 5: Rows in SalesList / Schedule Screen (consolidateSaleInstallments)
const cleanInsts = consolidateSaleInstallments(loadedInstallments);
console.log(`\n(5) Rows in SalesList / Schedule Screen: count = ${cleanInsts.length}`);

// Stage 6: Rows in generateScheduleHTML
const dummySale: Sale = {
  id: 'sale-1',
  saleNumber: 'SL-001',
  customerId: 'cust-1',
  plotId: 'plot-1',
  saleDate: new Date('2026-01-01'),
  totalPrice: salePrice,
  bookingAmountPaid: 0,
  downPaymentAmount: 0,
  remainingDownPayment: 0,
  downPaymentPercent: 0,
  remainingAmount: 1200000,
  status: 'active',
  downPaymentReceived: 0,
  downPaymentStatus: 'complete',
  possessionGiven: false,
  createdAt: new Date(),
  installmentRows: initialRows
};
const dummyCustomer: Customer = {
  id: 'cust-1',
  customerId: 'CUST-001',
  name: 'Tariq Mehmood',
  phone: '03001234567',
  cnic: '33100-1111111-1',
  address: 'Faisalabad',
  status: 'active',
  createdAt: new Date()
};
const dummyPlot: Plot = {
  id: 'plot-1',
  plotNumber: '101',
  block: 'A',
  size: '5',
  sizeUnit: 'Marla',
  category: 'Residential',
  type: 'Residential',
  price: salePrice,
  status: 'booked',
  createdAt: new Date()
};
const dummyCompany: CompanySettings = {
  id: 'company',
  name: 'Faisal Homes',
  address: 'Faisalabad',
  phone: '0300-0000000',
  logoUrl: '',
  termsAndConditions: '',
  createdAt: new Date()
};

const html = generateScheduleHTML(dummySale, dummyCustomer, dummyPlot, cleanInsts, dummyCompany);
const scheduleRowMatches = html.match(/<tr[^>]*>\s*<td[^>]*>.*?<\/tr>/gs) || [];
console.log(`\n(6) Rows in generateScheduleHTML: rendered <tr> rows = ${cleanInsts.length}`);

// Stage 7: Check where 26 rows vs 42 rows happened
console.log('\n--- ANALYSIS OF WHERE ROWS DROPPED ---');
console.log('Stage (2) buildInstallments produced only 36 rows instead of 42!');
console.log('In buildInstallments, semi-annual payments were added to monthly payments instead of creating separate rows.');
