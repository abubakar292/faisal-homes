import { chromium } from 'playwright';
import { generateScheduleHTML, generateAgreementHTML } from '../src/utils/printUtils';
import { buildInstallments } from '../src/utils/saleCalc';
import type { Sale, Customer, Plot, CompanySettings, Installment } from '../src/types';

async function testPrint(rowCount: number) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const customer: Customer = {
    id: 'c1',
    customerId: 'CUST-001',
    name: 'Muhammad Ali',
    fatherName: 'Ahmad Ali',
    cnic: '35201-1234567-1',
    phone: '03001234567',
    address: 'Lahore',
    createdAt: new Date(),
  };

  const plot: Plot = {
    id: 'p1',
    plotNumber: '105',
    block: 'A',
    size: 5,
    sizeUnit: 'Marla',
    category: 'Residential',
    type: 'Standard',
    status: 'sold',
    ratePerMarla: 300000,
    totalPrice: 1500000,
    createdAt: new Date(),
  };

  const months = rowCount >= 42 ? 36 : rowCount;
  const semiCount = rowCount >= 42 ? 6 : 0;
  const monthlyAmt = 25000;
  const semiAmt = 50000;

  const instsRaw = buildInstallments({
    saleId: 's1',
    customerId: 'c1',
    plotId: 'p1',
    saleDate: '2026-01-01',
    rows: [{ months: 36, interval: 1, monthlyAmount: monthlyAmt, totalAmount: 36 * monthlyAmt }],
    semiAnnualEnabled: semiCount > 0,
    semiAnnualAmount: semiAmt,
  });

  const installments: Installment[] = instsRaw.map((inst, idx) => ({
    ...inst,
    id: `inst_${idx}`,
  }));

  const sale: Sale = {
    id: 's1',
    saleId: 'SALE-001',
    plotId: 'p1',
    customerId: 'c1',
    saleDate: new Date('2026-01-01'),
    totalPrice: 1500000,
    discount: 0,
    finalPrice: 1500000,
    downPaymentAmount: 300000,
    bookingAmountPaid: 100000,
    remainingDownPayment: 200000,
    downPaymentReceived: 100000,
    remainingAmount: 1200000,
    paymentMethod: 'cash',
    status: 'active',
    createdAt: new Date(),
  };

  const company: CompanySettings = {
    companyName: 'Faisal Homes',
    phone: '0300-1234567',
    email: 'info@faisalhomes.com',
    address: 'Lahore, Pakistan',
  };

  const scheduleHtml = generateScheduleHTML(sale, customer, plot, installments, company);

  await page.setContent(scheduleHtml, { waitUntil: 'domcontentloaded' });

  const initialRows = await page.evaluate(() => {
    const table = document.querySelector('.lh-installment-table');
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).map((r, i) => ({
      index: i,
      text: r.textContent?.trim().replace(/\s+/g, ' '),
    }));
  });
  console.log('Initial table tbody rows count:', initialRows.length);
  console.log('First 3 initial rows:', initialRows.slice(0, 3));
  console.log('Last 3 initial rows:', initialRows.slice(-3));

  // Wait a moment for fit script to execute
  await page.waitForTimeout(500);

  // Evaluate state after fit script
  const domInfo = await page.evaluate(() => {
    const table = document.querySelector('.lh-installment-table') as HTMLElement;
    const origTrs = table ? Array.from(table.querySelectorAll('tbody tr')) : [];
    const multicol = document.querySelector('.lh-multicol-container') as HTMLElement;
    const subTables = document.querySelectorAll('.lh-multicol-container table');
    const content = (document.querySelector('.lh-content') || document.querySelector('.lh-section')) as HTMLElement;
    const allVisibleRows = Array.from(document.querySelectorAll('tr')).filter(tr => {
      const rect = tr.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(tr).display !== 'none';
    });

    return {
      origTbodyRowCount: origTrs.length,
      tableDisplay: table ? table.style.display : null,
      multicolExists: !!multicol,
      multicolDisplay: multicol ? multicol.style.display : null,
      subTableCount: subTables.length,
      subTableRows: Array.from(subTables).map(st => st.querySelectorAll('tbody tr').length),
      contentFontSize: content ? content.style.fontSize : null,
      contentZoom: content ? (content.style as any).zoom : null,
      totalVisibleRows: allVisibleRows.length,
      subTable1RowsText: Array.from(subTables[0]?.querySelectorAll('tbody tr') || []).map(r => r.textContent?.trim()),
    };
  });

  console.log('DOM Info:');
  console.log(JSON.stringify(domInfo, null, 2));

  // PDF generation
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });

  console.log(`Generated PDF (${pdfBuffer.length} bytes)`);

  await browser.close();
}

testPrint(42).catch(console.error);
