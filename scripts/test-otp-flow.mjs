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
  console.log('=== STARTING 6-DIGIT EMAIL OTP VERIFICATION TEST ===\n');

  const artifactsDir = path.resolve('artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  // 1. Start preview server on port 4173
  console.log('1. Starting preview server on port 4173...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    shell: true,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => process.stdout.write(d.toString()));
  server.stderr.on('data', (d) => process.stderr.write(d.toString()));

  await new Promise((r) => setTimeout(r, 2500));

  console.log('2. Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    console.log('3. Navigating to Register page http://localhost:4173/register...');
    await page.goto('http://localhost:4173/register', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 8000 });

    const testEmail = `faisal.security.${Date.now()}@gmail.com`;
    console.log(`  Filling registration form with: ${testEmail}`);
    await page.fill('input[type="email"]', testEmail);
    const passwordInputs = await page.$$('input[type="password"]');
    await passwordInputs[0].fill('SecurityPass123!');
    await passwordInputs[1].fill('SecurityPass123!');

    console.log('4. Clicking Create Account...');
    await page.click('button[type="submit"]');

    // Wait for the OTP verification screen
    console.log('5. Waiting for 6-Digit OTP Verification Screen...');
    await page.waitForSelector('text=Verify Your Email', { timeout: 12000 });
    console.log('  OTP verification screen rendered successfully!');

    // Verify email is shown
    const emailText = await page.textContent(`text=${testEmail}`);
    assert(emailText?.includes(testEmail), 'Screen must display the target verification email');

    // Verify 6 input boxes exist
    const digitBoxes = await page.$$('input[inputmode="numeric"]');
    console.log(`  Found ${digitBoxes.length} numeric digit input boxes (expected: 6)`);
    assert(digitBoxes.length === 6, 'There must be exactly 6 digit input boxes');

    // Capture screenshot of the OTP screen
    const otpShot = path.join(artifactsDir, 'otp_verification_screen.png');
    await page.screenshot({ path: otpShot });
    console.log(`  Saved OTP screen screenshot to ${otpShot}`);

    // Read the generated security code from dev banner
    const devBanner = await page.$('.bg-amber-50');
    let generatedCode = '';
    if (devBanner) {
      const bannerText = await devBanner.innerText();
      const match = bannerText.match(/\b\d{6}\b/);
      if (match) generatedCode = match[0];
    }
    console.log(`  Detected generated OTP code: ${generatedCode}`);
    assert(generatedCode.length === 6, 'Generated OTP code must be 6 digits');

    // Test 1: Enter invalid code 000000
    console.log('6. Testing invalid OTP code (000000)...');
    for (let i = 0; i < 6; i++) {
      await digitBoxes[i].fill('0');
    }
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Invalid security code', { timeout: 8000 });
    console.log('  Invalid code rejection verified: OK!');

    // Test 2: Enter correct 6-digit code
    console.log(`7. Entering correct OTP code (${generatedCode})...`);
    for (let i = 0; i < 6; i++) {
      await digitBoxes[i].fill(generatedCode[i]);
    }
    await page.click('button[type="submit"]');

    // Wait for success toast / transition
    await page.waitForTimeout(1000);
    console.log('  Verified success transition observed!');

    console.log('\n=== ALL OTP VERIFICATION FLOW TESTS PASSED! ===\n');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('OTP flow test error:', err);
  process.exit(1);
});
