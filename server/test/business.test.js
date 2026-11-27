'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, ANON_KEY } = require('./helpers');
const { generateSchedule } = require('../src/lib/schedule');
const { addMonths, today, addDays } = require('../src/lib/dates');
const { amountInWords } = require('../src/lib/words');
const { formatPKR } = require('../src/lib/money');

let ctx; let admin; let acct; let sales; let viewer;
const T = today();
const ids = {};
const ok = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.data).slice(0, 400)); return r.data; };
const money = (v) => Math.round(Number(v) * 100);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

before(async () => { ctx = await startServer(); admin = ctx.api(); acct = ctx.api(); sales = ctx.api(); viewer = ctx.api(); });
after(async () => { await stopServer(ctx); });

describe('pure helpers', () => {
  it('adds months without drifting past month end', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
    assert.equal(addMonths('2026-01-31', 2), '2026-03-31');
  });
  it('generates 30% down + 36 monthly + 6 half-yearly schedule that sums exactly', () => {
    const rows = generateSchedule({
      finalPrice: 4900000, bookingAmount: 1470000, bookingDate: '2026-01-10',
      plan: { type: 'MONTHLY', installments: 36, start_date: '2026-02-10', rounding: 100, balloon_count: 6, balloon_amount: 300000, balloon_every: 6 },
    });
    assert.equal(rows.length, 43);
    assert.equal(rows.reduce((s, r) => s + r.amount, 0), 490000000);
    const monthly = rows.filter((r) => r.kind === 'MONTHLY');
    assert.equal(monthly[0].amount, 4520000); // Rs 45,200
    assert.equal(monthly[35].amount, 1630000 * 100 - 4520000 * 35); // last absorbs rounding
    assert.equal(rows.filter((r) => r.kind === 'BALLOON').length, 6);
    assert.equal(rows[0].kind, 'BOOKING');
  });
  it('rejects plans that do not add up', () => {
    assert.throws(() => generateSchedule({ finalPrice: 100, bookingAmount: 200, bookingDate: '2026-01-01', plan: { type: 'FULL' } }));
    assert.throws(() => generateSchedule({ finalPrice: 1000, bookingAmount: 100, bookingDate: '2026-01-01', plan: { type: 'CUSTOM', custom_rows: [{ due_date: '2026-02-01', amount: 800 }] } }));
    assert.throws(() => generateSchedule({ finalPrice: 1000, bookingDate: '2026-01-01', plan: { type: 'MONTHLY', installments: 0 } }));
  });
  it('formats PKR and amount in words', () => {
    assert.equal(formatPKR(1234567.5), 'Rs 1,234,567.50');
    assert.equal(formatPKR(1234567, 'lakh'), 'Rs 12,34,567');
    assert.equal(amountInWords(1250000, 'lakh'), 'Rupees Twelve Lakh Fifty Thousand Only');
    assert.equal(amountInWords(1250000), 'Rupees One Million Two Hundred Fifty Thousand Only');
  });
});

describe('setup, login and security', () => {
  it('creates the first admin (Supabase login + user) only once', async () => {
    assert.equal(ok(await admin.get('/auth/setup-status')).needsSetup, true);
    assert.equal((await admin.post('/auth/setup', { email: 'not-an-email', full_name: 'X', password: 'Admin@12345' })).status, 400);
    ok(await admin.post('/auth/setup', { email: 'Admin@FH.test', full_name: 'Faisal Admin', password: 'Admin@12345' }), 201);
    assert.equal((await ctx.api().post('/auth/setup', { email: 'x@fh.test', full_name: 'X', password: 'xxxxxxxx' })).status, 409);
    assert.equal(ctx.fake.users.size, 1, 'the refused setup created no Supabase login');
    const me = ok(await admin.login('admin@fh.test', 'Admin@12345'));
    assert.equal(me.user.role, 'ADMIN');
    assert.equal(me.user.email, 'admin@fh.test');
    assert.ok(ok(await admin.get('/audit?action=LOGIN')).length >= 1);
  });
  it('blocks requests without the CSRF header', async () => {
    const r = await admin.req('POST', '/customers', { full_name: 'X' }, { csrf: false });
    assert.equal(r.status, 403);
  });
  it('refuses wrong passwords, forged or expired tokens, and logins without a FAISAL HOMES user', async () => {
    assert.equal((await ctx.api().login('admin@fh.test', 'wrong')).status, 400);
    const anon = ctx.api();
    assert.equal((await anon.get('/customers')).status, 401);
    anon.token = 'not.a.token';
    assert.equal((await anon.get('/customers')).status, 401);
    const adminLogin = [...ctx.fake.users.values()][0];
    anon.token = ctx.fake.forgeToken(adminLogin.id);
    assert.equal((await anon.get('/customers')).status, 401, 'token signed with an unknown key');
    anon.token = ctx.fake.issueToken(adminLogin, { expiresIn: -120 });
    const expired = await anon.get('/customers');
    assert.equal(expired.status, 401);
    assert.equal(expired.data.code, 'SESSION_EXPIRED');
    // a Supabase login made outside FAISAL HOMES (e.g. a public sign-up) gets no access
    ctx.fake.addUser('stranger@example.com', 'Passw0rd!');
    const s = ctx.api();
    const r = await s.login('stranger@example.com', 'Passw0rd!');
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'NO_PROFILE');
    assert.equal((await s.get('/customers')).status, 403);
  });
  it('creates role users with Supabase logins and enforces permissions', async () => {
    for (const [u, role] of [['acct', 'ACCOUNTANT'], ['sales', 'SALES'], ['viewer', 'VIEWER']]) {
      ok(await admin.post('/users', { email: `${u}@fh.test`, full_name: `${role} User`, role, password: 'Passw0rd!' }), 201);
    }
    assert.equal((await admin.post('/users', { email: 'ACCT@fh.test', full_name: 'Dup', role: 'SALES', password: 'Passw0rd!' })).status, 409);
    assert.equal((await admin.post('/users', { email: 'short@fh.test', full_name: 'Short', role: 'SALES', password: 'short' })).status, 400);
    ok(await acct.login('acct@fh.test', 'Passw0rd!'));
    ok(await sales.login('sales@fh.test', 'Passw0rd!'));
    const me = ok(await viewer.login('viewer@fh.test', 'Passw0rd!'));
    assert.ok(!me.permissions.includes('customer.edit'));
    assert.equal((await viewer.post('/customers', { full_name: 'X', cnic: '1234512345671' })).status, 403);
    assert.equal((await sales.get('/expenses')).status, 403);
    assert.equal((await acct.get('/users')).status, 403);
    assert.equal((await acct.post('/users', { email: 'x@fh.test', full_name: 'X', role: 'ADMIN', password: 'Passw0rd!' })).status, 403);
    assert.equal((await sales.get('/reports/summary')).status, 403);
  });
  it('disables and re-enables users, and changes passwords through Supabase', async () => {
    const v = ok(await admin.get('/users')).find((u) => u.email === 'viewer@fh.test');
    ok(await admin.put(`/users/${v.id}`, { full_name: v.full_name, role: 'VIEWER', is_active: false }));
    const blocked = await viewer.get('/customers');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'DISABLED');
    assert.equal((await ctx.api().login('viewer@fh.test', 'Passw0rd!')).status, 400, 'also blocked in Supabase Auth');
    ok(await admin.put(`/users/${v.id}`, { full_name: v.full_name, role: 'VIEWER', is_active: true }));
    ok(await viewer.get('/customers'));
    assert.equal((await viewer.post('/auth/change-password', { current_password: 'wrong', new_password: 'NewPassw0rd!' })).status, 400);
    ok(await viewer.post('/auth/change-password', { current_password: 'Passw0rd!', new_password: 'NewPassw0rd!' }));
    assert.equal((await ctx.api().login('viewer@fh.test', 'Passw0rd!')).status, 400);
    ok(await viewer.login('viewer@fh.test', 'NewPassw0rd!'));
    // admin reset with "must change password": only the password screen works until it is changed
    ok(await admin.post(`/users/${v.id}/reset-password`, { password: 'Temp1234!', must_change_password: true }));
    ok(await viewer.login('viewer@fh.test', 'Temp1234!'));
    assert.equal((await viewer.get('/customers')).data.code, 'MUST_CHANGE_PASSWORD');
    ok(await viewer.post('/auth/change-password', { current_password: 'Temp1234!', new_password: 'Passw0rd!' }));
    ok(await viewer.get('/customers'));
  });
  it('cannot remove the last administrator', async () => {
    const users = ok(await admin.get('/users'));
    const a = users.find((u) => u.email === 'admin@fh.test');
    assert.equal((await admin.put(`/users/${a.id}`, { full_name: 'A', role: 'VIEWER', is_active: true })).status, 400);
    assert.equal((await admin.put(`/users/${a.id}`, { full_name: 'A', role: 'ADMIN', is_active: false })).status, 400);
  });
});

describe('settings and land', () => {
  it('uses editable Marla conversion for land area', async () => {
    const land = ok(await admin.post('/lands', { location: 'GT Road', area_kanal: 1, area_marla: 5, area_sqft: 100, rate_per_marla: 200000, manual_price: true, purchase_price: 5000000, price_adjust_reason: 'Negotiated lump sum', purchase_date: '2025-06-01', seller_name: 'Seller', seller_mobile: '0300-1111111', seller_cnic: '35202-1111111-1', purchased_by: 'Javed' }), 201);
    assert.equal(Number(land.total_marla), 25.3673);
    ok(await admin.put('/settings', { measurement: { marla_sqft: 225, kanal_marla: 20 } }));
    const land2 = ok(await admin.post('/lands', { area_marla: 10, rate_per_marla: 0, seller_name: 'Local Owner', seller_mobile: '0300-2222222', purchase_date: '2025-06-01', purchased_by: 'Javed' }), 201);
    assert.equal(Number(land2.marla_sqft), 225);
    assert.equal(Number(land2.total_sqft), 2250);
    ok(await admin.put('/settings', { measurement: { marla_sqft: 272.25, kanal_marla: 20 } }));
    ids.land = land.id;
    assert.equal((await admin.post('/lands', { seller_name: 'Empty', seller_mobile: '0300-1', rate_per_marla: 1, purchase_date: '2025-01-01', purchased_by: 'X' })).status, 400);
  });
});

describe('society, blocks and plots', () => {
  it('creates society, blocks and bulk plots', async () => {
    const s = ok(await admin.post('/societies', { name: 'Faisal Homes Phase 1', land_id: ids.land }), 201);
    ids.society = s.id;
    ids.blockA = ok(await admin.post(`/societies/${s.id}/blocks`, { name: 'A' }), 201).id;
    ids.blockB = ok(await admin.post(`/societies/${s.id}/blocks`, { name: 'B' }), 201).id;
    assert.equal((await admin.post(`/societies/${s.id}/blocks`, { name: 'a' })).status, 409);
    const r = ok(await admin.post('/plots/bulk', { society_id: s.id, block_id: ids.blockA, prefix: 'A-', start_no: 1, count: 20, size_marla: 5, price_per_marla: 1000000, street_no: '1' }), 201);
    assert.equal(r.created, 20);
    assert.equal((await admin.post('/plots/bulk', { society_id: s.id, block_id: ids.blockA, prefix: 'A-', start_no: 15, count: 10, size_marla: 5 })).status, 409);
    const p = ok(await admin.post('/plots', { society_id: s.id, block_id: ids.blockB, plot_no: 'B-1', size_marla: 7.5, price_per_marla: 900000, is_corner: true, category: 'COMMERCIAL' }), 201);
    assert.equal(Number(p.list_price), 6750000);
    // Offer discount is entered per Marla; the total is size × per-Marla amount.
    const b1 = { society_id: s.id, block_id: ids.blockB, plot_no: 'B-1', size_marla: 7.5, price_per_marla: 900000, is_corner: true, category: 'COMMERCIAL' };
    assert.equal(Number(ok(await admin.put(`/plots/${p.id}`, { ...b1, discount_per_marla: 20000 })).discount), 150000);
    assert.equal(Number(ok(await admin.put(`/plots/${p.id}`, { ...b1, discount_per_marla: '1,000.50' })).discount), 7503.75);
    const over = await admin.put(`/plots/${p.id}`, { ...b1, discount_per_marla: 900001 });
    assert.equal(over.status, 400);
    assert.match(over.data.error, /per Marla cannot be more than the price per Marla/);
    assert.equal(Number(ok(await admin.put(`/plots/${p.id}`, { ...b1, discount_per_marla: '' })).discount), 0);
    assert.equal((await admin.post('/plots', { society_id: s.id, block_id: ids.blockB, plot_no: 'b-1', size_marla: 5 })).status, 409);
    assert.equal((await sales.post('/plots', { society_id: s.id, block_id: ids.blockB, plot_no: 'B-9', size_marla: 5 })).status, 403);
    const list = ok(await admin.get(`/plots?society_id=${s.id}&status=AVAILABLE&size=5`));
    assert.equal(list.length, 20);
    assert.equal(list[0].plot_no, 'A-1');
    assert.equal(list[1].plot_no, 'A-2');
    ids.plots = list.map((x) => x.id);
    ids.plotB1 = p.id;
    const map = ok(await viewer.get(`/plots/map?society_id=${s.id}`));
    assert.equal(map.plots.length, 21);
  });
  it('reserves, releases, withdraws and deletes unused plots', async () => {
    const pid = ids.plots[19];
    ok(await sales.post(`/plots/${pid}/reserve`, { reserved_for: 'Walk-in client', reserved_until: addDays(T, 7) }));
    assert.equal((await sales.post(`/plots/${pid}/reserve`, { reserved_for: 'Other' })).status, 409);
    ok(await sales.post(`/plots/${pid}/release`));
    ok(await admin.post(`/plots/${pid}/withdraw`, { reason: 'Boundary dispute' }));
    assert.equal(ok(await admin.get(`/plots/${pid}`)).status, 'CANCELLED');
    ok(await admin.post(`/plots/${pid}/restore`));
    ok(await admin.del(`/plots/${pid}`));
    ids.plots.pop();
  });
});

describe('customers', () => {
  it('registers customers, validates CNIC and prevents duplicates', async () => {
    const c = ok(await sales.post('/customers', { full_name: 'Ahmed Khan', father_name: 'Karim Khan', cnic: '3520212345671', mobile: '0300-1234567', nominee_name: 'Sara' }), 201);
    assert.equal(c.cnic, '35202-1234567-1');
    assert.match(c.customer_code, /^FH-C-\d{5}$/);
    ids.c1 = c.id;
    assert.equal((await sales.post('/customers', { full_name: 'Dup', cnic: '35202-1234567-1' })).status, 409);
    assert.equal((await sales.post('/customers', { full_name: 'Bad', cnic: '123' })).status, 400);
    ids.c2 = ok(await sales.post('/customers', { full_name: 'Bilal Ahmed', cnic: '61101-7654321-3', mobile: '03331112222' }), 201).id;
    ids.c3 = ok(await sales.post('/customers', { full_name: 'Zainab Bibi', cnic: '17301-5555555-2', mobile: '03455556666' }), 201).id;
    ids.c4 = ok(await sales.post('/customers', { full_name: 'Usman Tariq', cnic: '42101-9999999-9', mobile: '03219998888' }), 201).id;
  });
  it('no longer takes guarantor details, and editing keeps any saved earlier', async () => {
    const g = ok(await sales.post('/customers', { full_name: 'Guarantor Test', cnic: '35202-1111111-1', guarantor_name: 'Ignored', guarantor_cnic: '123' }), 201);
    assert.equal(g.guarantor_name, null);
    assert.equal(g.guarantor_cnic, null);
    await require('../src/db/pool').pool.query("UPDATE customers SET guarantor_name = 'Old Guarantor' WHERE id = $1", [g.id]);
    const edited = ok(await sales.put(`/customers/${g.id}`, { full_name: 'Guarantor Test 2', cnic: '35202-1111111-1' }));
    assert.equal(edited.full_name, 'Guarantor Test 2');
    assert.equal(edited.guarantor_name, 'Old Guarantor');
  });
  it('searches by CNIC digits, mobile, name and code; masks CNIC for viewers', async () => {
    assert.equal(ok(await sales.get('/customers?q=3520212345671')).length, 1);
    assert.equal(ok(await sales.get('/customers?q=1234567')).length, 1);
    assert.equal(ok(await sales.get('/customers?q=bilal')).length, 1);
    assert.equal(ok(await sales.get('/customers?q=03455556666')).length, 1);
    const v = ok(await viewer.get(`/customers/${ids.c1}`));
    assert.equal(v.customer.cnic, '35202-*******-1');
  });
});

describe('booking and installments', () => {
  it('books a plot with 30% booking + 36 monthly + 6 half-yearly and issues a receipt', async () => {
    const preview = ok(await sales.post('/bookings/preview', {
      plot_id: ids.plots[0], booking_date: T, rate_per_marla: 1000000, discount: 100000, booking_amount: 1470000,
      plan: { type: 'MONTHLY', installments: 36, rounding: 100, balloon_count: 6, balloon_amount: 300000, balloon_every: 6 },
    }));
    assert.equal(Number(preview.final_price), 4900000);
    assert.equal(preview.schedule.length, 43);
    const r = ok(await sales.post('/bookings', {
      customer_id: ids.c1, plot_id: ids.plots[0], booking_date: T, rate_per_marla: 1000000, discount: 100000, booking_amount: 1470000,
      plan: { type: 'MONTHLY', installments: 36, rounding: 100, balloon_count: 6, balloon_amount: 300000, balloon_every: 6 },
      payment: { method: 'CASH' },
    }), 201);
    ids.b1 = r.booking.id;
    assert.match(r.payment.receipt_no, /^FH-R-\d{6}$/);
    assert.equal(Number(r.payment.balance_before), 4900000);
    assert.equal(Number(r.payment.balance_after), 3430000);
    const b = ok(await admin.get(`/bookings/${ids.b1}`));
    assert.equal(Number(b.balance), 3430000);
    assert.equal(b.plot_status, 'BOOKED');
    assert.equal(b.schedule.length, 43);
    assert.equal(Number(b.schedule[0].paid_amount), 1470000);
  });
  it('prevents double booking (sequential and concurrent)', async () => {
    const body = { customer_id: ids.c2, plot_id: ids.plots[0], booking_date: T, rate_per_marla: 1000000, booking_amount: 0, plan: { type: 'FULL' } };
    assert.equal((await sales.post('/bookings', body)).status, 409);
    const p = ids.plots[1];
    const mk = (cid) => sales.post('/bookings', { customer_id: cid, plot_id: p, booking_date: T, rate_per_marla: 1000000, booking_amount: 100000, plan: { type: 'FULL' } });
    const results = await Promise.all([mk(ids.c2), mk(ids.c3), mk(ids.c4)]);
    const codes = results.map((x) => x.status).sort();
    assert.deepEqual(codes, [201, 409, 409]);
    ids.b2 = results.find((x) => x.status === 201).data.booking.id;
  });
  it('handles partial payments oldest-due-first, and refuses over/future payments', async () => {
    const b = ok(await acct.get(`/bookings/${ids.b1}`));
    const first = b.schedule.find((s) => s.kind === 'MONTHLY');
    const p1 = ok(await acct.post('/payments', { booking_id: ids.b1, amount: 20000, payment_date: T, method: 'CASH' }), 201);
    ids.p_partial = p1.id;
    let s = ok(await acct.get(`/bookings/${ids.b1}`)).schedule;
    assert.equal(Number(s.find((x) => x.id === first.id).paid_amount), 20000);
    const p2 = ok(await acct.post('/payments', { booking_id: ids.b1, amount: 30000, payment_date: T, method: 'BANK_TRANSFER', reference_no: 'TRX-1', bank_name: 'HBL' }), 201);
    ids.p_30k = p2.id;
    s = ok(await acct.get(`/bookings/${ids.b1}`)).schedule;
    const monthly = s.filter((x) => x.kind === 'MONTHLY' || x.kind === 'BALLOON').sort((a, c) => (a.due_date < c.due_date ? -1 : 1));
    assert.equal(Number(monthly[0].paid_amount), 45200);
    assert.equal(Number(monthly[1].paid_amount), 4800);
    assert.equal(Number(p2.balance_after), 3430000 - 50000);
    assert.equal((await acct.post('/payments', { booking_id: ids.b1, amount: 99999999, payment_date: T, method: 'CASH' })).status, 400);
    assert.equal((await acct.post('/payments', { booking_id: ids.b1, amount: 100, payment_date: addDays(T, 2), method: 'CASH' })).status, 400);
    assert.equal((await acct.post('/payments', { booking_id: ids.b1, amount: 100, payment_date: T, method: 'CHEQUE' })).status, 400);
    assert.equal((await acct.post('/payments', { booking_id: ids.b1, amount: 100.555, payment_date: T, method: 'CASH' })).status, 400);
    assert.equal((await sales.post('/payments', { booking_id: ids.b1, amount: 100, payment_date: T, method: 'CASH' })).status, 403);
  });
  it('reverses payments with audit trail instead of deleting them', async () => {
    assert.equal((await acct.post(`/payments/${ids.p_30k}/reverse`, { reason: 'x' })).status, 403);
    assert.equal((await admin.post(`/payments/${ids.p_30k}/reverse`, {})).status, 400);
    ok(await admin.post(`/payments/${ids.p_30k}/reverse`, { reason: 'Bank transfer bounced' }));
    assert.equal((await admin.post(`/payments/${ids.p_30k}/reverse`, { reason: 'again' })).status, 409);
    const b = ok(await admin.get(`/bookings/${ids.b1}`));
    assert.equal(Number(b.balance), 3430000 - 20000);
    const rev = b.payments.find((p) => p.id === ids.p_30k);
    assert.equal(rev.status, 'REVERSED');
    const s = b.schedule.filter((x) => x.kind === 'MONTHLY');
    assert.equal(Number(s[0].paid_amount), 20000);
    assert.equal(Number(s[1].paid_amount), 0);
    const cash = ok(await admin.get(`/reports/daily-cash?date=${T}`));
    assert.ok(cash.rows.some((r) => r.entry_type === 'PAYMENT_REVERSED'));
    const audit = ok(await admin.get('/audit?action=REVERSE'));
    assert.ok(audit.length >= 1);
  });
  it('marks the plot SOLD when fully paid and back to BOOKED if reversed', async () => {
    const b = ok(await admin.get(`/bookings/${ids.b2}`));
    assert.equal(Number(b.balance), 4900000);
    const p = ok(await acct.post('/payments', { booking_id: ids.b2, amount: 4900000, payment_date: T, method: 'CHEQUE', reference_no: '000123' }), 201);
    assert.equal(ok(await admin.get(`/plots/${b.plot_id}`)).status, 'SOLD');
    ok(await admin.post(`/payments/${p.id}/reverse`, { reason: 'Cheque dishonoured' }));
    assert.equal(ok(await admin.get(`/plots/${b.plot_id}`)).status, 'BOOKED');
    ok(await acct.post('/payments', { booking_id: ids.b2, amount: 4900000, payment_date: T, method: 'CASH' }), 201);
    assert.equal(ok(await admin.get(`/plots/${b.plot_id}`)).status, 'SOLD');
    assert.equal((await acct.post('/payments', { booking_id: ids.b2, amount: 1, payment_date: T, method: 'CASH' })).status, 400);
  });
  it('lets an admin edit the schedule (total must still match) and keeps a revision', async () => {
    const b = ok(await admin.get(`/bookings/${ids.b1}`));
    const rows = b.schedule.map((s) => ({ kind: s.kind, label: s.label, due_date: s.due_date, amount: s.amount }));
    const last = rows.pop(); rows[rows.length - 1].amount = String(Number(rows[rows.length - 1].amount) + Number(last.amount) - 1);
    assert.equal((await admin.put(`/bookings/${ids.b1}/schedule`, { rows, reason: 'merge' })).status, 400);
    rows[rows.length - 1].amount = String(Number(rows[rows.length - 1].amount) + 1);
    assert.equal((await acct.put(`/bookings/${ids.b1}/schedule`, { rows, reason: 'merge' })).status, 403);
    ok(await admin.put(`/bookings/${ids.b1}/schedule`, { rows, reason: 'Customer asked to merge last two installments' }));
    const after = ok(await admin.get(`/bookings/${ids.b1}`));
    assert.equal(after.schedule.length, 42);
    assert.equal(after.revisions.length, 1);
    assert.equal(Number(after.balance), 3410000);
    assert.equal(Number(after.schedule[0].paid_amount), 1470000);
  });
});

describe('overdue and late fees', () => {
  it('detects overdue installments and never charges late fee automatically', async () => {
    const bd = addMonths(T, -6);
    const r = ok(await sales.post('/bookings', {
      customer_id: ids.c3, plot_id: ids.plots[2], booking_date: bd, rate_per_marla: 1000000, booking_amount: 500000,
      plan: { type: 'MONTHLY', installments: 10, start_date: addMonths(bd, 1), rounding: 1 },
    }), 201);
    ids.b3 = r.booking.id;
    const b = ok(await admin.get(`/bookings/${ids.b3}`));
    assert.ok(b.overdue_count >= 5, `overdue count ${b.overdue_count}`);
    assert.equal(Number(b.overdue_amount), 450000 * b.overdue_count);
    let rep = ok(await admin.get('/reports/overdue'));
    const row = rep.rows.find((x) => x.booking_id === ids.b3);
    assert.ok(row);
    assert.equal(row.suggested_late_fee, 0);
    ok(await admin.put('/settings', { late_fee: { enabled: true, mode: 'FIXED', value: 1000, grace_days: 5 } }));
    rep = ok(await admin.get('/reports/overdue'));
    assert.ok(rep.rows.find((x) => x.booking_id === ids.b3).suggested_late_fee >= 5000);
    const b2 = ok(await admin.get(`/bookings/${ids.b3}`));
    assert.equal(b2.charges.length, 0, 'no automatic charges');
    assert.equal(Number(b2.charges_due), 0);
    const inst = b2.schedule.find((s) => s.kind === 'MONTHLY');
    const ch = ok(await admin.post(`/bookings/${ids.b3}/charges`, { charge_type: 'LATE_FEE', amount: 1000, description: 'Late fee - installment 1', installment_id: inst.id }), 201);
    assert.equal((await admin.post(`/bookings/${ids.b3}/charges`, { charge_type: 'LATE_FEE', amount: 1000, description: 'dup', installment_id: inst.id })).status, 409);
    const before = Number(ok(await admin.get(`/bookings/${ids.b3}`)).balance);
    const pay = ok(await acct.post('/payments', { booking_id: ids.b3, purpose: 'CHARGE', charge_id: ch.id, amount: 1000, payment_date: T, method: 'CASH' }), 201);
    assert.equal(pay.purpose, 'CHARGE');
    const after = ok(await admin.get(`/bookings/${ids.b3}`));
    assert.equal(Number(after.balance), before);
    assert.equal(Number(after.charges_due), 0);
    ok(await admin.put('/settings', { late_fee: { enabled: false, mode: 'FIXED', value: 0, grace_days: 0 } }));
  });
});

describe('transfers', () => {
  it('blocks transfer when dues are pending unless an admin overrides with a reason', async () => {
    const chk = ok(await admin.get(`/transfers/check/${ids.b3}`));
    assert.equal(chk.clear, false);
    const body = { booking_id: ids.b3, to_customer_id: ids.c4, transfer_date: T, transfer_fee: 0 };
    assert.equal((await sales.post('/transfers', body)).status, 403);
    const r = await admin.post('/transfers', body);
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'DUES_PENDING');
    assert.equal((await admin.post('/transfers', { ...body, override_dues: true })).status, 400);
  });
  it('transfers a clean plot with fee, keeps ownership history and ledgers balanced', async () => {
    const b = ok(await admin.get(`/bookings/${ids.b1}`));
    const r = ok(await admin.post('/transfers', {
      booking_id: ids.b1, to_customer_id: ids.c2, transfer_date: T, transfer_fee: 25000, fee_paid_by: 'FROM', fee_paid_now: true, fee_method: 'CASH',
      witness_1: 'Witness One', witness_2: 'Witness Two',
    }), 201);
    ids.t1 = r.transfer.id;
    assert.match(r.transfer.transfer_no, /^FH-T-/);
    assert.ok(r.payment);
    const after = ok(await admin.get(`/bookings/${ids.b1}`));
    assert.equal(after.customer_id, ids.c2);
    assert.equal(after.plot_status, 'TRANSFERRED');
    assert.equal(after.owners.length, 2);
    assert.equal(Number(after.balance), Number(b.balance));
    const oldL = ok(await admin.get(`/reports/customer-ledger?customer_id=${ids.c1}`));
    assert.equal(oldL.rows[oldL.rows.length - 1].balance, 0);
    const newL = ok(await admin.get(`/reports/customer-ledger?customer_id=${ids.c2}`));
    const c2bal = newL.rows.filter((x) => x.ref !== undefined).pop().balance;
    // c2 owns b1 (transferred in, remaining balance) and b2 (fully paid)
    assert.equal(c2bal, Number(after.balance));
    assert.equal((await admin.post('/transfers', { booking_id: ids.b1, to_customer_id: ids.c2, transfer_date: T })).status, 400);
    const letter = await admin.get(`/transfers/${ids.t1}/letter.pdf`);
    assert.equal(letter.data.slice(0, 4).toString(), '%PDF');
  });
});

describe('cancellation and refunds', () => {
  it('cancels with partial refund, releases the plot and reports forfeited amount', async () => {
    const b = ok(await admin.get(`/bookings/${ids.b3}`));
    const paid = Number(b.paid);
    assert.equal((await sales.post(`/bookings/${ids.b3}/cancel`, { reason: 'x' })).status, 403);
    assert.equal((await admin.post(`/bookings/${ids.b3}/cancel`, { reason: 'Defaulted', refund_amount: paid + 1 })).status, 400);
    const r = ok(await admin.post(`/bookings/${ids.b3}/cancel`, { reason: 'Customer defaulted on 5 installments', refund_amount: 300000, refund_method: 'CASH' }));
    assert.equal(Number(r.retained), paid - 300000);
    assert.equal(ok(await admin.get(`/plots/${b.plot_id}`)).status, 'AVAILABLE');
    assert.equal((await acct.post('/payments', { booking_id: ids.b3, amount: 10, payment_date: T, method: 'CASH' })).status, 409);
    assert.equal((await admin.post(`/bookings/${ids.b3}/cancel`, { reason: 'again' })).status, 409);
    const sum = ok(await admin.get('/reports/summary')).raw;
    assert.equal(sum.forfeited_on_cancellation, paid - 300000);
    assert.equal(sum.refunds_paid, 300000);
    // plot can be sold again
    ok(await sales.post('/bookings', { customer_id: ids.c4, plot_id: b.plot_id, booking_date: T, rate_per_marla: 1100000, booking_amount: 1000000, plan: { type: 'QUARTERLY', installments: 8 } }), 201);
  });
});

describe('expenses and financial reports', () => {
  it('records and cancels expenses through the ledger', async () => {
    const cats = ok(await acct.get('/expenses/categories'));
    const dev = cats.find((c) => c.name === 'Development');
    const mkt = cats.find((c) => c.name === 'Marketing');
    // Payments to land owners are not an expense category: they go through Pay Land Owner with a payment source.
    assert.ok(!cats.some((c) => c.cost_type === 'LAND_PAYMENT'));
    assert.equal((await admin.post('/settings/expense-categories', { name: 'Land Purchase', cost_type: 'LAND_PAYMENT' })).status, 400);
    ok(await acct.post(`/lands/${ids.land}/payments`, { amount: 3000000, payment_date: T, method: 'BANK_TRANSFER', sources: [{ type: 'PERSONAL_NEW', amount: 3000000, investor_name: 'Owner' }] }), 201);
    ok(await acct.post('/expenses', { expense_date: T, category_id: dev.id, description: 'Road levelling', amount: 2100000, method: 'CASH', paid_to: 'Contractor' }), 201);
    const m = ok(await acct.post('/expenses', { expense_date: T, category_id: mkt.id, description: 'Facebook ads', amount: 50000, method: 'CASH' }), 201);
    const wrong = ok(await acct.post('/expenses', { expense_date: T, category_id: mkt.id, description: 'Typo entry', amount: 999, method: 'CASH' }), 201);
    assert.equal((await acct.post(`/expenses/${wrong.id}/cancel`, { reason: 'typo' })).status, 403);
    ok(await admin.post(`/expenses/${wrong.id}/cancel`, { reason: 'Typo' }));
    assert.equal((await acct.put(`/expenses/${m.id}`, { category_id: mkt.id, description: 'Facebook + Instagram ads' })).status, 200);
    const rep = ok(await acct.get(`/reports/expenses?from=${T}&to=${T}&group=daily`));
    assert.equal(rep.totals.amount, 2100000 + 50000);
  });
  it('produces consistent financial summary (no "received minus land" shortcuts)', async () => {
    const f = ok(await acct.get('/reports/summary')).raw;
    const close = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);
    close(f.total_receivables, f.total_sales - f.total_collected_on_sales);
    close(f.net_cash, f.cash_in - f.cash_out);
    close(f.total_land_investment, 5000000);
    close(f.land_payable, 2000000);
    close(f.development_expenses, 2100000);
    close(f.operating_expenses, 50000);
    close(f.total_project_cost, 7100000);
    close(f.cost_per_marla, Math.round((7100000 / f.cost_basis_marla) * 100) / 100);
    assert.equal(f.cost_basis_marla, f.plotted_marla);
    close(f.expected_gross_profit, f.total_sales - f.cost_of_booked_area);
    close(f.realized_gross_profit, Math.round(f.expected_gross_profit * (f.total_collected_on_sales / f.total_sales) * 100) / 100);
    close(f.realized_net_profit, f.realized_gross_profit + f.other_income + f.forfeited_on_cancellation - f.operating_expenses);
    close(f.total_collected_on_sales, f.total_booking_collected + f.total_installments_collected);
    close(f.other_income, 26000); // transfer fee 25,000 + late fee 1,000
    const d = ok(await acct.get('/dashboard'));
    assert.equal(d.plots.total, 20);
    assert.ok(d.finance.today_collections > 0);
    const ds = ok(await sales.get('/dashboard'));
    assert.equal(ds.finance, undefined);
  });
  it('serves every report as JSON, Excel and PDF', async () => {
    const names = ok(await acct.get('/reports'));
    for (const n of names) {
      const q = n === 'customer-ledger' ? `?customer_id=${ids.c2}` : n === 'plot-ledger' ? `?plot_id=${ids.plots[0]}` : n === 'land-statement' ? `?land_id=${ids.land}` : '';
      const j = ok(await acct.get(`/reports/${n}${q}`));
      assert.ok(Array.isArray(j.rows), n);
      const x = await acct.get(`/reports/${n}${q}${q ? '&' : '?'}format=xlsx`);
      assert.equal(x.status, 200, n);
      assert.equal(x.data.slice(0, 2).toString(), 'PK', `${n} xlsx`);
      const p = await acct.get(`/reports/${n}${q}${q ? '&' : '?'}format=pdf`);
      assert.equal(p.status, 200, n);
      assert.equal(p.data.slice(0, 4).toString(), '%PDF', `${n} pdf`);
    }
  });
  it('prints receipts (duplicate on reprint) and booking confirmations', async () => {
    const pays = ok(await acct.get(`/payments?booking_id=${ids.b1}`));
    const r1 = await acct.get(`/payments/${pays[0].id}/receipt.pdf`);
    assert.equal(r1.data.slice(0, 4).toString(), '%PDF');
    await acct.get(`/payments/${pays[0].id}/receipt.pdf`);
    const det = ok(await acct.get(`/payments/${pays[0].id}`));
    assert.equal(det.print_count, 2);
    const c = await viewer.get(`/bookings/${ids.b1}/confirmation.pdf`);
    assert.equal(c.data.slice(0, 4).toString(), '%PDF');
  });
});

describe('documents (Supabase Storage)', () => {
  const { createClient } = require('@supabase/supabase-js');
  // Same three steps as the web app: ask for a one-time link, upload straight to storage, record it.
  async function upload(api, entityType, entityId, file, mime, docType, name) {
    const link = { entity_type: entityType, entity_id: entityId, doc_type: docType };
    const u = ok(await api.post('/documents/upload-url', { ...link, file_name: name, mime_type: mime, size: file.length }));
    const sb = createClient(ctx.fake.url, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await sb.storage.from(u.bucket).uploadToSignedUrl(u.path, u.token, file, { contentType: mime });
    assert.equal(error, null);
    return { u, reg: await api.post('/documents', { ...link, original_name: name, stored_name: u.path }) };
  }
  it('uploads straight to storage, protects, and soft-deletes documents', async () => {
    const { u, reg } = await upload(sales, 'CUSTOMER', ids.c1, png, 'image/png', 'CNIC_FRONT', 'cnic.png');
    const up = ok(reg, 201);
    assert.equal(up.size_bytes, png.length);
    assert.equal(up.mime_type, 'image/png');
    assert.match(up.stored_name, /^documents\/\d{4}-\d{2}\/[a-f0-9]{32}\.png$/);
    const again = { entity_type: 'CUSTOMER', entity_id: ids.c1, original_name: 'x.png' };
    assert.equal((await sales.post('/documents', { ...again, stored_name: u.path })).status, 409, 'same file recorded twice');
    assert.equal((await sales.post('/documents', { ...again, stored_name: `documents/2026-01/${'a'.repeat(32)}.png` })).status, 400, 'never uploaded');
    assert.equal((await sales.post('/documents', { ...again, stored_name: '../../secret.png' })).status, 400);
    assert.equal(ok(await sales.get(`/documents?entity_type=CUSTOMER&entity_id=${ids.c1}`)).length, 1);
    // viewing: permission check, then a short-lived storage link
    const f = await sales.get(`/documents/${up.id}/file`, { redirect: 'manual' });
    assert.equal(f.status, 302);
    const file = await fetch(f.headers.get('location'));
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
    // plain browser links (img src, PDF links) authenticate with the fh_at cookie
    assert.equal((await sales.get(`/documents/${up.id}/file`, { redirect: 'manual', auth: 'cookie' })).status, 302);
    assert.ok(ok(await admin.get('/audit?action=VIEW_DOCUMENT')).length >= 2, 'CNIC views are audited');
    assert.equal((await viewer.get(`/documents/${up.id}/file`)).status, 403);
    assert.equal((await ctx.api().get(`/documents/${up.id}/file`)).status, 401);
    const ask = { entity_type: 'CUSTOMER', entity_id: ids.c1, doc_type: 'OTHER' };
    assert.equal((await sales.post('/documents/upload-url', { ...ask, file_name: 'virus.exe', mime_type: 'application/x-msdownload', size: 2 })).status, 400);
    assert.equal((await sales.post('/documents/upload-url', { ...ask, file_name: 'big.pdf', mime_type: 'application/pdf', size: 50 * 1024 * 1024 })).status, 400);
    assert.equal((await sales.post('/documents/upload-url', { ...ask, entity_id: 99999, file_name: 'a.pdf', mime_type: 'application/pdf', size: 10 })).status, 404);
    assert.equal((await viewer.post('/documents/upload-url', { ...ask, file_name: 'a.pdf', mime_type: 'application/pdf', size: 10 })).status, 403);
    assert.equal((await sales.del(`/documents/${up.id}`)).status, 403);
    ok(await admin.del(`/documents/${up.id}`));
    assert.equal(ok(await sales.get(`/documents?entity_type=CUSTOMER&entity_id=${ids.c1}`)).length, 0);
  });
  it('sets the customer photo', async () => {
    const { reg } = await upload(sales, 'CUSTOMER', ids.c2, png, 'image/png', 'PHOTO', 'photo.png');
    const d = ok(reg, 201);
    assert.equal(ok(await sales.get(`/customers/${ids.c2}`)).customer.photo_document_id, d.id);
  });
});

describe('logo, export and public settings', () => {
  it('keeps the company logo in Supabase Storage and prints it on PDFs', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
    ok(await admin.req('POST', '/settings/logo', undefined, { form: fd }));
    const b = ok(await ctx.api().get('/public/branding'));
    assert.equal(b.hasLogo, true);
    assert.ok(b.logoVersion >= 1);
    const l = await ctx.api().get('/public/logo');
    assert.equal(l.status, 200);
    assert.deepEqual(l.data, png);
    const pays = ok(await acct.get(`/payments?booking_id=${ids.b1}`));
    assert.equal((await acct.get(`/payments/${pays[0].id}/receipt.pdf`)).data.slice(0, 4).toString(), '%PDF');
    assert.equal((await acct.req('POST', '/settings/logo', undefined, { form: fd })).status, 403);
    ok(await admin.del('/settings/logo'));
    assert.equal(ok(await ctx.api().get('/public/branding')).hasLogo, false);
    assert.equal((await ctx.api().get('/public/logo')).status, 404);
  });
  it('exports all data to Excel (admin only)', async () => {
    const x = await admin.get('/backup/export.xlsx');
    assert.equal(x.status, 200);
    assert.equal(x.data.slice(0, 2).toString(), 'PK');
    assert.equal((await acct.get('/backup/export.xlsx')).status, 403);
  });
  it('gives the browser only the Supabase URL and publishable key', async () => {
    const c = ok(await ctx.api().get('/public/config'));
    assert.deepEqual(Object.keys(c).sort(), ['supabaseAnonKey', 'supabaseUrl']);
    assert.equal(c.supabaseAnonKey, ANON_KEY);
    assert.ok(!JSON.stringify(c).includes('service'));
  });
});
