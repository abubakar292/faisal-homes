import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function main() {
  const artifactsDir = path.resolve('artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  console.log('1. Booting preview server on port 4180...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4180'], {
    shell: true,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => process.stdout.write(d.toString()));
  server.stderr.on('data', (d) => process.stderr.write(d.toString()));

  await new Promise((r) => setTimeout(r, 2500));

  console.log('2. Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    console.log('3. Navigating to /plots/map?demo=1...');
    await page.goto('http://localhost:4180/plots/map?demo=1', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for plots to render
    await page.waitForSelector('button[aria-label*="A-201"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const shotPath = path.join(artifactsDir, 'plot_map_available_blocks.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`4. Saved screenshot to ${shotPath}`);

    // Also take a tighter shot of Block A specifically
    const blockACard = await page.$('.card.mb-4.relative');
    if (blockACard) {
      const blockAShotPath = path.join(artifactsDir, 'plot_map_block_a_tight.png');
      await blockACard.screenshot({ path: blockAShotPath });
      console.log(`5. Saved Block A tight screenshot to ${blockAShotPath}`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
