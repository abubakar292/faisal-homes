// Headless browser click-through of every page plus the main office workflows.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = 'http://localhost:4000';
const OUT = '/home/claude/e2e/shots';
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message} @ ${page.url()}`));
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/') && r.status() >= 500) problems.push(`HTTP ${r.status()} ${u}`); });
  page.on('dialog', (d) => d.dismiss());

  const waitIdle = async () => { try { await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }); } catch { /* ok */ } };
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); };
  const clickText = async (text, sel = 'button, a') => {
    const handles = await page.$$(sel);
    for (const h of handles) {
      const t = await h.evaluate((el) => el.innerText.trim());
      const visible = await h.evaluate((el) => !!(el.offsetWidth || el.offsetHeight));
      if (visible && t.includes(text)) { await h.click(); return true; }
    }
    throw new Error(`No clickable "${text}" on ${page.url()}`);
  };
  const typeInto = async (labelText, value) => {
    const ok = await page.evaluate((lt, v) => {
      const scope = document.querySelector('[role=dialog]') || document;
      const labels = [...scope.querySelectorAll('label')].filter((l) => (l.querySelector('.label')?.textContent || '').trim().startsWith(lt));
      const l = labels.find((x) => x.offsetParent !== null);
      if (!l) return false;
      const el = l.querySelector('input, select, textarea');
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      if (el.tagName === 'SELECT') el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, labelText, value);
    if (!ok) throw new Error(`No field "${labelText}" on ${page.url()}`);
    await sleep(120);
  };
  const bodyHas = async (text) => page.evaluate((t) => document.body.innerText.includes(t), text);
  const bodyHasI = async (text) => page.evaluate((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), text);
  const setIn = async (scopeSel, idx, labelText, value) => {
    const ok = await page.evaluate((sc, i, lt, v) => {
      const scope = document.querySelectorAll(sc)[i];
      if (!scope) return false;
      const l = [...scope.querySelectorAll('label')].find((x) => (x.querySelector('.label')?.textContent || '').trim().startsWith(lt) && x.offsetParent !== null);
      if (!l) return false;
      const el = l.querySelector('input, select, textarea');
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    }, scopeSel, idx, labelText, value);
    if (!ok) throw new Error(`No field "${labelText}" in ${scopeSel}[${idx}]`);
    await sleep(150);
  };
  const errorsOnPage = async () => page.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.innerText).filter(Boolean));
  const step = async (name, fn) => {
    try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); await shot(`FAIL-${name.replace(/\W+/g, '_')}`); }
  };

  await step('login', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await shot('00-login');
    await page.type('input[autocomplete=username]', 'admin');
    await page.type('input[type=password]', 'Admin@12345');
    await page.click('button[type=submit]');
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('total land area'), { timeout: 10000 });
    await waitIdle(); await sleep(600);
    await shot('01-dashboard');
  });

  const routes = ['/lands', '/lands/1', '/lands/1/ledger', '/investments', '/societies', '/societies/1', '/plots', '/plots/1', '/plot-map', '/customers', '/customers/1', '/customers/new', '/bookings', '/bookings/1',
    '/bookings/new', '/collect', '/receipts', '/receipts/1', '/installments', '/transfers', '/transfers/1', '/transfers/new', '/expenses', '/reports', '/settings', '/users', '/audit', '/backup', '/change-password'];
  for (const r of routes) {
    await step(`page ${r}`, async () => {
      await page.goto(BASE + r, { waitUntil: 'networkidle0' });
      await sleep(300);
      const errs = await errorsOnPage();
      if (errs.length) throw new Error(`error box: ${errs.join(' | ')}`);
      if (await bodyHas('Something went wrong')) throw new Error('server error text');
      await shot(`page${r.replace(/\//g, '_')}`);
    });
  }

  for (const r of ['summary', 'collections', 'daily-cash', 'monthly-cash', 'overdue', 'upcoming', 'sales', 'receivables', 'expenses', 'expense-list', 'inventory', 'land-owners', 'land-payments', 'land-outstanding', 'investment', 'customer-money']) {
    await step(`report ${r}`, async () => {
      await page.goto(`${BASE}/reports?r=${r}`, { waitUntil: 'networkidle0' });
      await sleep(250);
      const errs = await errorsOnPage();
      if (errs.length) throw new Error(errs.join(' | '));
      if (r === 'summary') await shot('report-summary');
      if (r === 'overdue') await shot('report-overdue');
    });
  }

  let landUrl;
  await step('land page shows summary cards', async () => {
    await page.goto(`${BASE}/lands`, { waitUntil: 'networkidle0' });
    for (const t of ['Total lands', 'Total area', 'Purchase value', 'Total paid', 'Remaining payable', 'Personal investment', 'Customer money used']) {
      if (!(await bodyHasI(t))) throw new Error(`summary card "${t}" missing`);
    }
    await shot('land-list');
  });

  await step('add land: owner, measurement, automatic price, purchase expense', async () => {
    await page.goto(`${BASE}/lands`, { waitUntil: 'networkidle0' });
    await clickText('Add land');
    await sleep(400);
    await typeInto('Owner name', 'Browser Test Owner');
    await typeInto('Contact number', '0300-1212121');
    await typeInto('Kanal', '2');
    await typeInto('Marla', '5');
    await typeInto('Purchase rate per Marla', '500000');
    await typeInto('Purchased by', 'Test Manager');
    await sleep(200);
    const txt = await page.evaluate(() => document.querySelector('[role=dialog]').innerText);
    if (!txt.includes('45 Marla') || !txt.includes('12,251.25 sq ft') || !txt.includes('Rs 22,500,000')) throw new Error(`auto calculation not shown: ${txt.slice(0, 400)}`);
    await clickText('Add expense', '[role=dialog] button');
    await sleep(200);
    await setIn('[data-testid=land-expense-row]', 0, 'Description', 'Stamp duty');
    await setIn('[data-testid=land-expense-row]', 0, 'Amount (Rs)', '100000');
    await setIn('[data-testid=land-expense-row]', 0, 'Paid from investment of', 'Muhammad Faisal');
    await shot('land-add-form');
    await clickText('Save land', '[role=dialog] button');
    await page.waitForFunction(() => /\/lands\/\d+$/.test(location.pathname), { timeout: 8000 });
    await waitIdle(); await sleep(300);
    landUrl = page.url();
    if (!(await bodyHas('Rs 22,600,000'))) throw new Error('total land investment (price + expense) not shown');
    await shot('land-detail-new');
  });

  await step('pay land owner refuses over-payment', async () => {
    await page.goto(landUrl, { waitUntil: 'networkidle0' });
    await clickText('PAY LAND OWNER');
    await sleep(400);
    await typeInto('Amount paid to owner', '99999999');
    await typeInto('Investor name', 'Muhammad Faisal');
    await typeInto('Amount from this source', '99999999');
    await clickText('Save payment', '[role=dialog] button');
    await page.waitForFunction(() => document.querySelector('[role=dialog]').innerText.includes('more than the remaining payable'), { timeout: 5000 });
    await clickText('Cancel', '[role=dialog] button');
  });

  await step('pay land owner: split personal investment + customer money', async () => {
    const funds = await page.evaluate(async () => (await (await fetch('/api/investments/customer-funds')).json()));
    const best = funds.sort((a, b) => Number(b.available) - Number(a.available))[0];
    if (!best) throw new Error('no customer money available in demo data');
    const cust = Math.min(1500000, Math.floor(Number(best.available)));
    await page.goto(landUrl, { waitUntil: 'networkidle0' });
    await clickText('PAY LAND OWNER');
    await sleep(400);
    await typeInto('Amount paid to owner', '3500000');
    await typeInto('Payment method', 'BANK_TRANSFER');
    await typeInto('Reference', 'IBFT-LAND-1');
    await setIn('[data-testid=funding-row]', 0, 'Investor name', 'Muhammad Faisal');
    await setIn('[data-testid=funding-row]', 0, 'Amount from this source', String(3500000 - cust));
    await clickText('Add another source', '[role=dialog] button');
    await sleep(400);
    await setIn('[data-testid=funding-row]', 1, 'Original collection', String(best.payment_id));
    await setIn('[data-testid=funding-row]', 1, 'Amount from this source', String(cust));
    const check = await page.evaluate(() => document.querySelector('[data-testid=funding-check]').innerText);
    if (!check.includes('Rs 3,500,000 of Rs 3,500,000')) throw new Error(`sources check: ${check}`);
    if (!(await page.evaluate(() => document.querySelector('[role=dialog]').innerText.includes("customer's own account is not changed")))) throw new Error('receipt details not shown');
    await shot('land-pay-split');
    await clickText('Save payment', '[role=dialog] button');
    await page.waitForFunction(() => document.body.innerText.includes('Payment FH-LP-') && !document.querySelector('[role=dialog]'), { timeout: 10000 });
    await waitIdle(); await sleep(300);
    if (!(await bodyHas('Customer money'))) throw new Error('funding source not listed with the payment');
    if (!(await bodyHas('Rs 19,000,000'))) throw new Error('remaining payable not reduced to 19,000,000');
    await shot('land-detail-paid');
  });

  await step('land ledger shows full history and balance', async () => {
    await page.goto(`${landUrl}/ledger`, { waitUntil: 'networkidle0' });
    await sleep(300);
    const bal = await page.evaluate(() => document.querySelector('[data-testid=ledger-balance]').innerText);
    if (bal !== 'Rs 19,000,000') throw new Error(`ledger balance ${bal}`);
    for (const h of ['Transaction ID', 'Payment source', 'Entered by', 'Stamp duty']) if (!(await bodyHasI(h))) throw new Error(`ledger missing ${h}`);
    await shot('land-ledger');
  });

  await step('reverse a land payment with a reason', async () => {
    await page.goto(landUrl, { waitUntil: 'networkidle0' });
    await clickText('Reverse', 'table button');
    await sleep(300);
    await page.type('[role=dialog] textarea', 'Entered for testing');
    await clickText('Reverse payment', '[role=dialog] button');
    await page.waitForFunction(() => document.body.innerText.includes('Payment reversed'), { timeout: 10000 });
    await waitIdle(); await sleep(300);
    await page.goto(`${landUrl}/ledger`, { waitUntil: 'networkidle0' });
    const bal = await page.evaluate(() => document.querySelector('[data-testid=ledger-balance]').innerText);
    if (bal !== 'Rs 22,500,000') throw new Error(`ledger balance after reversal ${bal}`);
    if (!(await bodyHasI('Reversal of FH-LP-'))) throw new Error('reversal row missing');
  });

  await step('personal investment page: add investment', async () => {
    await page.goto(`${BASE}/investments`, { waitUntil: 'networkidle0' });
    await clickText('Add investment');
    await sleep(300);
    await typeInto('Investor name', 'Muhammad Faisal');
    await typeInto('Amount (Rs)', '250000');
    await clickText('Save investment', '[role=dialog] button');
    await page.waitForFunction(() => document.body.innerText.includes('Investment FH-INV-'), { timeout: 8000 });
    for (const t of ['Total personal investment', 'Used for land purchase', 'Remaining (not used)', 'Received from customers', 'Customer money used for land']) {
      if (!(await bodyHasI(t))) throw new Error(`card "${t}" missing`);
    }
    await shot('investments');
  });

  await step('land statement report with Excel/PDF export', async () => {
    await page.goto(`${BASE}/reports?r=land-statement`, { waitUntil: 'networkidle0' });
    await typeInto('Land', landUrl.split('/').pop());
    await waitIdle(); await sleep(300);
    const errs = await errorsOnPage();
    if (errs.length) throw new Error(errs.join(' | '));
    if (!(await bodyHasI('Remaining payable'))) throw new Error('statement not shown');
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h && h.includes('land-statement')));
    for (const h of links) {
      const r = await page.evaluate(async (u) => { const x = await fetch(u); const b = new Uint8Array(await x.arrayBuffer()); return [x.status, String.fromCharCode(...b.slice(0, 4))]; }, h);
      if (r[0] !== 200 || !['PK\u0003\u0004', '%PDF'].includes(r[1])) throw new Error(`export ${h} -> ${r}`);
    }
    if (links.length < 2) throw new Error('export buttons missing');
    await shot('report-land-statement');
  });

  await step('register customer', async () => {
    await page.goto(`${BASE}/customers/new`, { waitUntil: 'networkidle0' });
    await typeInto('Full name', 'Test Browser Customer');
    await typeInto("Father's", 'Test Father');
    await typeInto('CNIC number', '3520299999991');
    await typeInto('Mobile number', '0300-9999999');
    await clickText('Save customer');
    await page.waitForFunction(() => location.pathname.match(/\/customers\/\d+$/), { timeout: 8000 });
    await waitIdle();
    if (!(await bodyHas('Test Browser Customer'))) throw new Error('profile not shown');
    await shot('customer-profile-new');
  });

  await step('new booking wizard (30% + 36 monthly + 6 half-yearly)', async () => {
    const plots = await page.evaluate(async () => (await (await fetch('/api/plots?status=AVAILABLE&size=5')).json()));
    const p = plots[0];
    await page.goto(`${BASE}/bookings/new?plot_id=${p.id}`, { waitUntil: 'networkidle0' });
    await page.type('input[placeholder^="Search by name"]', 'Test Browser');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Test Browser Customer')), { timeout: 8000 });
    await clickText('Test Browser Customer');
    await sleep(300);
    await clickText('30%');
    await page.evaluate(() => { const cb = [...document.querySelectorAll('label')].find((l) => l.innerText.includes('Add extra (balloon)')).querySelector('input'); cb.click(); });
    await sleep(200);
    await typeInto('Amount each', '200000');
    await page.waitForFunction(() => document.body.innerText.includes('43 payments') && ![...document.querySelectorAll('button')].find((b) => b.innerText.includes('Confirm booking')).disabled, { timeout: 10000 });
    await shot('booking-wizard');
    await clickText('Confirm booking');
    await page.waitForFunction(() => document.body.innerText.includes('Booking confirmed'), { timeout: 10000 });
    await waitIdle(); await sleep(400);
    await shot('booking-detail-created');
  });

  let bookingUrl;
  await step('collect payment (next installment)', async () => {
    bookingUrl = page.url().split('?')[0];
    const bid = bookingUrl.split('/').pop();
    await page.goto(`${BASE}/collect?booking_id=${bid}`, { waitUntil: 'networkidle0' });
    await clickText('Next installment');
    await sleep(200);
    await shot('collect-payment');
    await clickText('Save payment');
    await page.waitForFunction(() => document.body.innerText.includes('Payment saved'), { timeout: 10000 });
    await shot('collect-payment-saved');
  });

  await step('partial payment then reversal', async () => {
    const bid = bookingUrl.split('/').pop();
    await page.goto(`${BASE}/collect?booking_id=${bid}`, { waitUntil: 'networkidle0' });
    await typeInto('Amount received', '12345');
    await typeInto('Payment method', 'BANK_TRANSFER');
    await typeInto('Reference', 'IBFT-778');
    await clickText('Save payment');
    await page.waitForFunction(() => document.body.innerText.includes('Payment saved'), { timeout: 10000 });
    const pays = await page.evaluate(async (b) => (await (await fetch(`/api/payments?booking_id=${b}`)).json()), bid);
    const p = pays.find((x) => Number(x.amount) === 12345);
    await page.goto(`${BASE}/receipts/${p.id}`, { waitUntil: 'networkidle0' });
    await clickText('Reverse');
    await page.type('textarea', 'Entered on wrong booking');
    await clickText('Reverse payment');
    await page.waitForFunction(() => document.body.innerText.includes('Reversed on'), { timeout: 10000 });
    await shot('receipt-reversed');
  });

  await step('over-payment is refused', async () => {
    const bid = bookingUrl.split('/').pop();
    await page.goto(`${BASE}/collect?booking_id=${bid}`, { waitUntil: 'networkidle0' });
    await typeInto('Amount received', '999999999');
    await clickText('Save payment');
    await page.waitForFunction(() => document.body.innerText.includes('Over-payment is not allowed'), { timeout: 8000 });
  });

  await step('edit schedule dialog opens and validates', async () => {
    await page.goto(bookingUrl, { waitUntil: 'networkidle0' });
    await clickText('Edit schedule');
    await sleep(300);
    if (!(await bodyHas('matches final price'))) throw new Error('total check not shown');
    await shot('schedule-editor');
    await clickText('Cancel', '.fixed button');
  });

  await step('add expense', async () => {
    await page.goto(`${BASE}/expenses`, { waitUntil: 'networkidle0' });
    await clickText('Add expense');
    await sleep(300);
    const catId = await page.evaluate(async () => (await (await fetch('/api/expenses/categories')).json()).find((c) => c.name === 'Marketing').id);
    await typeInto('Category', String(catId));
    await typeInto('Description', 'Browser test banner');
    await typeInto('Amount (Rs)', '15000');
    await clickText('Save expense');
    await page.waitForFunction(() => document.body.innerText.includes('Attach the bill'), { timeout: 8000 });
    await clickText('Done');
  });

  await step('bulk add plots', async () => {
    await page.goto(`${BASE}/plots?society_id=1`, { waitUntil: 'networkidle0' });
    await clickText('Bulk add');
    await sleep(300);
    const blocks = await page.evaluate(async () => (await (await fetch('/api/societies/1')).json()).blocks);
    await typeInto('Society', '1');
    await sleep(500);
    await typeInto('Block', String(blocks[1].id));
    await typeInto('Prefix', 'B-');
    await typeInto('Start number', '101');
    await typeInto('How many', '5');
    await clickText('Create 5 plots');
    await page.waitForFunction(() => document.body.innerText.includes('B-101'), { timeout: 8000 });
  });

  await step('transfer with dues check', async () => {
    await page.goto(`${BASE}/transfers/new?booking_id=2`, { waitUntil: 'networkidle0' });
    await sleep(300);
    if (!(await bodyHas('Pending dues'))) throw new Error('overdue booking 2 should show pending dues');
    await shot('transfer-dues-pending');
  });

  await step('reserve and release a plot', async () => {
    const plots = await page.evaluate(async () => (await (await fetch('/api/plots?status=AVAILABLE')).json()));
    await page.goto(`${BASE}/plots/${plots[3].id}`, { waitUntil: 'networkidle0' });
    await clickText('Reserve');
    await sleep(300);
    await typeInto('Or reserved for', 'Phone enquiry');
    await clickText('Reserve', '.fixed button');
    await page.waitForFunction(() => document.body.innerText.includes('Release reservation'), { timeout: 8000 });
    await clickText('Release reservation');
    await clickText('Confirm', '.fixed button');
    await page.waitForFunction(() => document.body.innerText.includes('Reserve'), { timeout: 8000 });
  });

  await step('backup now', async () => {
    await page.goto(`${BASE}/backup`, { waitUntil: 'networkidle0' });
    await clickText('Backup now');
    await page.waitForFunction(() => document.body.innerText.includes('Backup created'), { timeout: 30000 });
    await sleep(500);
    await shot('backup');
  });

  await step('mobile layout', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(500);
    await shot('mobile-dashboard');
    await page.click('button[aria-label="Open menu"]');
    await sleep(300);
    await shot('mobile-menu');
    await page.goto(`${BASE}/plot-map`, { waitUntil: 'networkidle0' });
    await sleep(400);
    await shot('mobile-plotmap');
    await page.goto(`${BASE}/customers`, { waitUntil: 'networkidle0' });
    await sleep(300);
    await shot('mobile-customers');
    await page.goto(`${BASE}/lands/1`, { waitUntil: 'networkidle0' });
    await sleep(300);
    await shot('mobile-land');
    await page.setViewport({ width: 1440, height: 900 });
  });

  await step('viewer role is read-only with masked CNIC', async () => {
    const ctx = await browser.createBrowserContext();
    const v = await ctx.newPage();
    await v.setViewport({ width: 1440, height: 900 });
    await v.goto(BASE, { waitUntil: 'networkidle0' });
    await v.type('input[autocomplete=username]', 'viewer');
    await v.type('input[type=password]', 'Passw0rd!');
    await v.click('button[type=submit]');
    await v.waitForFunction(() => document.body.innerText.toLowerCase().includes('total land area'), { timeout: 10000 });
    await v.goto(`${BASE}/customers`, { waitUntil: 'networkidle0' });
    const masked = await v.evaluate(() => document.body.innerText.includes('*******'));
    const canAdd = await v.evaluate(() => document.body.innerText.includes('Register customer'));
    if (!masked) throw new Error('CNIC not masked for viewer');
    if (canAdd) throw new Error('viewer sees register button');
    await v.goto(`${BASE}/lands/1`, { waitUntil: 'networkidle0' });
    const pay = await v.evaluate(() => document.body.innerText.includes('PAY LAND OWNER'));
    const led = await v.evaluate(() => document.body.innerText.includes('VIEW LAND LEDGER'));
    if (pay || !led) throw new Error('viewer land buttons wrong');
    await ctx.close();
  });

  await step('logout', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await clickText('Log out');
    await page.waitForFunction(() => document.body.innerText.includes('Sign in'), { timeout: 8000 });
  });

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
  console.log(problems.length ? `\nPROBLEMS:\n${[...new Set(problems)].join('\n')}` : '\nNo console/page/server errors.');
}
main().catch((e) => { console.error(e); process.exit(1); });
