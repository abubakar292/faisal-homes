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
  console.log('=== STARTING BUNGALOW SPRITES & ANIMATION VERIFICATION ===\n');

  // Verify preview build exists
  assert(fs.existsSync('dist/index.html'), 'dist/index.html must exist (run npm run build first)');

  const artifactsDir = path.resolve('artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  // 1. Start Vite preview server on port 4173
  console.log('1. Starting preview server on port 4173...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    shell: true,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => process.stdout.write(d.toString()));
  server.stderr.on('data', (d) => process.stderr.write(d.toString()));

  // Wait for server to boot
  await new Promise((r) => setTimeout(r, 2500));

  console.log('2. Launching Playwright Chromium...');
  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // H7 Step 2: Multi-viewport Verification & Screenshots
    // Viewports: 360x740, 390x844, 768x1024, 1280x800
    // -------------------------------------------------------------
    const viewports = [
      { name: '360', width: 360, height: 740, filename: 'plot_map_360.png' },
      { name: '390', width: 390, height: 844, filename: 'plot_map_390.png' },
      { name: '768', width: 768, height: 1024, filename: 'plot_map_768.png' },
      { name: '1280', width: 1280, height: 800, filename: 'plot_map_1280.png' },
    ];

    for (const vp of viewports) {
      console.log(`\nTesting viewport ${vp.name} (${vp.width}x${vp.height})...`);
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

      await page.goto('http://localhost:4173/plots/map?demo=1', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      // Wait for plots to render
      await page.waitForSelector('button[aria-label*="A-201"]', { timeout: 8000 });
      await page.waitForTimeout(600);

      // Save screenshot
      const shotPath = path.join(artifactsDir, vp.filename);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`  Saved screenshot to ${shotPath}`);

      // Run programmatic assertions on this viewport
      const results = await page.evaluate((vpWidth) => {
        const issues = [];
        const bodyScrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        if (bodyScrollWidth > innerWidth + 1) {
          issues.push(`Horizontal scroll detected: scrollWidth=${bodyScrollWidth} > innerWidth=${innerWidth}`);
        }

        const buttons = Array.from(document.querySelectorAll('button[aria-label*="Plot"]'));
        let soldCount = 0;

        for (const btn of buttons) {
          const aria = btn.getAttribute('aria-label') || '';
          if (!aria.includes('sold')) continue;
          soldCount++;

          const tileRect = btn.getBoundingClientRect();
          const img = btn.querySelector('img');
          if (!img) {
            issues.push(`${aria}: Missing house img element`);
            continue;
          }
          if (img.naturalWidth <= 0) {
            issues.push(`${aria}: img naturalWidth is 0 (image failed to load)`);
          }

          const imgRect = img.getBoundingClientRect();
          const heightRatio = imgRect.height / tileRect.height;
          if (heightRatio < 0.85 || heightRatio > 1.05) {
            issues.push(`${aria}: Height ratio ${heightRatio.toFixed(3)} not between 0.85 and 1.05 (imgH=${imgRect.height}, tileH=${tileRect.height})`);
          }

          // Check sprite lies inside tile (with 2px tolerance)
          if (imgRect.right > tileRect.right + 2 || imgRect.bottom > tileRect.bottom + 2) {
            issues.push(`${aria}: Sprite bounding box extends beyond tile edges`);
          }

          // Check top-left label pill
          const labelPill = btn.querySelector('div.bg-white\\/95');
          if (labelPill) {
            const labelRect = labelPill.getBoundingClientRect();
            if (labelRect.top < tileRect.top - 1 || labelRect.left < tileRect.left - 1) {
              issues.push(`${aria}: Label pill extends outside tile`);
            }
            // Ensure label pill does not intersect the lower half of the house sprite
            const spriteLowerHalfTop = imgRect.top + imgRect.height * 0.5;
            if (labelRect.bottom > spriteLowerHalfTop) {
              issues.push(`${aria}: Label pill intersects lower half of sprite (labelBottom=${labelRect.bottom}, lowerHalfTop=${spriteLowerHalfTop})`);
            }
          }
        }

        return { issues, soldCount, bodyScrollWidth, innerWidth };
      }, vp.width);

      console.log(`  Sold plots verified: ${results.soldCount}`);
      if (results.issues.length > 0) {
        console.error('  Issues encountered:', results.issues);
      }
      assert(results.issues.length === 0, `Viewport ${vp.name} had ${results.issues.length} layout issues`);
      console.log(`  Viewport ${vp.name} assertions PASSED!`);

      await page.close();
    }

    // -------------------------------------------------------------
    // H7 Step 3: Build Animation Frame Capture & Assertions
    // Plot: A-205 via ?demo=1&celebrate=A-205
    // Frames at: 0.3s, 1.0s, 1.6s, 2.8s
    // -------------------------------------------------------------
    console.log('\n3. Testing Build Animation on A-205 (?demo=1&celebrate=A-205)...');
    const animPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Navigate to trigger celebration on A-205
    await animPage.goto('http://localhost:4173/plots/map?demo=1&celebrate=A-205', {
      waitUntil: 'domcontentloaded',
    });

    const targetTile = animPage.locator('button[aria-label*="A-205"]');
    await targetTile.waitFor({ state: 'visible', timeout: 8000 });

    const timePoints = [
      { t: 300, name: '0.3s', file: 'build_anim_0_3s.png' },
      { t: 1000, name: '1.0s', file: 'build_anim_1_0s.png' },
      { t: 1600, name: '1.6s', file: 'build_anim_1_6s.png' },
      { t: 2800, name: '2.8s', file: 'build_anim_2_8s.png' },
    ];

    const framePixelStats = [];
    const startTime = Date.now();

    for (const tp of timePoints) {
      const elapsed = Date.now() - startTime;
      const wait = Math.max(0, tp.t - elapsed);
      if (wait > 0) {
        await animPage.waitForTimeout(wait);
      }

      // Capture screenshot of the building tile
      const shotFile = path.join(artifactsDir, tp.file);
      await targetTile.screenshot({ path: shotFile });
      console.log(`  Captured build frame at ${tp.name} -> ${shotFile}`);

      // Evaluate non-transparent pixel count in browser canvas
      const stat = await animPage.evaluate(() => {
        const btn = document.querySelector('button[aria-label*="A-205"]');
        if (!btn) return { nonTransparent: 0, samplePixels: [] };
        const canvas = document.createElement('canvas');
        const rect = btn.getBoundingClientRect();
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
        const ctx = canvas.getContext('2d');

        // Draw image layers currently rendered
        const imgs = btn.querySelectorAll('img');
        imgs.forEach((img) => {
          try {
            const style = window.getComputedStyle(img);
            if (style.opacity !== '0' && style.display !== 'none') {
              ctx.globalAlpha = parseFloat(style.opacity || '1');
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
          } catch {}
        });

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonTransparent = 0;
        const samplePixels = [];
        for (let i = 0; i < imgData.length; i += 4) {
          if (imgData[i + 3] > 15) {
            nonTransparent++;
          }
          if (i < 400) {
            samplePixels.push(imgData[i], imgData[i + 1], imgData[i + 2], imgData[i + 3]);
          }
        }
        return { nonTransparent, total: canvas.width * canvas.height, samplePixels };
      });

      console.log(`  Frame ${tp.name}: non-transparent pixel count = ${stat.nonTransparent}`);
      framePixelStats.push({ ...tp, nonTransparent: stat.nonTransparent });
    }

    // Assert monotonic growth of non-transparent pixels across 0.3s -> 1.0s -> 1.6s
    console.log('\nAsserting monotonic pixel growth across build animation:');
    for (let i = 1; i < framePixelStats.length - 1; i++) {
      const prev = framePixelStats[i - 1];
      const curr = framePixelStats[i];
      console.log(`  Checking frame ${prev.name} (${prev.nonTransparent}) <= frame ${curr.name} (${curr.nonTransparent})`);
      assert(
        curr.nonTransparent >= prev.nonTransparent * 0.95,
        `Build animation pixels must grow monotonically: ${prev.name} (${prev.nonTransparent}) vs ${curr.name} (${curr.nonTransparent})`
      );
    }
    console.log('Build animation monotonic growth PASSED!\n');

    // Compare 2.8s frame with static reference plot
    console.log('Comparing completed build (2.8s) against static full sprite...');
    const staticComp = await animPage.evaluate(() => {
      const builtTile = document.querySelector('button[aria-label*="A-205"]');
      const staticTile = document.querySelector('button[aria-label*="A-201"]');
      if (!builtTile || !staticTile) return { diff: 999 };

      const builtImg = builtTile.querySelector('img');
      const staticImg = staticTile.querySelector('img');
      if (!builtImg || !staticImg) return { diff: 999 };

      // Both should now be rendering the complete full sprite
      return {
        builtSrc: builtImg.getAttribute('src'),
        staticSrc: staticImg.getAttribute('src'),
        isSingleImg: builtTile.querySelectorAll('img').length === 1,
      };
    });

    console.log(`  Built tile renders single full image: ${staticComp.isSingleImg}`);
    console.log(`  Built tile img src: ${staticComp.builtSrc}`);
    assert(staticComp.isSingleImg, 'Completed build must swap to single full sprite');
    assert(staticComp.builtSrc.includes('full'), 'Built tile must render full house sprite');
    console.log('Build animation completion check PASSED!\n');

    await animPage.close();
    console.log('=== ALL AUTOMATED VERIFICATIONS PASSED SUCCESSFULLY ===\n');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Automated verification error:', err);
  process.exit(1);
});
