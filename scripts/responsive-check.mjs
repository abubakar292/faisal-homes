import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Environment variables E2E_EMAIL and E2E_PASSWORD are missing. Please provide them in the terminal for this run only (ideally for a test/staging Firebase project).');
  console.error('Example: $env:E2E_EMAIL="test@example.com"; $env:E2E_PASSWORD="password"; node scripts/responsive-check.mjs');
  process.exit(1);
}

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640, isMobile: true, hasTouch: true },
  { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: '430x932', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: '844x390', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: '768x1024', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: '834x1194', width: 834, height: 1194, isMobile: true, hasTouch: true },
  { name: '1024x768', width: 1024, height: 768, isMobile: false, hasTouch: false },
  { name: '1280x800', width: 1280, height: 800, isMobile: false, hasTouch: false },
];

const STATIC_ROUTES = [
  '/dashboard',
  '/plots/add',
  '/plots/list',
  '/plots/categories',
  '/plots/map',
  '/customers/add',
  '/customers/list',
  '/bookings/list',
  '/sales/new',
  '/sales/list',
  '/payment-plans/list',
  '/payments/receive',
  '/payments/history',
  '/payments/down-payments',
  '/dealers/add',
  '/dealers/list',
  '/dealers/commission',
  '/reports',
  '/reports/daily',
  '/reports/sales',
  '/reports/bookings',
  '/reports/installments',
  '/reports/collection',
  '/reports/pending',
  '/reports/dealer-commission',
  '/reports/plot-status',
  '/reports/shortage-list',
  '/settings/company',
  '/settings/users',
  '/settings/backup',
  '/settings/terms',
];

const FORBIDDEN_BUTTONS = /save|submit|complete|delete|cancel|confirm|pay|restore|reset|import|print|remove|capture/i;

async function run() {
  const artifactsDir = path.resolve(process.cwd(), 'artifacts/responsive');
  const reportsDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let totalFailures = 0;

  try {
    for (const vp of VIEWPORTS) {
      console.log(`Checking viewport: ${vp.name} (${vp.width}x${vp.height})`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });

      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      // 1. Login flow
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      const passInput = page.locator('input[type="password"], input[name="password"]');
      if (await emailInput.count() > 0) {
        await emailInput.first().fill(EMAIL);
        await passInput.first().fill(PASSWORD);
        const loginBtn = page.locator('button[type="submit"]');
        await loginBtn.first().click();
      }

      // Wait for splash screen to disappear
      try {
        await page.waitForSelector('[aria-label="Loading Faisal Homes"]', { state: 'detached', timeout: 15000 });
      } catch {
        // Splash might already be gone
      }
      await page.waitForTimeout(1000);

      // Check routes
      for (const route of STATIC_ROUTES) {
        let routePassed = true;
        const pageUrl = `${BASE_URL}${route}`;
        try {
          await page.goto(pageUrl, { waitUntil: 'load', timeout: 12000 });
          // Wait for section loader overlay to disappear if present
          try {
            await page.waitForSelector('.section-loader-overlay', { state: 'detached', timeout: 8000 });
          } catch {}
          await page.waitForTimeout(600);

          // Horizontal overflow check
          const overflowInfo = await page.evaluate(() => {
            const doc = document.documentElement;
            const diff = doc.scrollWidth - doc.clientWidth;
            const offenders = [];
            if (diff > 1) {
              const all = Array.from(document.querySelectorAll('*'));
              for (const el of all) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                if (style.position === 'fixed' && (el.offsetLeft < -200 || el.offsetLeft > window.innerWidth + 200)) continue;

                // check if ancestor has overflow-x auto|scroll|hidden|clip
                let ancestor = el.parentElement;
                let clipped = false;
                while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
                  const aStyle = window.getComputedStyle(ancestor);
                  if (['auto', 'scroll', 'hidden', 'clip'].includes(aStyle.overflowX)) {
                    clipped = true;
                    break;
                  }
                  ancestor = ancestor.parentElement;
                }
                if (clipped) continue;

                const rect = el.getBoundingClientRect();
                if (rect.right > window.innerWidth + 1 || rect.left < -1) {
                  let path = el.tagName.toLowerCase();
                  if (el.id) path += '#' + el.id;
                  else if (el.className && typeof el.className === 'string') {
                    path += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
                  }
                  offenders.push({ path, left: rect.left, right: rect.right, width: rect.width });
                  if (offenders.length >= 10) break;
                }
              }
            }
            return { diff, offenders };
          });

          // Touch targets check on touch viewports
          let smallTouchTargets = [];
          if (vp.hasTouch) {
            smallTouchTargets = await page.evaluate(() => {
              const main = document.querySelector('main') || document.body;
              const interactives = Array.from(main.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="checkbox"]'));
              const small = [];
              for (const el of interactives) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (rect.width < 40 || rect.height < 40) {
                  let desc = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 30);
                  small.push({ desc, width: Math.round(rect.width), height: Math.round(rect.height) });
                  if (small.length >= 10) break;
                }
              }
              return small;
            });
          }

          if (overflowInfo.diff > 1) {
            routePassed = false;
            totalFailures++;
          }

          // Screenshot
          const shotName = `${route.replace(/[\/:]/g, '_')}__${vp.name}.png`;
          await page.screenshot({ path: path.join(artifactsDir, shotName), fullPage: true });

          results.push({
            route,
            viewport: vp.name,
            passed: routePassed,
            overflowDiff: overflowInfo.diff,
            offenders: overflowInfo.offenders,
            smallTouchTargetsCount: smallTouchTargets.length,
            consoleErrors: [...consoleErrors],
          });
        } catch (err) {
          totalFailures++;
          results.push({
            route,
            viewport: vp.name,
            passed: false,
            error: err.message,
            consoleErrors: [...consoleErrors],
          });
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Write report.json
  fs.writeFileSync(path.join(artifactsDir, 'report.json'), JSON.stringify(results, null, 2), 'ascii');

  // Write reports/responsive-report.md
  let md = '# Responsive Check Report\n\n';
  md += `Total checks: ${results.length}, Failures: ${totalFailures}\n\n`;
  md += '| Route | Viewport | Status | Overflow Diff | Offenders | Small Touch Targets |\n';
  md += '|---|---|---|---|---|---|\n';
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    const offendersStr = (r.offenders || []).map((o) => o.path).join(', ') || '-';
    md += `| ${r.route} | ${r.viewport} | ${status} | ${r.overflowDiff || 0}px | ${offendersStr} | ${r.smallTouchTargetsCount || 0} |\n`;
  }
  fs.writeFileSync(path.join(reportsDir, 'responsive-report.md'), md, 'ascii');
  console.log(`Responsive check completed. Failures: ${totalFailures}`);
  process.exit(totalFailures > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
