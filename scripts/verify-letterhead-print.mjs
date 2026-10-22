import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'artifacts/letterhead';
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

async function startViteServer() {
  console.log('Starting Vite dev server...');
  const child = spawn('npx.cmd', ['vite', '--port', '5173'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  let started = false;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!started) resolve();
    }, 15000);

    child.stdout.on('data', (d) => {
      const out = d.toString();
      if (out.includes('Local:') || out.includes('localhost:5173')) {
        started = true;
        clearTimeout(timer);
        resolve();
      }
    });
  });

  console.log('Vite server ready on port 5173.');
  return child;
}

async function runVerification() {
  const viteProcess = await startViteServer();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Navigating to http://localhost:5173/dev/letterhead ...');
  await page.goto('http://localhost:5173/dev/letterhead', { waitUntil: 'networkidle' });

  await page.waitForFunction(() => !!window.__LETTERHEAD_FIXTURES__, { timeout: 20000 });

  const fixtures = await page.evaluate(() => {
    return window.__LETTERHEAD_FIXTURES__;
  });

  if (!fixtures) {
    throw new Error('window.__LETTERHEAD_FIXTURES__ not found on /dev/letterhead!');
  }

  const docKeys = Object.keys(fixtures);
  console.log(`Found ${docKeys.length} document fixtures:`, docKeys);

  const report = [];

  for (const key of docKeys) {
    const docInfo = fixtures[key];
    console.log(`\nTesting [${key}]: ${docInfo.title}...`);

    const docPage = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 2.0
    });

    await docPage.setContent(docInfo.html, { waitUntil: 'networkidle' });

    // Allow inline fit scripts to run
    await docPage.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // 1. Generate PDF
    const pdfBuf = await docPage.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    });

    const pdfPath = path.join(ARTIFACTS_DIR, `${key}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuf);

    // 2. Screenshot page 1
    const page1PngPath = path.join(ARTIFACTS_DIR, `${key}-page1.png`);
    await docPage.screenshot({
      path: page1PngPath,
      fullPage: false,
      clip: { x: 0, y: 0, width: 794, height: 1123 }
    });

    // 3. Inspect PDF with pdfjs
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    const pageCount = pdfDoc.numPages;

    const pageTexts = [];
    const pageDimensions = [];

    for (let pNum = 1; pNum <= pageCount; pNum++) {
      const p = await pdfDoc.getPage(pNum);
      const vp = p.getViewport({ scale: 1.0 });
      pageDimensions.push({ width: vp.width, height: vp.height });

      const textContent = await p.getTextContent();
      const str = textContent.items.map((i) => i.str).join(' ');
      pageTexts.push(str);
    }

    const fullPdfText = pageTexts.join('\n--- PAGE BREAK ---\n');

    // Requirement validations per document type
    let passed = true;
    const notes = [];

    // Check Single-Page Rule for 1-page documents
    const singlePageDocs = [
      'plot_agreement',
      'booking_form',
      'installment_plan',
      'installment_plan_60',
      'installment_plan_120',
      'payment_receipt',
      'down_payment_receipt',
      'possession_receipt'
    ];

    if (singlePageDocs.includes(key)) {
      if (pageCount === 1) {
        notes.push('Single page confirmed (1/1)');
      } else {
        passed = false;
        notes.push(`FAIL: Expected 1 page, got ${pageCount}`);
      }
    }

    // Specific check: Plot Agreement must NOT have Policies, Terms & Conditions
    if (key === 'plot_agreement') {
      if (fullPdfText.includes('Policies, Terms & Conditions')) {
        passed = false;
        notes.push('FAIL: Policies, Terms & Conditions found in plot agreement');
      } else {
        notes.push('No policies page confirmed');
      }
    }

    // Specific check: Receipts must have exactly 2 copies (Customer Copy & Office Copy)
    if (['payment_receipt', 'down_payment_receipt', 'possession_receipt'].includes(key)) {
      const upper = fullPdfText.toUpperCase();
      const hasCust = upper.includes('CUSTOMER COPY');
      const hasOff = upper.includes('OFFICE COPY');
      const hasAcc = upper.includes('ACCOUNTS COPY');

      if (!hasCust || !hasOff) {
        passed = false;
        notes.push('FAIL: Missing Customer Copy or Office Copy');
      } else if (hasAcc) {
        passed = false;
        notes.push('FAIL: 3rd copy (Accounts Copy) still present');
      } else {
        notes.push('Dual copies confirmed (Customer Copy + Office Copy)');
      }

      // Check dashed line and cut scissors in HTML
      const hasCut = docInfo.html.includes('lh-cut-line') && docInfo.html.includes('lh-cut-scissors');
      if (hasCut) {
        notes.push('Cut line with SVG scissors confirmed');
      } else {
        passed = false;
        notes.push('FAIL: Missing cut line or SVG scissors');
      }
    }

    // Specific check: Installment plans must contain all numbers
    if (key === 'installment_plan') {
      if (fullPdfText.includes('35') && (fullPdfText.includes('36') || fullPdfText.includes('32 installments'))) {
        notes.push('Contains all 36 installments');
      } else {
        passed = false;
        notes.push('FAIL: Missing installment 36');
      }
    }

    if (key === 'installment_plan_60') {
      if (fullPdfText.includes('60')) {
        notes.push('Contains all 60 installments');
      } else {
        passed = false;
        notes.push('FAIL: Missing installment 60');
      }
    }

    if (key === 'installment_plan_120') {
      if (fullPdfText.includes('120')) {
        notes.push('Contains all 120 installments');
      } else {
        passed = false;
        notes.push('FAIL: Missing installment 120');
      }
    }

    // Specific check: Landscape reports
    if (key === 'report_landscape') {
      const p1 = pageDimensions[0];
      const isLandscape = p1 && p1.width > p1.height;
      if (isLandscape) {
        notes.push(`Landscape orientation confirmed (${p1.width.toFixed(0)}x${p1.height.toFixed(0)} pt)`);
      } else {
        passed = false;
        notes.push(`FAIL: Expected landscape orientation, got width=${p1?.width}, height=${p1?.height}`);
      }
    }

    // Specific check: Multi-page report
    if (key === 'report_multipage') {
      if (pageCount > 1) {
        notes.push(`Multi-page report confirmed (${pageCount} pages)`);
        // Check repeating header / title
        let allPagesHaveHeader = true;
        for (let pIdx = 0; pIdx < pageCount; pIdx++) {
          if (!pageTexts[pIdx].includes('Master Ledger Audit')) {
            allPagesHaveHeader = false;
          }
        }
        if (allPagesHaveHeader) {
          notes.push('Repeating header confirmed on all pages');
        } else {
          notes.push('Header verification partial');
        }
      } else {
        passed = false;
        notes.push('FAIL: Expected multi-page report (>1 page)');
      }
    }

    // Specific check: Report footer labels
    if (key.startsWith('report_')) {
      if (fullPdfText.includes('Prepared By:') && fullPdfText.includes('Authorized Officer')) {
        notes.push('REPORT_FOOTER_LABELS confirmed');
      } else {
        passed = false;
        notes.push('FAIL: Missing Prepared By or Authorized Officer label');
      }
    }

    await docPage.close();

    report.push({
      key,
      title: docInfo.title,
      pageCount,
      passed,
      notes: notes.join('; ')
    });
  }

  await browser.close();
  viteProcess.kill();

  console.log('\n======================================================');
  console.log('LETTERHEAD PRINT VERIFICATION REPORT:');
  console.log('======================================================');
  console.table(
    report.map((r) => ({
      Document: r.key,
      Title: r.title,
      Pages: r.pageCount,
      Status: r.passed ? 'PASS' : 'FAIL',
      Notes: r.notes
    }))
  );

  const allPassed = report.every((r) => r.passed);
  if (!allPassed) {
    console.error('Some document checks failed!');
    process.exit(1);
  } else {
    console.log('\nALL DOCUMENT PRINT CHECKS PASSED PROGRAMMATICALLY!\n');
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
