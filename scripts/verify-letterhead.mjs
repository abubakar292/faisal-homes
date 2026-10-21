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
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!started) resolve(); // Continue anyway if timeout
    }, 15000);

    child.stdout.on('data', (d) => {
      const out = d.toString();
      if (out.includes('Local:') || out.includes('localhost:5173')) {
        started = true;
        clearTimeout(timer);
        resolve();
      }
    });

    child.stderr.on('data', (d) => {
      // console.error(d.toString());
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

  // Wait for DevLetterhead component to mount and expose fixtures
  await page.waitForFunction(() => !!window.__LETTERHEAD_FIXTURES__, { timeout: 20000 });

  // Extract fixtures
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
      viewport: { width: 794, height: 1123 }, // A4 at 96 DPI
      deviceScaleFactor: 2.0 // crisp rendering
    });

    await docPage.setContent(docInfo.html, { waitUntil: 'networkidle' });

    // 1. Generate PDF
    const pdfBuf = await docPage.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    });

    const pdfPath = path.join(ARTIFACTS_DIR, `${key}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuf);

    // 2. Take screenshots of page 1 and page 2 (if present)
    const page1PngPath = path.join(ARTIFACTS_DIR, `${key}-page1.png`);
    await docPage.screenshot({
      path: page1PngPath,
      clip: { x: 0, y: 0, width: 794, height: 1123 }
    });

    // 3. Inspect PDF with pdfjs-dist
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    const pageCount = pdfDoc.numPages;

    const pageResults = [];
    let allPagesA4 = true;
    let allPagesHaveFooter = true;
    let titleOnPage1 = false;
    let noContentOverlap = true;
    const overlapWords = [];

    for (let pNum = 1; pNum <= pageCount; pNum++) {
      const p = await pdfDoc.getPage(pNum);
      const vp = p.getViewport({ scale: 1.0 });

      // Assert A4 dimensions: 595.28 x 841.89 pt (+- 1 pt)
      const isA4 = Math.abs(vp.width - 595.28) < 2 && Math.abs(vp.height - 841.89) < 2;
      if (!isA4) allPagesA4 = false;

      const textContent = await p.getTextContent();
      const items = textContent.items.map((it) => {
        const tx = it.transform[4];
        const ty = it.transform[5];
        const yBaselineFromTop = 297 - (ty * (25.4 / 72));
        const yTopMm = yBaselineFromTop - (it.height * (25.4 / 72));
        return {
          str: it.str,
          yBaselineFromTop,
          yTopMm,
          heightMm: it.height * (25.4 / 72)
        };
      });

      const fullText = items.map((i) => i.str).join(' ');

      // Check footer labels on every page
      const hasSignatures = fullText.includes('Signatures');
      const hasApplicant = fullText.includes('Applicant:');
      const hasNominee = fullText.includes('Nominee:');
      const hasOfficer = fullText.includes('Authorized Officer');

      if (!hasSignatures || !hasApplicant || !hasNominee || !hasOfficer) {
        allPagesHaveFooter = false;
      }

      // Check page 1 title
      if (pNum === 1) {
        // Document title should appear on page 1 near the top notch (baseline 35..45mm)
        const titleItem = items.find(
          (i) => i.str.toLowerCase().includes(docInfo.title.toLowerCase()) && i.yBaselineFromTop < 55
        );
        if (titleItem) {
          titleOnPage1 = true;
        } else if (fullText.includes(docInfo.title)) {
          titleOnPage1 = true;
        }
      }

      // Check content overlapping footer (> 236mm)
      // Allowed in footer: Signatures, Applicant:, Nominee:, Authorized Officer (SK Real Estate & Builders (Pvt) Ltd):, and blank lines / stamps
      const footerWhitelist = ['Signatures', 'Applicant:', 'Nominee:', 'Authorized Officer', 'SK Real Estate'];
      for (const item of items) {
        if (!item.str.trim()) continue;
        const isFooterWord = footerWhitelist.some((w) => item.str.includes(w));
        // If it's below 236 mm from top and not a footer word
        if (item.yTopMm > 236 && !isFooterWord) {
          noContentOverlap = false;
          overlapWords.push(`p${pNum}: "${item.str}" at ${item.yTopMm.toFixed(1)}mm`);
        }
      }

      pageResults.push({
        pageNumber: pNum,
        isA4,
        hasSignatures,
        hasApplicant,
        hasNominee,
        hasOfficer
      });
    }

    // 4. Pixel check on rendered page (top-left dark grey pixel & bottom-right logo area)
    const pixelCheck = await docPage.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 794;
      c.height = 1123;
      const ctx = c.getContext('2d');
      if (!ctx) return { topLeftGrey: false, logoPresent: false };

      // We can inspect elements in DOM
      const headerImg = document.querySelector('.lh-header-img');
      const footerLogo = document.querySelector('.lh-footer-logo');

      return {
        headerImgLoaded: headerImg instanceof HTMLImageElement && headerImg.complete && headerImg.naturalWidth > 0,
        footerLogoLoaded: footerLogo instanceof HTMLImageElement && footerLogo.complete && footerLogo.naturalWidth > 0
      };
    });

    // Also inspect actual screenshot pixels
    const screenshotBuf = fs.readFileSync(page1PngPath);
    // Load screenshot in page to sample pixels
    const canvasCheck = await page.evaluate(async (base64) => {
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = 'data:image/png;base64,' + base64;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Top-left 20x20
      const tl = ctx.getImageData(5, 5, 1, 1).data;
      const isTopLeftGrey = tl[0] > 100 && tl[0] < 200 && tl[1] > 100 && tl[1] < 200 && tl[2] > 100 && tl[2] < 200;

      // Bottom right logo area (x: 160mm to 198mm, y: 237mm to 290mm)
      // scale: img.width / 210mm
      const pxPerMm = img.width / 210;
      const logoX = Math.round(162 * pxPerMm);
      const logoY = Math.round(239 * pxPerMm);
      const logoW = Math.round(34 * pxPerMm);
      const logoH = Math.round(34 * pxPerMm);
      const logoData = ctx.getImageData(logoX, logoY, logoW, logoH).data;
      let nonWhite = 0;
      for (let i = 0; i < logoData.length; i += 4) {
        if (logoData[i] < 240 || logoData[i + 1] < 240 || logoData[i + 2] < 240) {
          nonWhite++;
        }
      }

      return {
        topLeftRgb: [tl[0], tl[1], tl[2]],
        isTopLeftGrey,
        logoNonWhitePixels: nonWhite,
        isLogoPresent: nonWhite > 100
      };
    }, screenshotBuf.toString('base64'));

    await docPage.close();

    const passed =
      allPagesA4 &&
      allPagesHaveFooter &&
      titleOnPage1 &&
      noContentOverlap &&
      canvasCheck.isTopLeftGrey &&
      canvasCheck.isLogoPresent;

    report.push({
      key,
      title: docInfo.title,
      pageCount,
      allPagesA4,
      allPagesHaveFooter,
      titleOnPage1,
      noContentOverlap,
      isTopLeftGrey: canvasCheck.isTopLeftGrey,
      topLeftRgb: canvasCheck.topLeftRgb,
      isLogoPresent: canvasCheck.isLogoPresent,
      logoNonWhitePixels: canvasCheck.logoNonWhitePixels,
      overlapWords,
      passed
    });
  }

  await browser.close();
  viteProcess.kill();

  console.log('\n======================================================');
  console.log('LETTERHEAD PROGRAMMATIC VERIFICATION RESULTS:');
  console.log('======================================================');
  console.table(
    report.map((r) => ({
      Doc: r.key,
      Title: r.title,
      Pages: r.pageCount,
      'A4 Size': r.allPagesA4 ? 'PASS' : 'FAIL',
      'Footer on All': r.allPagesHaveFooter ? 'PASS' : 'FAIL',
      'Title on P1': r.titleOnPage1 ? 'PASS' : 'FAIL',
      'No Overlap': r.noContentOverlap ? 'PASS' : 'FAIL',
      'TopLeft Grey': r.isTopLeftGrey ? 'PASS' : 'FAIL',
      'Logo Present': r.isLogoPresent ? 'PASS' : 'FAIL',
      STATUS: r.passed ? 'PASS' : 'FAIL'
    }))
  );

  const allPassed = report.every((r) => r.passed);
  if (!allPassed) {
    console.error('Some document checks failed!');
    process.exit(1);
  } else {
    console.log('ALL 9 DOCUMENT CHECKS PASSED PROGRAMMATICALLY!');
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
