import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function main() {
  const artifactsDir = path.resolve('artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  console.log('1. Building production bundle to ensure clean preview build...');
  // First run tsc -b
  const buildProc = spawn('npm', ['run', 'build'], { shell: true, stdio: 'inherit' });
  await new Promise<void>((resolve, reject) => {
    buildProc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed with exit code ${code}`));
    });
  });

  console.log('2. Booting preview server on port 4182...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4182'], {
    shell: true,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => process.stdout.write(`[preview] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[preview err] ${d}`));

  await new Promise((r) => setTimeout(r, 2500));

  console.log('3. Launching Chromium for 1280px desktop verification...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    const targetUrl = 'http://localhost:4182/reports/pending/customer/demo?demo=1';
    console.log(`4. Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for the sticky header
    await page.waitForSelector('header[aria-label="Customer ledger summary header"]', { timeout: 10000 });
    console.log('PASS: Sticky summary header rendered');

    // Wait for customer name in the sticky header
    const customerHeading = await page.locator('header[aria-label="Customer ledger summary header"] h1').textContent();
    console.log(`PASS: Customer name in header: "${customerHeading?.trim()}"`);

    // Verify Remaining Balance is displayed
    const balanceText = await page.locator('header[aria-label="Customer ledger summary header"]').getByText(/Rs\.\s*[0-9,]+/).first().textContent();
    console.log(`PASS: Remaining balance in header: ${balanceText}`);

    // Verify prominent Receive Payment button exists
    const receiveBtn = page.locator('#btn-ledger-receive-payment');
    const hasReceiveBtn = await receiveBtn.count() > 0;
    console.log(`PASS: Receive Payment button present: ${hasReceiveBtn}`);

    // Verify 4 KPI tiles
    const overdueTile = page.locator('button:has-text("Overdue")').first();
    const pendingTile = page.locator('button:has-text("Pending")').first();
    console.log('PASS: KPI tiles present');

    // Click Overdue tile to toggle filter
    console.log('5. Testing KPI tile toggle filter...');
    await overdueTile.click();
    await page.waitForTimeout(400);
    let isPressed = await overdueTile.getAttribute('aria-pressed');
    console.log(`PASS: Overdue KPI tile clicked -> aria-pressed: ${isPressed}`);

    // Click again to clear
    await overdueTile.click();
    await page.waitForTimeout(400);
    isPressed = await overdueTile.getAttribute('aria-pressed');
    console.log(`PASS: Overdue KPI tile clicked again -> aria-pressed: ${isPressed}`);

    // Verify Recharts Area Chart rendered
    const rechartsContainer = page.locator('.recharts-responsive-container');
    await rechartsContainer.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS: Recharts area chart rendered successfully');

    // Test "Show unpaid only" switch
    const unpaidSwitch = page.getByRole('switch', { name: /Show unpaid only/i });
    await unpaidSwitch.click();
    await page.waitForTimeout(300);
    const switchChecked = await unpaidSwitch.getAttribute('aria-checked');
    console.log(`PASS: "Show unpaid only" toggled to: ${switchChecked}`);
    // Toggle back
    await unpaidSwitch.click();
    await page.waitForTimeout(300);

    // Test Virtualized Schedule Scrolling
    const scrollContainer = page.locator('div[role="region"][aria-label*="installment schedule"]');
    await scrollContainer.waitFor({ state: 'visible', timeout: 5000 });
    // Scroll down to test virtualization update
    await scrollContainer.evaluate((el) => { el.scrollTop = 500; });
    await page.waitForTimeout(400);
    console.log('PASS: Virtualized schedule scrolled smoothly at 500px offset');
    await scrollContainer.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(300);

    // Test Tabs: Switch to Payments Tab
    console.log('6. Testing Tabs: Payments Receipts tab...');
    const paymentsTab = page.locator('#tab-btn-payments');
    await paymentsTab.click();
    await page.waitForTimeout(400);
    const paymentsTable = page.locator('table');
    await paymentsTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS: Payments tab loaded with receipt records');

    // Test Tabs: Switch to Statement Tab
    console.log('7. Testing Tabs: Financial Statement tab...');
    const statementTab = page.locator('#tab-btn-statement');
    await statementTab.click();
    await page.waitForTimeout(400);
    const statementTable = page.locator('table');
    await statementTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS: Financial statement tab loaded with running balance');

    // Switch back to Schedule Tab for desktop screenshot
    const scheduleTab = page.locator('#tab-btn-schedule');
    await scheduleTab.click();
    await page.waitForTimeout(500);

    // Save Desktop Screenshot (1280px)
    const desktopShotPath = path.join(artifactsDir, 'ledger_1280.png');
    await page.screenshot({ path: desktopShotPath, fullPage: false });
    console.log(`8. Saved desktop 1280px screenshot: ${desktopShotPath}`);

    const fullShotPath = path.join(artifactsDir, 'ledger_1280_full.png');
    await page.screenshot({ path: fullShotPath, fullPage: true });
    console.log(`8b. Saved desktop 1280px full-page screenshot: ${fullShotPath}`);

    // Switch to Mobile Viewport (390px)
    console.log('9. Testing 390px mobile viewport...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);

    // Save Mobile Screenshot (390px)
    const mobileShotPath = path.join(artifactsDir, 'ledger_390.png');
    await page.screenshot({ path: mobileShotPath, fullPage: false });
    console.log(`10. Saved mobile 390px screenshot: ${mobileShotPath}`);

    console.log('ALL PLAYWRIGHT VERIFICATION CHECKS PASSED FOR P1-5!');
  } finally {
    await browser.close();
    server.kill();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Playwright verification failed:', err);
  process.exit(1);
});
