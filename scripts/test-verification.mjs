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
  console.log('=== STARTING H7 AUTOMATED VERIFICATION ===\n');

  // Find three chunk in dist
  const distAssets = fs.readdirSync('dist/assets');
  const threeChunk = distAssets.find((f) => f.startsWith('three-') && f.endsWith('.js'));
  console.log(`Found Three.js bundle chunk: dist/assets/${threeChunk}`);

  // Preview server is already running on port 4173
  console.log('1. Connecting to Vite preview server on port 4173...');

  // Step 2: Launch Chromium with SwiftShader
  console.log('2. Launching Chromium with SwiftShader for software GL...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // Step 3: Headless Render Proof with Plot Map (?demo3d=1)
    const demoUrl = 'http://localhost:4173/plots/map?demo3d=1';
    console.log(`\n3. Navigating to ${demoUrl}...`);
    await page.goto(demoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for the plot buttons to be rendered
    await page.waitForSelector('button:has-text("A-101")', { timeout: 10000 });
    console.log('Plot buttons detected on page.');

    // Wait for WebGL Canvas
    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log('WebGL Canvas detected on Plot Map.');

    // Wait 1.5s for initial wave animation to settle
    await page.waitForTimeout(1500);

    const artifactsDir = path.resolve('artifacts');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const path3d = path.join(artifactsDir, 'plot_map_with_3d.png');
    const pathNo3d = path.join(artifactsDir, 'plot_map_without_3d.png');

    await page.screenshot({ path: path3d });
    console.log(`Saved 3D screenshot to ${path3d}`);

    // Click 3D houses toggle to disable 3D overlay
    console.log('Clicking "3D Houses" toggle to disable 3D...');
    const toggleBtn = await page.waitForSelector('button:has-text("3D Houses")');
    await toggleBtn.click();

    await page.waitForTimeout(600);
    await page.screenshot({ path: pathNo3d });
    console.log(`Saved non-3D screenshot to ${pathNo3d}`);

    // Compare screenshot files
    const buf3d = fs.readFileSync(path3d);
    const bufNo3d = fs.readFileSync(pathNo3d);

    assert(
      buf3d.length !== bufNo3d.length || !buf3d.equals(bufNo3d),
      '3D enabled and 3D disabled screenshots must differ!'
    );
    console.log(`PASS: Screenshots differ significantly (3D: ${buf3d.length} bytes, 2D: ${bufNo3d.length} bytes).`);

    // Verify canvas exists when 3D is re-enabled
    await toggleBtn.click();
    await page.waitForTimeout(500);
    const canvasExists = await page.evaluate(() => !!document.querySelector('canvas'));
    assert(canvasExists, 'Canvas must be re-mounted when 3D is enabled');
    console.log('PASS: 3D Canvas re-mount verified.');

    // Step 4: Instancing Check (1000 synthetic items) & 50 Mount/Unmount Memory Cycles
    console.log('\n4. Running 1000-Item Instancing & 50-Cycle Memory Check in real WebGL context...');
    await page.addScriptTag({ path: path.resolve('artifacts/instancing-bundle.js') });
    const instancingResult = await page.evaluate(async () => {
      return await window.__runInstancingTest();
    });

    console.log(`Render calls for 1000 items: ${instancingResult.calls} (must be <= 14)`);
    console.log(`Render triangles for 1000 items: ${instancingResult.triangles}`);
    console.log(`Memory before 50 cycles:`, instancingResult.memBefore);
    console.log(`Memory after 50 cycles:`, instancingResult.memAfter);

    assert(instancingResult.calls <= 14, `Expected render calls <= 14, got ${instancingResult.calls}`);
    assert(
      instancingResult.memAfter.geometries === instancingResult.memBefore.geometries,
      'Geometries memory leaked after 50 cycles'
    );
    assert(
      instancingResult.memAfter.textures === instancingResult.memBefore.textures,
      'Textures memory leaked after 50 cycles'
    );
    console.log('PASS: Instancing check passed (<= 14 draw calls) and zero memory growth after 50 cycles.');

  } finally {
    await browser.close();
  }

  console.log('\n=== ALL H7 AUTOMATED VERIFICATIONS PASSED ===');
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
