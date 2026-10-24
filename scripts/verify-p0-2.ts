import { chromium } from 'playwright';
import * as pdfjsLib from 'pdfjs-dist';
import * as fs from 'fs';
import path from 'path';
import { generateScheduleHTML } from '../src/utils/printUtils';
import { computeScheduleLayout } from '../src/utils/schedulePrintLayout';
import type { Sale, Customer, Plot, CompanySettings, Installment } from '../src/types';

interface CaseResult {
  rows: number;
  blocks: number;
  fontPt: number;
  pageHeight: number;
  numPages: number;
  missingItems: number;
  outOfBoundsItems: number;
  pngPath: string;
  pdfPath: string;
}

async function verifyAllCases() {
  const browser = await chromium.launch({ headless: true });
  const results: CaseResult[] = [];
  const testCases = [5, 12, 36, 42, 60, 120, 180];

  const outputDir = path.resolve('artifacts_p0_2');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const rowCount of testCases) {
    const isSemi = rowCount === 42;
    const monthlyCount = isSemi ? 36 : rowCount;
    const semiCount = isSemi ? 6 : 0;
    const monthlyAmt = 65000;
    const semiAmt = 50000;

    const installments: Installment[] = [];
    const baseDate = new Date('2026-01-15T12:00:00');

    // Generate monthly installments
    for (let m = 1; m <= monthlyCount; m++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + m);
      installments.push({
        id: `inst_m_${m}`,
        saleId: 's1',
        installmentNumber: m,
        type: 'monthly',
        dueDate: d,
        amountDue: monthlyAmt,
        amountPaid: m <= 2 ? monthlyAmt : 0,
        status: m <= 2 ? 'paid' : 'pending',
        createdAt: new Date(),
      } as Installment);
    }

    // Generate semi-annual installments if applicable
    if (isSemi) {
      for (let s = 1; s <= semiCount; s++) {
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() + s * 6);
        installments.push({
          id: `inst_sa_${s}`,
          saleId: 's1',
          installmentNumber: s,
          totalInstallments: 6,
          type: 'semi_annual',
          dueDate: d,
          amountDue: semiAmt,
          amountPaid: 0,
          status: 'pending',
          createdAt: new Date(),
        } as Installment);
      }
    }

    const sale: Sale = {
      id: 's1',
      saleNumber: 'SALE-2026-001',
      plotId: 'p1',
      customerId: 'c1',
      saleDate: baseDate,
      totalPrice: 4500000,
      discount: 0,
      finalPrice: 4500000,
      downPaymentAmount: 500000,
      bookingAmountPaid: 100000,
      remainingDownPayment: 400000,
      downPaymentReceived: 100000,
      remainingAmount: 4000000,
      status: 'active',
      createdAt: new Date(),
    };

    const customer: Customer = {
      id: 'c1',
      customerId: 'CUST-2026-001',
      name: 'Abubakar Ahmad',
      cnic: '35201-1234567-1',
      phone: '0300-1234567',
      address: 'Lahore, Pakistan',
      createdAt: new Date(),
    };

    const plot: Plot = {
      id: 'p1',
      plotNumber: 'A-225',
      block: 'A',
      size: 7,
      sizeUnit: 'Marla',
      category: 'Residential',
      type: 'Standard',
      status: 'sold',
      ratePerMarla: 600000,
      totalPrice: 4200000,
      createdAt: new Date(),
    };

    const company: CompanySettings = {
      name: 'Faisal Homes & Builders',
      phone: '042-111-222-333',
      email: 'info@faisalhomes.com',
      address: 'Main Boulevard, Faisal Homes, Lahore',
    } as any;

    const html = generateScheduleHTML(sale, customer, plot, installments, company);
    const layout = computeScheduleLayout(rowCount);

    const page = await browser.newPage({
      viewport: {
        width: 794,
        height: Math.round((layout.pageHeight / 25.4) * 96),
      },
    });

    await page.setContent(html, { waitUntil: 'load' });
    // Wait for fonts to be ready
    await page.evaluate(() => (document as any).fonts ? (document as any).fonts.ready : Promise.resolve());
    await page.waitForTimeout(300);

    const pdfBuffer = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });

    const pdfPath = path.join(outputDir, `schedule_${rowCount}.pdf`);
    const pngPath = path.join(outputDir, `schedule_${rowCount}.png`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    await page.screenshot({ path: pngPath, fullPage: true });

    // Inspect PDF using pdfjs
    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    const numPages = pdfDoc.numPages;

    let fullText = '';
    let outOfBoundsCount = 0;

    for (let p = 1; p <= numPages; p++) {
      const pageObj = await pdfDoc.getPage(p);
      const vp = pageObj.getViewport({ scale: 1.0 });
      const textContent = await pageObj.getTextContent();
      fullText += ' ' + textContent.items.map((it: any) => it.str).join(' ');

      for (const it of textContent.items as any[]) {
        if (it.str && it.str.trim().length > 0) {
          const x = it.transform[4];
          const y = it.transform[5];
          if (x < -2 || x + (it.width || 0) > vp.width + 2 || y < -2 || y > vp.height + 2) {
            outOfBoundsCount++;
          }
        }
      }
    }

    // Verify all installment numbers exist
    let missingCount = 0;
    for (let m = 1; m <= monthlyCount; m++) {
      if (!fullText.includes(`#${m}`) && !fullText.includes(`# ${m}`)) {
        missingCount++;
      }
    }
    if (isSemi) {
      for (let s = 1; s <= semiCount; s++) {
        if (!fullText.includes(`Semi-Annual ${s} of 6`)) {
          missingCount++;
        }
      }
    }

    results.push({
      rows: rowCount,
      blocks: layout.c,
      fontPt: layout.fontPt,
      pageHeight: layout.pageHeight,
      numPages,
      missingItems: missingCount,
      outOfBoundsItems: outOfBoundsCount,
      pngPath,
      pdfPath,
    });

    await page.close();
  }

  await browser.close();

  // Print results table
  console.log('\n=== P0-2 VERIFICATION RESULTS ===\n');
  console.log(
    'Rows'.padEnd(8) +
    'Blocks'.padEnd(8) +
    'Font (pt)'.padEnd(12) +
    'Page H (mm)'.padEnd(14) +
    'Pages'.padEnd(8) +
    'Missing'.padEnd(10) +
    'Out of Bounds'.padEnd(15) +
    'Status'
  );
  console.log('-'.repeat(85));

  let allPass = true;
  for (const r of results) {
    const pass = r.numPages === 1 && r.missingItems === 0 && r.outOfBoundsItems === 0 && r.fontPt >= 7;
    if (!pass) allPass = false;
    console.log(
      String(r.rows).padEnd(8) +
      String(r.blocks).padEnd(8) +
      String(r.fontPt).padEnd(12) +
      String(r.pageHeight).padEnd(14) +
      String(r.numPages).padEnd(8) +
      String(r.missingItems).padEnd(10) +
      String(r.outOfBoundsItems).padEnd(15) +
      (pass ? 'PASS (1 page)' : 'FAIL')
    );
  }

  console.log('\nOverall Result:', allPass ? 'ALL 7 CASES PASSED (100% 1 PAGE)' : 'FAILURES DETECTED');
  return results;
}

verifyAllCases().catch(err => {
  console.error(err);
  process.exit(1);
});
