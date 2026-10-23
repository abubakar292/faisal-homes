import { chromium } from 'playwright';
import { generateScheduleHTML, generatePlotAgreement } from '../src/utils/printUtils';
import { buildInstallments } from '../src/utils/saleCalc';
import type { Sale, Customer, Plot, CompanySettings, Installment } from '../src/types';
import * as pdfjsLib from 'pdfjs-dist';
import * as fs from 'fs';

interface TestResult {
  docType: 'schedule' | 'agreement';
  expectedRows: number;
  pdfPages: number;
  missingCount: number;
  overflowingTextCount: number;
  finalCols: number;
  fontSize: string;
  zoom: string;
}

async function runTest(rowCount: number): Promise<{ scheduleRes: TestResult; agreementRes: TestResult }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

  const isSemi = rowCount === 42;
  const regularMonths = isSemi ? 36 : rowCount;
  const semiCount = isSemi ? 6 : 0;
  const monthlyAmt = 25000;
  const semiAmt = 50000;

  const instsRaw = buildInstallments({
    saleId: 's1',
    customerId: 'c1',
    plotId: 'p1',
    saleDate: '2026-01-01',
    rows: [{ months: regularMonths, interval: 1, monthlyAmount: monthlyAmt, totalAmount: regularMonths * monthlyAmt }],
    semiAnnualEnabled: isSemi,
    semiAnnualAmount: semiAmt,
  });

  const installments: Installment[] = instsRaw.map((i, idx) => ({ ...i, id: 'i' + idx }));
  const sale: Sale = {
    id: 's1',
    saleId: 'SALE-TEST',
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

  const customer: Customer = {
    id: 'c1',
    customerId: 'CUST-001',
    name: 'Muhammad Ali',
    cnic: '35201-1234567-1',
    phone: '03001234567',
    address: 'Lahore, Pakistan',
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

  const company: CompanySettings = {
    companyName: 'Faisal Homes',
    phone: '03001234567',
    email: 'info@faisalhomes.com',
    address: 'Lahore',
  };

  // 1. Schedule Test
  const schedHtml = generateScheduleHTML(sale, customer, plot, installments, company);
  await page.setContent(schedHtml, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const schedFitInfo = await page.evaluate(() => {
    const content = (document.querySelector('.lh-content') || document.querySelector('.lh-section')) as HTMLElement;
    const subTables = document.querySelectorAll('.lh-multicol-container table');
    return {
      cols: subTables.length || 1,
      fontSize: content?.style.fontSize || 'default',
      zoom: (content?.style as any)?.zoom || '1',
    };
  });

  const schedPdfBuf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(`schedule_${rowCount}.pdf`, schedPdfBuf);
  await page.screenshot({ path: `schedule_${rowCount}.png`, fullPage: true });

  const schedDoc = await pdfjsLib.getDocument({ data: new Uint8Array(schedPdfBuf) }).promise;
  const schedPages = schedDoc.numPages;

  let schedAllText = '';
  let schedOverflow = 0;
  for (let p = 1; p <= schedPages; p++) {
    const pageObj = await schedDoc.getPage(p);
    const vp = pageObj.getViewport({ scale: 1.0 });
    const tc = await pageObj.getTextContent();
    schedAllText += ' ' + tc.items.map((it: any) => it.str).join(' ');
    for (const it of tc.items as any[]) {
      if (it.str && it.str.trim().length > 0 && it.transform[4] + it.width > vp.width + 1) {
        schedOverflow++;
      }
    }
  }

  let schedMissing = 0;
  for (let m = 1; m <= regularMonths; m++) {
    if (!schedAllText.includes(`#${m}`) && !schedAllText.includes(`# ${m}`)) {
      schedMissing++;
    }
  }
  if (isSemi) {
    for (let s = 1; s <= semiCount; s++) {
      if (!schedAllText.includes(`SA ${s}`) && !schedAllText.includes(`Semi-Annual ${s}`)) {
        schedMissing++;
      }
    }
  }

  const scheduleRes: TestResult = {
    docType: 'schedule',
    expectedRows: rowCount,
    pdfPages: schedPages,
    missingCount: schedMissing,
    overflowingTextCount: schedOverflow,
    finalCols: schedFitInfo.cols,
    fontSize: schedFitInfo.fontSize,
    zoom: schedFitInfo.zoom,
  };

  // 2. Agreement Test
  const agreeHtml = generatePlotAgreement(sale, customer, plot, company);
  await page.setContent(agreeHtml, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const agreeFitInfo = await page.evaluate(() => {
    const content = (document.querySelector('.lh-content') || document.querySelector('.lh-section')) as HTMLElement;
    return {
      fontSize: content?.style.fontSize || 'default',
      zoom: (content?.style as any)?.zoom || '1',
    };
  });

  const agreePdfBuf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(`agreement_${rowCount}.pdf`, agreePdfBuf);
  await page.screenshot({ path: `agreement_${rowCount}.png`, fullPage: true });

  const agreeDoc = await pdfjsLib.getDocument({ data: new Uint8Array(agreePdfBuf) }).promise;
  const agreePages = agreeDoc.numPages;

  let agreeOverflow = 0;
  for (let p = 1; p <= agreePages; p++) {
    const pageObj = await agreeDoc.getPage(p);
    const vp = pageObj.getViewport({ scale: 1.0 });
    const tc = await pageObj.getTextContent();
    for (const it of tc.items as any[]) {
      if (it.str && it.str.trim().length > 0 && it.transform[4] + it.width > vp.width + 1) {
        agreeOverflow++;
      }
    }
  }

  const agreementRes: TestResult = {
    docType: 'agreement',
    expectedRows: 1, // single page agreement
    pdfPages: agreePages,
    missingCount: 0,
    overflowingTextCount: agreeOverflow,
    finalCols: 1,
    fontSize: agreeFitInfo.fontSize,
    zoom: agreeFitInfo.zoom,
  };

  await browser.close();
  return { scheduleRes, agreementRes };
}

async function main() {
  const rowCounts = [12, 36, 42, 60, 120, 180];
  console.log('=== RUNNING PRINT C TEST SUITE ===\n');

  for (const rc of rowCounts) {
    console.log(`Testing row count: ${rc}...`);
    const { scheduleRes, agreementRes } = await runTest(rc);
    console.log(`  Schedule (${rc} rows): Pages=${scheduleRes.pdfPages}, Missing=${scheduleRes.missingCount}, Overflow=${scheduleRes.overflowingTextCount}, Cols=${scheduleRes.finalCols}, Font=${scheduleRes.fontSize}, Zoom=${scheduleRes.zoom}`);
    console.log(`  Agreement: Pages=${agreementRes.pdfPages}, Overflow=${agreementRes.overflowingTextCount}, Font=${agreementRes.fontSize}, Zoom=${agreementRes.zoom}\n`);
  }
}

main().catch(console.error);
