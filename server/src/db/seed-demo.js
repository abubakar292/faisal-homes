'use strict';
// Demo / training data. Run on an EMPTY database only:  npm run seed:demo
// Creates login  admin / Admin@12345  (change it after first login).
const bcrypt = require('bcryptjs');
const { pool, withTx } = require('./pool');
const { migrate } = require('./migrate');
const { nextNumber } = require('../lib/counters');
const { addMonths, today, addDays } = require('../lib/dates');
const { createBooking, cancelBooking } = require('../services/bookingService');
const { recordPayment } = require('../services/paymentService');
const { createTransfer } = require('../services/transferService');
const { createLand, payLandOwner, createLandExpense, createInvestment } = require('../services/landService');
const { toPaisa, fromPaisa } = require('../lib/money');

async function main() {
  await migrate({ quiet: true });
  const n = (await pool.query('SELECT COUNT(*)::int AS n FROM bookings')).rows[0].n;
  if (n > 0) { console.error('Database already has bookings. Demo data is only for an empty database.'); process.exit(1); }
  const T = today();
  let admin = (await pool.query("SELECT * FROM users WHERE role='ADMIN' ORDER BY id LIMIT 1")).rows[0];
  if (!admin) {
    admin = (await pool.query(`INSERT INTO users (username, full_name, password_hash, role) VALUES ('admin','Office Administrator',$1,'ADMIN') RETURNING *`,
      [await bcrypt.hash('Admin@12345', 12)])).rows[0];
    for (const [u, name, role] of [['accountant', 'Accounts Officer', 'ACCOUNTANT'], ['sales', 'Sales Officer', 'SALES'], ['viewer', 'Director (view only)', 'VIEWER']]) {
      await pool.query('INSERT INTO users (username, full_name, password_hash, role) VALUES ($1,$2,$3,$4)', [u, name, await bcrypt.hash('Passw0rd!', 12), role]);
    }
  }
  const req = { user: admin, ip: 'seed' };
  await pool.query(`UPDATE settings SET value = $1 WHERE key='company'`, [JSON.stringify({ name: 'FAISAL HOMES', tagline: 'Real Estate & Developers', address: 'Main GT Road, Pakistan', phone: '0300-0000000', email: 'info@faisalhomes.pk', website: '' })]);

  await withTx(async (c) => {
    const land = await createLand(c, req, {
      name: 'Main Land - Mauza Demo', location: 'Main GT Road', area_kanal: 108, area_marla: 15, area_sqft: 0, marla_sqft: 272.25, kanal_marla: 20, saleable_marla: 1400,
      rate_per_marla: 69000, purchase_date: addMonths(T, -14), seller_name: 'Haji Abdul Rehman', seller_father_name: 'Ghulam Rasool', seller_cnic: '35202-0000000-1',
      seller_mobile: '0300-9876543', seller_address: 'Village Kot, Main GT Road', purchased_by: 'Muhammad Faisal',
      agreement_details: 'Stamp paper agreement; price payable in instalments', registry_details: 'Registry done; Intiqal attested',
      owner_name: 'Faisal Homes (Pvt) Ltd', registry_no: 'REG-1123', mutation_no: 'INT-4567', khasra_no: '211/3',
    });
    const soc = (await c.query(`INSERT INTO societies (name, code, land_id, location, marla_sqft, description, created_by, updated_by)
      VALUES ('Faisal Homes','FH',$1,'Main GT Road',272.25,'Residential & commercial society',$2,$2) RETURNING id`, [land.id, admin.id])).rows[0];
    const blocks = {};
    for (const [i, b] of ['A', 'B', 'C'].entries()) {
      blocks[b] = (await c.query('INSERT INTO blocks (society_id, name, sort_order, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [soc.id, b, i + 1, admin.id])).rows[0].id;
    }
    const mk = async (block, prefix, start, count, size, rate, street, extra = {}) => {
      for (let i = 0; i < count; i++) {
        const no = `${prefix}${start + i}`;
        await c.query(`INSERT INTO plots (society_id, block_id, plot_no, street_no, size_marla, front_ft, depth_ft, category, is_corner, is_main_road, is_park_facing, price_per_marla, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
        [soc.id, blocks[block], no, street, size, extra.front || null, extra.depth || null, extra.category || 'RESIDENTIAL', i === 0 || i === count - 1, !!extra.mainRoad, !!extra.park && i < 3, rate, admin.id]);
      }
    };
    await mk('A', 'A-', 1, 12, 3, 1000000, '1', { front: 20, depth: 40.8 });
    await mk('A', 'A-', 13, 12, 5, 1000000, '2', { front: 25, depth: 54.5, park: true });
    await mk('B', 'B-', 1, 8, 7, 1000000, '3', { front: 30, depth: 63.5 });
    await mk('B', 'B-', 9, 8, 10, 1000000, '4', { front: 35, depth: 77.8 });
    await mk('C', 'C-', 1, 6, 8, 1500000, 'Main Boulevard', { category: 'COMMERCIAL', mainRoad: true, front: 30, depth: 72.6 });

    const people = [
      ['Muhammad Ahmed', 'Abdul Ghafoor', '35202-1000001-1', '0300-1111111', 'Lahore'], ['Ayesha Siddiqui', 'Tariq Siddiqui', '35201-1000002-2', '0301-2222222', 'Lahore'],
      ['Imran Hussain', 'Sajid Hussain', '34101-1000003-3', '0333-3333333', 'Gujranwala'], ['Nadia Perveen', 'Muhammad Aslam', '35202-1000004-4', '0345-4444444', 'Lahore'],
      ['Kashif Mehmood', 'Mehmood Akhtar', '61101-1000005-5', '0321-5555555', 'Islamabad'], ['Rizwan Ali', 'Liaqat Ali', '17301-1000006-7', '0312-6666666', 'Peshawar'],
      ['Sana Javed', 'Javed Iqbal', '35202-1000007-8', '0302-7777777', 'Lahore'], ['Hamza Farooq', 'Umar Farooq', '35201-1000008-9', '0334-8888888', 'Kasur'],
    ];
    const cust = [];
    for (const [name, father, cnic, mobile, city] of people) {
      const code = await nextNumber(c, 'customer');
      cust.push((await c.query(`INSERT INTO customers (customer_code, full_name, father_name, cnic, mobile, whatsapp, city, address, registration_date, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$9) RETURNING id`, [code, name, father, cnic, mobile, city, `House 1, ${city}`, addMonths(T, -8), admin.id])).rows[0].id);
    }
    const plot = async (no) => (await c.query('SELECT id FROM plots WHERE plot_no=$1', [no])).rows[0].id;
    const plan36 = (bd) => ({ type: 'MONTHLY', installments: 36, start_date: addMonths(bd, 1), rounding: 100, balloon_count: 6, balloon_amount: 0, balloon_every: 6 });
    const book = async (ci, no, monthsAgo, size, rate, discount = 0, planType = '36+6') => {
      const bd = addMonths(T, -monthsAgo);
      const final = size * rate - discount;
      const booking = Math.round(final * 0.3);
      const balloon = Math.round((final * 0.3) / 6 / 1000) * 1000;
      const plan = planType === 'FULL' ? { type: 'FULL', full_due_date: addDays(bd, 30) } : { ...plan36(bd), balloon_amount: balloon };
      return (await createBooking(c, req, { customer_id: cust[ci], plot_id: await plot(no), booking_date: bd, rate_per_marla: rate, discount, booking_amount: booking,
        down_payment: 0, plan, payment: { method: 'CASH' }, sales_person: 'Sales Officer' })).booking;
    };
    const payMonths = async (b, months, method = 'CASH') => {
      const rows = (await c.query(`SELECT * FROM installments WHERE booking_id=$1 AND kind <> 'BOOKING' AND due_date <= $2 ORDER BY due_date LIMIT $3`, [b.id, T, months])).rows;
      for (const r of rows) await recordPayment(c, req, { booking_id: b.id, purpose: 'INSTALLMENT', amount: r.amount, payment_date: r.due_date, method, reference_no: method === 'CHEQUE' ? `CHQ-${r.id}` : null });
    };
    const b1 = await book(0, 'A-13', 7, 5, 1000000, 100000); await payMonths(b1, 20);
    const b2 = await book(1, 'A-2', 6, 3, 1000000); await payMonths(b2, 3); // leaves overdue
    const b3 = await book(2, 'B-9', 5, 10, 1000000, 250000); await payMonths(b3, 20, 'BANK_TRANSFER');
    const b4 = await book(3, 'C-2', 4, 8, 1500000, 0, 'FULL');
    await recordPayment(c, req, { booking_id: b4.id, purpose: 'INSTALLMENT', amount: 12000000 - 3600000, payment_date: addMonths(T, -3), method: 'CHEQUE', reference_no: '00045871', bank_name: 'Meezan Bank' });
    const b5 = await book(4, 'B-2', 3, 7, 1000000); await payMonths(b5, 20);
    const b6 = await book(5, 'A-5', 2, 3, 1000000); await payMonths(b6, 20);
    await createTransfer(c, req, { booking_id: b6.id, to_customer_id: cust[6], transfer_date: addDays(T, -10), transfer_fee: 25000, fee_paid_by: 'FROM', fee_paid_now: true, fee_method: 'CASH', witness_1: 'Shahid Mehmood', witness_2: 'Arif Khan' });
    const b7 = await book(7, 'A-8', 5, 3, 1000000); await payMonths(b7, 1);
    await cancelBooking(c, req, b7.id, { reason: 'Customer withdrew from purchase', refund_amount: 500000, refund_method: 'CASH', refund_date: addDays(T, -20) });
    await c.query(`UPDATE plots SET status='RESERVED', reserved_for='Mr. Khalid (walk-in)', reserved_until=$1, reserved_by=$2 WHERE plot_no='A-20'`, [addDays(T, 5), admin.id]);

    const cat = async (name) => (await c.query('SELECT id FROM expense_categories WHERE name=$1', [name])).rows[0].id;
    const exp = [
      ['Development', 'Land levelling & demarcation', 4500000, -9, 'CASH', null], ['Road Work', 'Main boulevard carpeting', 7200000, -6, 'BANK_TRANSFER', null],
      ['Electricity', 'Transformer & poles', 3100000, -5, 'CHEQUE', null], ['Water Supply', 'Water line & tank', 1900000, -4, 'CASH', null],
      ['Marketing', 'Billboards & social media', 450000, -3, 'CASH', null], ['Staff Salaries', 'Office staff salaries', 350000, -1, 'CASH', null],
      ['Office Expenses', 'Office rent & utilities', 120000, 0, 'CASH', null], ['Commission', 'Dealer commission', 300000, -2, 'CASH', null],
    ];
    for (const [cn, d, amt, mo, method, landId] of exp) {
      const no = await nextNumber(c, 'expense');
      const date = mo === 0 ? T : addMonths(T, mo);
      const e = (await c.query(`INSERT INTO expenses (expense_no, expense_date, category_id, description, amount, method, reference_no, land_id, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`, [no, date, await cat(cn), d, amt, method, method === 'CHEQUE' ? '00077881' : null, landId, admin.id])).rows[0];
      await c.query(`INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, description, created_by)
        VALUES ($1,'EXPENSE_PAID','OUT',$2,$3,'expense',$4,$5,$6,$7)`, [date, amt, method, e.id, no, `${cn}: ${d}`, admin.id]);
    }

    // Land purchase: payments to the owner with their funding source (personal investment and customer collections).
    const d1 = addMonths(T, -13);
    await payLandOwner(c, req, land.id, { amount: 60000000, payment_date: d1, method: 'BANK_TRANSFER', reference_no: 'TRX-55101', description: 'Payment to land owner - installment 1',
      sources: [{ type: 'PERSONAL_NEW', amount: 60000000, investor_name: 'Muhammad Faisal', investment_date: d1, method: 'BANK_TRANSFER', notes: 'Own savings' }] });
    await createLandExpense(c, req, land.id, { description: 'Registry & mutation fee', amount: 1800000, expense_date: d1, method: 'CASH', paid_to: 'Sub-Registrar office',
      sources: [{ type: 'PERSONAL_NEW', amount: 1800000, investor_name: 'Muhammad Faisal', investment_date: d1, method: 'CASH' }] });
    const d2 = addMonths(T, -2);
    const rec = (await c.query(`SELECT f.payment_id, f.available FROM v_receipt_funds f JOIN bookings b ON b.id = f.booking_id
      WHERE f.status = 'VALID' AND f.available > 0 AND b.status <> 'CANCELLED' AND f.payment_date <= $1 ORDER BY f.payment_date, f.payment_id`, [d2])).rows;
    let needP = toPaisa(10000000); const custSources = [];
    for (const r of rec) {
      if (needP <= 0) break;
      const takeP = Math.min(needP, toPaisa(r.available));
      custSources.push({ type: 'CUSTOMER', amount: fromPaisa(takeP), payment_id: r.payment_id, notes: 'Booking collections used for land' });
      needP -= takeP;
    }
    const custP = toPaisa(10000000) - needP;
    await payLandOwner(c, req, land.id, { amount: 50000000, payment_date: d2, method: 'BANK_TRANSFER', reference_no: 'TRX-77310', description: 'Payment to land owner - installment 2',
      sources: [{ type: 'PERSONAL_NEW', amount: fromPaisa(toPaisa(50000000) - custP), investor_name: 'Muhammad Faisal', investment_date: d2, method: 'BANK_TRANSFER' }, ...custSources] });
    await createInvestment(c, req, { investor_name: 'Muhammad Faisal', contribution_date: addMonths(T, -1), amount: 5000000, method: 'BANK_TRANSFER', notes: 'Capital kept for the next land payment' });
  });
  console.log('Demo data created. Login: admin / Admin@12345 (also accountant, sales, viewer with Passw0rd!)');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
