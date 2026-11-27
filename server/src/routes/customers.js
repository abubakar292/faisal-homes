'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { nextNumber } = require('../lib/counters');
const { maskFor } = require('../lib/mask');
const { notFound } = require('../lib/errors');
const { z, parse, reqText, optText, cnic, optCnic, phone, optDate } = require('../lib/validate');
const { today } = require('../lib/dates');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');

router.get('/', requirePerm('customer.view'), async (req, res) => {
  const p = []; const where = [];
  if (req.query.include_archived !== '1') where.push('NOT c.is_archived');
  if (req.query.q) {
    const q = String(req.query.q).trim();
    p.push(`%${q}%`);
    const digits = q.replace(/\D/g, '');
    p.push(digits.length >= 4 ? `%${digits}%` : '__no_match__');
    where.push(`(c.full_name ILIKE $1 OR c.customer_code ILIKE $1 OR c.mobile ILIKE $1 OR c.father_name ILIKE $1
      OR regexp_replace(c.cnic, '\\D', '', 'g') LIKE $2 OR regexp_replace(coalesce(c.mobile,''), '\\D', '', 'g') LIKE $2)`);
  }
  const limit = Math.min(Number(req.query.limit) || 5000, 5000);
  const r = await pool.query(`
    SELECT c.id, c.customer_code, c.full_name, c.father_name, c.cnic, c.mobile, c.whatsapp, c.city, c.registration_date, c.is_archived,
      c.photo_document_id,
      COALESCE(x.plot_count, 0)::int AS plot_count,
      COALESCE(x.total_price, 0)::numeric(16,2) AS total_price,
      COALESCE(x.paid, 0)::numeric(16,2) AS paid,
      COALESCE(x.balance, 0)::numeric(16,2) AS balance,
      COALESCE(x.overdue, 0)::numeric(16,2) AS overdue
    FROM customers c
    LEFT JOIN (
      SELECT b.customer_id, COUNT(*) AS plot_count, SUM(b.final_price) AS total_price, SUM(f.paid) AS paid,
             SUM(f.balance) AS balance, SUM(f.overdue_amount) AS overdue
      FROM bookings b JOIN v_booking_finance f ON f.booking_id = b.id WHERE b.status = 'ACTIVE' GROUP BY b.customer_id
    ) x ON x.customer_id = c.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.id DESC LIMIT ${limit}`, p);
  res.json(maskFor(req, r.rows));
});

router.get('/:id', requirePerm('customer.view'), async (req, res) => {
  const id = Number(req.params.id);
  const customer = (await pool.query('SELECT * FROM customers WHERE id=$1', [id])).rows[0];
  if (!customer) throw notFound('Customer');
  const bookings = (await pool.query(`
    SELECT b.*, p.plot_no, p.street_no, p.category, bl.name AS block_name, s.name AS society_name, f.*
    FROM bookings b JOIN plots p ON p.id = b.plot_id JOIN blocks bl ON bl.id = p.block_id JOIN societies s ON s.id = p.society_id
    JOIN v_booking_finance f ON f.booking_id = b.id
    WHERE b.customer_id = $1 OR b.id IN (SELECT booking_id FROM ownership_history WHERE customer_id = $1)
    ORDER BY b.status, b.id DESC`, [id])).rows.map((b) => ({ ...b, is_current_owner: b.customer_id === id }));
  const activeIds = bookings.filter((b) => b.status === 'ACTIVE' && b.is_current_owner).map((b) => b.id);
  const installments = activeIds.length ? (await pool.query(`
    SELECT i.*, b.booking_no, p.plot_no FROM installments i JOIN bookings b ON b.id = i.booking_id JOIN plots p ON p.id = b.plot_id
    WHERE i.booking_id = ANY($1) ORDER BY i.due_date, i.seq_no`, [activeIds])).rows : [];
  const payments = (await pool.query(`
    SELECT pm.*, b.booking_no, p.plot_no, bl.name AS block_name FROM payments pm JOIN bookings b ON b.id = pm.booking_id
    JOIN plots p ON p.id = pm.plot_id JOIN blocks bl ON bl.id = p.block_id
    WHERE pm.customer_id = $1 ORDER BY pm.payment_date DESC, pm.id DESC`, [id])).rows;
  const transfers = (await pool.query(`
    SELECT t.*, p.plot_no, bl.name AS block_name, fc.full_name AS from_name, tc.full_name AS to_name
    FROM transfers t JOIN plots p ON p.id = t.plot_id JOIN blocks bl ON bl.id = p.block_id
    JOIN customers fc ON fc.id = t.from_customer_id JOIN customers tc ON tc.id = t.to_customer_id
    WHERE t.from_customer_id = $1 OR t.to_customer_id = $1 ORDER BY t.transfer_date DESC, t.id DESC`, [id])).rows;
  const charges = activeIds.length ? (await pool.query(`SELECT * FROM v_charge_finance WHERE booking_id = ANY($1) ORDER BY charge_date`, [activeIds])).rows : [];
  const refunds = (await pool.query('SELECT r.*, b.booking_no FROM refunds r JOIN bookings b ON b.id = r.booking_id WHERE r.customer_id=$1 ORDER BY r.refund_date', [id])).rows;
  const active = bookings.filter((b) => b.status === 'ACTIVE' && b.is_current_owner);
  const sum = (arr, k) => arr.reduce((s, x) => s + Math.round(Number(x[k]) * 100), 0) / 100;
  const totals = {
    plots: active.length, total_price: sum(active, 'final_price'), paid: sum(active, 'paid'), balance: sum(active, 'balance'),
    overdue: sum(active, 'overdue_amount'), charges_due: sum(active, 'charges_due'),
  };
  res.json(maskFor(req, { customer, totals, bookings, installments, payments, transfers, charges, refunds }));
});

const schema = z.object({
  full_name: reqText('Full name'),
  father_name: optText,
  cnic: cnic('CNIC'),
  mobile: phone('Mobile'),
  whatsapp: phone('WhatsApp'),
  email: z.union([z.string().trim().email('Email is not valid'), z.literal(''), z.null(), z.undefined()]).transform((v) => v || null),
  address: optText, city: optText,
  nominee_name: optText, nominee_relation: optText, nominee_cnic: optCnic('Nominee CNIC'), nominee_mobile: phone('Nominee mobile'),
  notes: optText,
  registration_date: optDate('Registration date'),
});
const FIELDS = ['full_name', 'father_name', 'cnic', 'mobile', 'whatsapp', 'email', 'address', 'city', 'nominee_name', 'nominee_relation', 'nominee_cnic',
  'nominee_mobile', 'notes', 'registration_date']; // guarantor columns are no longer asked for; saved values are left as they are

router.post('/', requirePerm('customer.edit'), async (req, res) => {
  const b = parse(schema, req.body);
  b.registration_date = b.registration_date || today();
  const row = await withTx(async (c) => {
    const code = await nextNumber(c, 'customer');
    const r = (await c.query(
      `INSERT INTO customers (customer_code, ${FIELDS.join(',')}, created_by, updated_by)
       VALUES ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(',')}, $${FIELDS.length + 2}, $${FIELDS.length + 2}) RETURNING *`,
      [code, ...FIELDS.map((f) => b[f]), req.user.id])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'customer', entityId: r.id, summary: `Customer ${r.customer_code} ${r.full_name} registered`, after: r });
    return r;
  });
  res.status(201).json(row);
});

router.put('/:id', requirePerm('customer.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(schema, req.body);
  const row = await withTx(async (c) => {
    const before = (await c.query('SELECT * FROM customers WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!before) throw notFound('Customer');
    b.registration_date = b.registration_date || before.registration_date;
    const r = (await c.query(
      `UPDATE customers SET ${FIELDS.map((f, i) => `${f}=$${i + 2}`).join(', ')}, updated_by=$${FIELDS.length + 2}, updated_at=now()
       WHERE id=$1 RETURNING *`, [id, ...FIELDS.map((f) => b[f]), req.user.id])).rows[0];
    await audit(c, req, { action: 'UPDATE', entity: 'customer', entityId: id, summary: `Customer ${r.customer_code} ${r.full_name} updated`, before, after: r });
    return r;
  });
  res.json(row);
});

router.post('/:id/archive', requirePerm('customer.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const archive = req.body.archived !== false;
  await withTx(async (c) => {
    if (archive) {
      const n = (await c.query("SELECT COUNT(*)::int AS n FROM bookings WHERE customer_id=$1 AND status='ACTIVE'", [id])).rows[0].n;
      if (n) { const { badRequest } = require('../lib/errors'); throw badRequest('This customer has active plots and cannot be archived'); }
    }
    const r = await c.query('UPDATE customers SET is_archived=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING customer_code, full_name', [id, archive, req.user.id]);
    if (!r.rowCount) throw notFound('Customer');
    await audit(c, req, { action: 'UPDATE', entity: 'customer', entityId: id, summary: `Customer ${r.rows[0].customer_code} ${archive ? 'archived' : 'restored'}` });
  });
  res.json({ ok: true });
});

module.exports = router;
