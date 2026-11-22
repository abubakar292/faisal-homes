'use strict';
// Module 1: Land Purchase Management. Starts from a database created by the PREVIOUS version (migrations 001-004)
// that already contains a land and seller payments, then runs the real upgrade and tests the new land features.
process.env.TEST_DB_SUFFIX = '_land';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { startServer, stopServer } = require('./helpers');
const { today, addDays } = require('../src/lib/dates');

let ctx; let admin; let acct; let viewer;
const T = today();
const D = (n) => addDays(T, -n);
const ids = {};
const ok = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.data).slice(0, 500)); return r.data; };
const num = (v) => Number(v);

async function legacySeed(db) {
  const hash = await bcrypt.hash('Admin@12345', 4);
  await db.query(`INSERT INTO users (username, full_name, password_hash, role) VALUES ('admin','Admin',$1,'ADMIN')`, [hash]);
  await db.query(`INSERT INTO lands (name, location, area_kanal, area_marla, area_sqft, marla_sqft, kanal_marla, total_sqft, total_marla, purchase_price, purchase_date,
      seller_name, seller_mobile, created_by, updated_by)
    VALUES ('Old Land', 'Mauza Old', 2, 0, 0, 272.25, 20, 10890, 40, 10000000, $1, 'Old Owner', '0300-0000001', 1, 1)`, [D(300)]);
  const cat = async (n) => (await db.query('SELECT id FROM expense_categories WHERE name=$1', [n])).rows[0].id;
  for (const [no, c, desc, amt, d] of [['FH-E-00001', 'Land Purchase', 'Seller payment (old way)', 4000000, D(290)], ['FH-E-00002', 'Legal Expenses', 'Registry fee', 200000, D(289)]]) {
    const e = (await db.query(`INSERT INTO expenses (expense_no, expense_date, category_id, description, amount, method, land_id, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,'CASH',1,1,1) RETURNING id`, [no, d, await cat(c), desc, amt])).rows[0];
    await db.query(`INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, description, created_by)
      VALUES ($1,'EXPENSE_PAID','OUT',$2,'CASH','expense',$3,$4,$5,1)`, [d, amt, e.id, no, desc]);
  }
  await db.query(`UPDATE counters SET next_value = 3 WHERE name = 'expense'`);
}

before(async () => {
  ctx = await startServer({ legacy: { upTo: '004_land_saleable_area.sql', seed: legacySeed } });
  admin = ctx.api(); acct = ctx.api(); viewer = ctx.api();
  ok(await admin.post('/auth/login', { username: 'admin', password: 'Admin@12345' }));
  ok(await admin.post('/users', { username: 'acct', full_name: 'Accountant', role: 'ACCOUNTANT', password: 'Passw0rd!' }), 201);
  ok(await admin.post('/users', { username: 'viewer', full_name: 'Viewer', role: 'VIEWER', password: 'Passw0rd!' }), 201);
  ok(await acct.post('/auth/login', { username: 'acct', password: 'Passw0rd!' }));
  ok(await viewer.post('/auth/login', { username: 'viewer', password: 'Passw0rd!' }));
});
after(async () => { await stopServer(ctx.server); });

const fin = async (id) => ok(await admin.get(`/lands/${id}`));
const funds = async (bookingId) => ok(await acct.get(`/investments/customer-funds?booking_id=${bookingId}`));

describe('upgrade of an existing database', () => {
  it('made a safety backup before applying the upgrade', () => {
    const files = fs.readdirSync(path.join(ctx.storage, 'backups'));
    assert.ok(files.some((f) => /-pre-migration\.zip$/.test(f)), files.join(','));
  });
  it('keeps the old land, its exact price and its old seller payments', async () => {
    const l = await fin(1);
    assert.equal(l.land_code, 'FH-L-00001');
    assert.equal(num(l.purchase_price), 10000000);
    assert.equal(num(l.rate_per_marla), 250000);
    assert.equal(l.price_is_manual, true);
    assert.equal(num(l.total_paid), 4000000);
    assert.equal(num(l.remaining_payable), 6000000);
    assert.equal(num(l.extra_cost), 200000);
    assert.equal(num(l.total_investment), 10200000);
    const led = ok(await admin.get('/lands/1/ledger'));
    const legacy = led.rows.find((r) => r.txn_id === 'FH-E-00001');
    assert.match(legacy.description, /before upgrade/);
    assert.match(legacy.source, /Not recorded/);
    assert.equal(led.rows.at(-1).remaining_payable, 6000000);
  });
  it('retires the old "Land Purchase" expense category but keeps its records', async () => {
    const cats = ok(await admin.get('/expenses/categories'));
    const lp = cats.find((c) => c.name === 'Land Purchase');
    assert.equal(lp.is_active, false);
    assert.equal((await admin.post('/expenses', { expense_date: T, category_id: lp.id, description: 'x', amount: 1, method: 'CASH', land_id: 1 })).status, 400);
    const ex = ok(await admin.get('/expenses?land_id=1'));
    assert.equal(ex.length, 2);
  });
});

describe('adding lands', () => {
  it('validates required owner and purchase information', async () => {
    const base = { seller_name: 'Hayat Khan', seller_mobile: '0301-1234567', area_kanal: 1, area_marla: 5, rate_per_marla: 400000, purchase_date: D(60), purchased_by: 'Javed' };
    assert.equal((await admin.post('/lands', { ...base, seller_name: '' })).status, 400);
    assert.equal((await admin.post('/lands', { ...base, seller_mobile: '' })).status, 400);
    assert.equal((await admin.post('/lands', { ...base, purchased_by: '' })).status, 400);
    assert.equal((await admin.post('/lands', { ...base, area_kanal: 0, area_marla: 0 })).status, 400);
    assert.equal((await admin.post('/lands', { ...base, purchase_date: addDays(T, 3) })).status, 400);
    assert.equal((await acct.post('/lands', base)).status, 403);
  });
  it('calculates Total Purchase Price = Total Marla x Rate, for several lands', async () => {
    const a = ok(await admin.post('/lands', { seller_name: 'Hayat Khan', seller_mobile: '0301-1234567', seller_cnic: '1730112345671', location: 'Mauza Hayat',
      area_kanal: 1, area_marla: 5, rate_per_marla: 400000, purchase_date: D(60), purchased_by: 'Javed', agreement_details: 'Stamp paper agreement' }), 201);
    assert.equal(a.land_code, 'FH-L-00002');
    assert.equal(num(a.total_marla), 25);
    assert.equal(num(a.total_sqft), 6806.25);
    assert.equal(num(a.purchase_price), 10000000);
    assert.equal(a.price_is_manual, false);
    assert.equal(a.seller_cnic, '17301-1234567-1');
    ids.A = a.id;
    // second land with an additional purchase expense paid from personal investment
    const b = ok(await admin.post('/lands', { seller_name: 'Gul Muhammad', seller_mobile: '0333-7654321', area_kanal: 3, rate_per_marla: 350000, purchase_date: D(50),
      purchased_by: 'Javed', expenses: [{ description: 'Stamp duty & registry', amount: 150000, expense_date: D(49), method: 'CASH', investor_name: 'Javed' }] }), 201);
    assert.equal(num(b.purchase_price), 21000000);
    ids.B = b.id;
    const fb = await fin(ids.B);
    assert.equal(num(fb.extra_cost), 150000);
    assert.equal(num(fb.total_investment), 21150000);
    assert.equal(num(fb.personal_funded), 150000);
    // a third land, square feet only
    const c = ok(await admin.post('/lands', { seller_name: 'Sher Ali', seller_mobile: '0345-1111111', area_sqft: 2722.5, rate_per_marla: 300000, purchase_date: D(40), purchased_by: 'Faisal' }), 201);
    assert.equal(num(c.total_marla), 10);
    assert.equal(num(c.purchase_price), 3000000);
    ids.C = c.id;
  });
  it('allows a manual price only for an admin, with a reason, and records it', async () => {
    const l = await fin(ids.C);
    const body = { ...l, seller_mobile: l.seller_mobile, manual_price: true, purchase_price: 2900000, price_adjust_reason: '' };
    assert.equal((await admin.put(`/lands/${ids.C}`, body)).status, 400);
    ok(await admin.put(`/lands/${ids.C}`, { ...body, price_adjust_reason: 'Owner gave discount for cash' }));
    const after = await fin(ids.C);
    assert.equal(num(after.purchase_price), 2900000);
    assert.equal(after.adjustments.length, 1);
    assert.equal(after.adjustments[0].change_type, 'MANUAL');
    // changing the rate on an automatic land recalculates and records the change
    const a = await fin(ids.A);
    ok(await admin.put(`/lands/${ids.A}`, { ...a, rate_per_marla: 420000, manual_price: false }));
    const a2 = await fin(ids.A);
    assert.equal(num(a2.purchase_price), 10500000);
    assert.equal(a2.adjustments[0].change_type, 'RECALCULATED');
    ok(await admin.put(`/lands/${ids.A}`, { ...a2, rate_per_marla: 400000, manual_price: false }));
    const audit = ok(await admin.get('/audit?entity=land'));
    assert.ok(audit.some((x) => /manual/.test(x.summary)));
  });
});

describe('paying land owners with split funding sources', () => {
  it('prepares customer money (booking + receipts)', async () => {
    const s = ok(await admin.post('/societies', { name: 'Test Society' }), 201);
    const blk = ok(await admin.post(`/societies/${s.id}/blocks`, { name: 'A' }), 201);
    const p = ok(await admin.post('/plots', { society_id: s.id, block_id: blk.id, plot_no: 'A-1', size_marla: 5, price_per_marla: 1000000 }), 201);
    const p2 = ok(await admin.post('/plots', { society_id: s.id, block_id: blk.id, plot_no: 'A-2', size_marla: 5, price_per_marla: 1000000 }), 201);
    const cu = ok(await admin.post('/customers', { full_name: 'Ahmed Khan', cnic: '3520211111111', mobile: '0300-5555555' }), 201);
    const cu2 = ok(await admin.post('/customers', { full_name: 'Bilal', cnic: '3520222222222', mobile: '0300-6666666' }), 201);
    const bk = ok(await admin.post('/bookings', { customer_id: cu.id, plot_id: p.id, booking_date: D(30), rate_per_marla: 1000000, booking_amount: 1500000, plan: { type: 'MONTHLY', installments: 10 } }), 201);
    const bk2 = ok(await admin.post('/bookings', { customer_id: cu2.id, plot_id: p2.id, booking_date: D(30), rate_per_marla: 1000000, booking_amount: 600000, plan: { type: 'FULL' } }), 201);
    Object.assign(ids, { cu: cu.id, cu2: cu2.id, bk: bk.booking.id, bk2: bk2.booking.id, r1: bk.payment.id, r2: bk2.payment.id });
    const f = await funds(ids.bk);
    assert.equal(f.length, 1);
    assert.equal(num(f[0].available), 1500000);
    ids.bkBalance = num(ok(await admin.get(`/bookings/${ids.bk}`)).balance);
  });
  it('requires sources that add up exactly to the payment', async () => {
    const body = { amount: 3500000, payment_date: D(20), method: 'BANK_TRANSFER', reference_no: 'TRX-1' };
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { ...body, sources: [] })).status, 400);
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { ...body, sources: [{ type: 'PERSONAL_NEW', amount: 3400000, investor_name: 'Muhammad' }] })).status, 400);
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { ...body, sources: [{ type: 'PERSONAL_NEW', amount: 3500000 }] })).status, 400); // investor name
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { ...body, sources: [{ type: 'CUSTOMER', amount: 3500000, payment_id: ids.r1 }] })).status, 400); // only 1.5M available
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { ...body, sources: [{ type: 'CUSTOMER', amount: 100, payment_id: ids.r1, customer_id: ids.cu2 }, { type: 'PERSONAL_NEW', amount: 3499900, investor_name: 'M' }] })).status, 400); // wrong customer
    assert.equal((await viewer.post(`/lands/${ids.A}/payments`, { ...body, sources: [{ type: 'PERSONAL_NEW', amount: 3500000, investor_name: 'M' }] })).status, 403);
    const l = await fin(ids.A);
    assert.equal(num(l.total_paid), 0, 'failed attempts must not save anything');
  });
  it('pays Rs 3,500,000 = 2,000,000 personal investment + 1,500,000 customer advance', async () => {
    const r = ok(await acct.post(`/lands/${ids.A}/payments`, {
      amount: 3500000, payment_date: D(20), method: 'BANK_TRANSFER', reference_no: 'TRX-1', description: 'First payment to Hayat Khan',
      sources: [
        { type: 'PERSONAL_NEW', amount: 2000000, investor_name: 'Muhammad', investment_date: D(20), method: 'BANK_TRANSFER', notes: 'From my own account' },
        { type: 'CUSTOMER', amount: 1500000, payment_id: ids.r1, customer_id: ids.cu, booking_id: ids.bk, notes: 'Booking advance of Ahmed Khan' },
      ],
    }), 201);
    assert.match(r.payment.payment_no, /^FH-LP-\d{5}$/);
    assert.equal(r.allocations.length, 2);
    assert.equal(r.created.length, 1);
    ids.lp1 = r.payment.id; ids.inv1 = r.created[0].id;
    const l = await fin(ids.A);
    assert.equal(num(l.total_paid), 3500000);
    assert.equal(num(l.remaining_payable), 6500000);
    assert.equal(num(l.personal_funded), 2000000);
    assert.equal(num(l.customer_funded), 1500000);
    assert.match(l.payments[0].funding, /Personal investment .*Customer money/);
    // customer money is used up, but the customer's own account is unchanged
    assert.equal((await funds(ids.bk)).length, 0);
    assert.equal(num(ok(await admin.get(`/bookings/${ids.bk}`)).balance), ids.bkBalance);
    // the customer receipt cannot be reversed while its money is used for land
    const rev = await admin.post(`/payments/${ids.r1}/reverse`, { reason: 'test' });
    assert.equal(rev.status, 409);
    assert.match(rev.data.error, /used to pay for land/);
  });
  it('records cash once: investment in, land payment out, no duplicate customer cash', async () => {
    const cash = ok(await admin.get(`/reports/daily-cash?date=${D(20)}`));
    const types = cash.rows.map((r) => `${r.entry_type}:${num(r.cash_in) || num(r.cash_out)}`).sort();
    assert.deepEqual(types, ['CAPITAL_CONTRIBUTION:2000000', 'LAND_PAYMENT:3500000']);
  });
  it('supports partial, multiple and existing-investment payments, and refuses over-payment', async () => {
    const inv = ok(await acct.post('/investments', { investor_name: 'Muhammad', contribution_date: D(15), amount: 5000000, method: 'CASH', notes: 'Capital for land' }), 201);
    ids.inv2 = inv.id;
    ok(await acct.post(`/lands/${ids.A}/payments`, { amount: 1000000, payment_date: D(14), method: 'CASH', sources: [{ type: 'PERSONAL_EXISTING', amount: 1000000, capital_id: inv.id }] }), 201);
    ok(await acct.post(`/lands/${ids.A}/payments`, { amount: 2000000, payment_date: D(10), method: 'CHEQUE', reference_no: '000771', sources: [{ type: 'PERSONAL_EXISTING', amount: 2000000, capital_id: inv.id }] }), 201);
    let l = await fin(ids.A);
    assert.equal(num(l.remaining_payable), 3500000);
    assert.equal(l.payment_count, 3);
    // investment dated after the payment cannot be used
    const late = ok(await acct.post('/investments', { investor_name: 'Muhammad', contribution_date: T, amount: 100000, method: 'CASH' }), 201);
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { amount: 100000, payment_date: D(5), method: 'CASH', sources: [{ type: 'PERSONAL_EXISTING', amount: 100000, capital_id: late.id }] })).status, 400);
    // only 2,000,000 of the 5,000,000 investment is left
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { amount: 2500000, payment_date: D(5), method: 'CASH', sources: [{ type: 'PERSONAL_EXISTING', amount: 2500000, capital_id: inv.id }] })).status, 400);
    // more than the remaining payable
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { amount: 4000000, payment_date: D(5), method: 'CASH', sources: [{ type: 'PERSONAL_NEW', amount: 4000000, investor_name: 'M' }] })).status, 400);
    // additional payment: accountant cannot, admin can with a reason
    const add = { amount: 100000, payment_date: D(5), method: 'CASH', additional: true, sources: [{ type: 'PERSONAL_NEW', amount: 100000, investor_name: 'Muhammad' }] };
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { ...add, authorization_note: 'x' })).status, 403);
    assert.equal((await admin.post(`/lands/${ids.A}/payments`, add)).status, 400);
    ok(await admin.post(`/lands/${ids.A}/payments`, { ...add, authorization_note: 'Owner demanded extra for the access road strip' }), 201);
    l = await fin(ids.A);
    assert.equal(num(l.remaining_payable), 3500000, 'additional payment does not reduce payable');
    assert.equal(num(l.additional_paid), 100000);
    assert.equal(num(l.total_investment), 10100000);
    // final payment: remaining investment + second customer's money
    ok(await acct.post(`/lands/${ids.A}/payments`, { amount: 3500000, payment_date: D(3), method: 'BANK_TRANSFER', sources: [
      { type: 'PERSONAL_EXISTING', amount: 2000000, capital_id: inv.id }, { type: 'PERSONAL_NEW', amount: 1000000, investor_name: 'Javed' },
      { type: 'CUSTOMER', amount: 500000, payment_id: ids.r2 }] }), 201);
    l = await fin(ids.A);
    assert.equal(num(l.remaining_payable), 0);
    assert.equal((await acct.post(`/lands/${ids.A}/payments`, { amount: 1, payment_date: T, method: 'CASH', sources: [{ type: 'PERSONAL_NEW', amount: 1, investor_name: 'M' }] })).status, 400);
    assert.equal(num((await funds(ids.bk2))[0].available), 100000);
  });
  it('cannot use the same receipt twice in one payment beyond what is left', async () => {
    assert.equal((await acct.post(`/lands/${ids.B}/payments`, { amount: 200000, payment_date: T, method: 'CASH', sources: [
      { type: 'CUSTOMER', amount: 100000, payment_id: ids.r2 }, { type: 'CUSTOMER', amount: 100000, payment_id: ids.r2 }] })).status, 400);
  });
});

describe('reversals and investment tracking', () => {
  it('reverses a land payment with a reason and releases its funding', async () => {
    assert.equal((await acct.post(`/lands/payments/${ids.lp1}/reverse`, { reason: 'x' })).status, 403);
    assert.equal((await admin.post(`/lands/payments/${ids.lp1}/reverse`, {})).status, 400);
    const r = ok(await admin.post(`/lands/payments/${ids.lp1}/reverse`, { reason: 'Entered against the wrong land' }));
    assert.equal(r.reversed_investments.length, 1);
    assert.equal((await admin.post(`/lands/payments/${ids.lp1}/reverse`, { reason: 'again' })).status, 409);
    const l = await fin(ids.A);
    assert.equal(num(l.remaining_payable), 3500000);
    assert.equal(num((await funds(ids.bk))[0].available), 1500000);
    const invs = ok(await admin.get('/investments'));
    assert.equal(invs.find((i) => i.id === ids.inv1).status, 'REVERSED');
    // the customer receipt is free again: it could now be reversed (not done here)
    const cash = ok(await admin.get(`/reports/daily-cash?date=${T}`));
    assert.ok(cash.rows.some((x) => x.entry_type === 'LAND_PAYMENT_REVERSED'));
    assert.ok(cash.rows.some((x) => x.entry_type === 'CAPITAL_REVERSED'));
  });
  it('blocks reversing an investment that is in use', async () => {
    assert.equal((await admin.post(`/investments/${ids.inv2}/reverse`, { reason: 'x' })).status, 409);
  });
  it('funds a land expense from customer money and frees it when the expense is cancelled', async () => {
    const e = ok(await acct.post(`/lands/${ids.B}/expenses`, { description: 'Dealer commission', amount: 300000, expense_date: T, method: 'CASH',
      sources: [{ type: 'CUSTOMER', amount: 300000, payment_id: ids.r1 }] }), 201);
    assert.equal(num((await funds(ids.bk))[0].available), 1200000);
    assert.equal(num((await fin(ids.B)).extra_cost), 450000);
    ok(await admin.post(`/expenses/${e.expense.id}/cancel`, { reason: 'Duplicate' }));
    assert.equal(num((await funds(ids.bk))[0].available), 1500000);
    assert.equal(num((await fin(ids.B)).extra_cost), 150000);
  });
  it('never counts the same investment twice', async () => {
    const s = ok(await admin.get('/investments/summary'));
    const close = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);
    // valid investments: 5,000,000 + 100,000 (unused) + 100,000 (additional) + 1,000,000 (Javed) + 150,000 (land B expense)
    close(s.personal_investment_total, 6350000);
    close(s.personal_investment_total, s.personal_used_land_purchase + s.personal_used_land_expenses + s.personal_available);
    close(s.personal_used_land_purchase, 5000000 + 100000 + 1000000);
    close(s.personal_used_land_expenses, 150000);
    close(s.personal_available, 100000);
    close(s.customer_used_land_purchase, 500000);
    close(s.land_payments_unreconciled, 0);
    close(s.land_payments_funded, s.land_payments_total);
    close(s.legacy_land_payments_no_source, 4000000);
    const sum = ok(await admin.get('/lands/summary'));
    close(sum.total_personal_investment, 6350000);
    close(sum.total_customer_money_used, 500000);
  });
});

describe('ledgers, summary, reports', () => {
  it('every land ledger ends at its remaining payable and summary cards match the records', async () => {
    const lands = ok(await admin.get('/lands'));
    assert.equal(lands.length, 4);
    for (const l of lands) {
      const led = ok(await admin.get(`/lands/${l.id}/ledger`));
      assert.equal(led.rows.at(-1).remaining_payable, num(l.remaining_payable), l.land_code);
    }
    const s = ok(await admin.get('/lands/summary'));
    const sum = (k) => lands.reduce((a, l) => a + Math.round(num(l[k]) * 100), 0) / 100;
    assert.equal(s.total_lands, 4);
    assert.equal(s.total_purchase_value, sum('purchase_price'));
    assert.equal(s.total_paid, sum('total_paid'));
    assert.equal(s.total_remaining, sum('remaining_payable'));
    assert.equal(s.total_marla, sum('total_marla'));
    // ledger of land A shows the split sources of each payment and the reversal
    const led = ok(await admin.get(`/lands/${ids.A}/ledger`));
    assert.ok(led.rows.some((r) => r.type === 'REVERSAL'));
    for (const r of led.rows) assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${r.txn_id} date ${r.date}`);
    assert.equal(led.rows.find((r) => r.type === 'REVERSAL').date, T);
    const dates = led.rows.map((r) => r.date);
    assert.deepEqual(dates, [...dates].sort(), 'ledger rows are in date order');
    // running balance: each row = previous row + its payable change
    led.rows.reduce((prev, r) => { assert.equal(Math.round(r.remaining_payable * 100), Math.round((prev + r.payable_change) * 100), r.txn_id); return r.remaining_payable; }, 0);
    assert.ok(led.rows.some((r) => r.type === 'ADDITIONAL'));
    assert.ok(led.rows.filter((r) => /Customer money/.test(r.source)).length >= 1);
  });
  it('financial summary counts old and new land payments without counting them as expenses', async () => {
    const f = ok(await admin.get('/reports/summary')).raw;
    const lands = ok(await admin.get('/lands'));
    const paid = lands.reduce((a, l) => a + num(l.total_paid), 0);
    const close = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);
    close(f.land_payments_made, paid);
    close(f.land_payable, lands.reduce((a, l) => a + num(l.remaining_payable), 0));
    close(f.total_land_investment, lands.reduce((a, l) => a + num(l.total_investment), 0));
    close(f.total_expenses, 200000 + 150000); // registry fee + stamp duty (land payments are not expenses)
    close(f.net_cash, f.cash_in - f.cash_out);
  });
  it('exports every land report to JSON, Excel and PDF', async () => {
    for (const n of ['land-statement', 'land-owners', 'land-payments', 'land-outstanding', 'investment', 'customer-money', 'monthly-cash']) {
      const q = n === 'land-statement' ? `?land_id=${ids.A}` : '';
      const j = ok(await viewer.get(`/reports/${n}${q}`));
      assert.ok(j.rows.length > 0, n);
      const x = await viewer.get(`/reports/${n}${q}${q ? '&' : '?'}format=xlsx`);
      assert.equal(x.data.slice(0, 2).toString(), 'PK', n);
      const p = await viewer.get(`/reports/${n}${q}${q ? '&' : '?'}format=pdf`);
      assert.equal(p.data.slice(0, 4).toString(), '%PDF', n);
    }
    const st = ok(await admin.get(`/reports/land-statement?land_id=${ids.A}`));
    assert.equal(st.summary.find((s) => s.label === 'Remaining payable').value, 3500000);
    assert.equal((await admin.get('/reports/land-statement')).status, 400);
  });
  it('viewer can read land data but not change it', async () => {
    ok(await viewer.get(`/lands/${ids.A}/ledger`));
    assert.equal((await viewer.post('/investments', { investor_name: 'x', contribution_date: T, amount: 1, method: 'CASH' })).status, 403);
  });
});
