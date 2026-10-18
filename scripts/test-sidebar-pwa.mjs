import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function run() {
  console.log('=== STARTING SIDEBAR & PWA VERIFICATION ===\n');

  // Verify manifest exists and is referenced
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes('manifest.json'), 'index.html must reference manifest.json');
  assert(indexHtml.includes('apple-mobile-web-app-capable'), 'index.html must include apple PWA meta tag');

  // Start preview server
  console.log('1. Starting preview server on port 4173...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    shell: true,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => process.stdout.write(d.toString()));
  server.stderr.on('data', (d) => process.stderr.write(d.toString()));

  // Wait for server to be up
  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log('2. Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    console.log('3. Navigating to http://localhost:4173/sales/new...');
    await page.goto('http://localhost:4173/sales/new', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check manifest response
    const manifestResp = await page.goto('http://localhost:4173/manifest.json');
    assert(manifestResp.status() === 200, 'manifest.json should return 200 OK');
    const manifestJson = await manifestResp.json();
    assert(manifestJson.name === 'Faisal Homes Property Management', 'Manifest name matches');
    assert(manifestJson.display === 'standalone', 'Manifest display is standalone');
    console.log('PWA Manifest verified: OK!');

    // Check service worker response
    const swResp = await page.goto('http://localhost:4173/sw.js');
    assert(swResp.status() === 200, 'sw.js should return 200 OK');
    console.log('PWA ServiceWorker script verified: OK!');

    // Back to app with demo3d=1 so Layout mounts
    await page.goto('http://localhost:4173/plots/map?demo3d=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Initial desktop sidebar: check width of aside
    const aside = page.locator('aside[aria-label="Desktop navigation"]');
    const asideBoxInitial = await aside.boundingBox();
    console.log(`Initial aside width: ${asideBoxInitial ? asideBoxInitial.width : 'null'}px`);

    // Click hamburger button to toggle sidebar collapse
    console.log('4. Clicking hamburger button...');
    await page.click('#navbar-hamburger');
    await page.waitForTimeout(600); // Wait for transition

    const asideBoxCollapsed = await aside.boundingBox();
    console.log(`Collapsed aside width: ${asideBoxCollapsed ? asideBoxCollapsed.width : 'null'}px`);
    assert(asideBoxCollapsed && Math.abs(asideBoxCollapsed.width - 70) <= 2, 'Collapsed aside width should be ~70px');

    // Check main padding-left
    const mainPaddingLeft = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? window.getComputedStyle(main).paddingLeft : null;
    });
    console.log(`Main element paddingLeft: ${mainPaddingLeft}`);
    assert(mainPaddingLeft === '70px', 'Main paddingLeft should be 70px when collapsed');

    // Save screenshot of collapsed state
    const artifactsDir = path.resolve('artifacts');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    const screenshotPath = path.join(artifactsDir, 'sidebar_collapsed_desktop.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot of collapsed desktop sidebar saved to ${screenshotPath}`);

    // Click hamburger button again to re-expand
    console.log('5. Clicking hamburger button again to re-expand...');
    await page.click('#navbar-hamburger');
    await page.waitForTimeout(600);

    const asideBoxExpanded = await aside.boundingBox();
    console.log(`Re-expanded aside width: ${asideBoxExpanded ? asideBoxExpanded.width : 'null'}px`);
    assert(asideBoxExpanded && Math.abs(asideBoxExpanded.width - 260) <= 2, 'Expanded aside width should be ~260px');

    const mainPaddingLeftExpanded = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? window.getComputedStyle(main).paddingLeft : null;
    });
    console.log(`Main element paddingLeft when re-expanded: ${mainPaddingLeftExpanded}`);
    assert(mainPaddingLeftExpanded === '260px', 'Main paddingLeft should be 260px when expanded');

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
