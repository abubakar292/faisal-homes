'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { maskFor } = require('../lib/mask');
const { notFound } = require('../lib/errors');
const { recordPayment, reversePayment } = require('../services/paymentService');
const pdf = require('../lib/pdf');
const { z, parse, intId, money, date, optText, reqText, method, optId } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');

const DETAIL_SQL = `
  SELECT pm.*, c.full_name AS customer_name, c.father_name AS customer_father_name, c.cnic AS customer_cnic, c.mobile AS customer_mobile, c.customer_code,
    b.booking_no, b.size_marla, b.final_price, b.status AS booking_status,
    pl.plot_no, pl.street_no, bl.name AS block_name, s.name AS society_name,
    ch.description AS charge_description, ch.charge_type,
    u.full_name AS created_by_name, ru.full_name AS reversed_by_name
  FROM payments pm JOIN customers c ON c.id = pm.customer_id JOIN bookings b ON b.id = pm.booking_id
  JOIN plots pl ON pl.id = pm.plot_id JOIN blocks bl ON bl.id = pl.block_id JOIN societies s ON s.id = pl.society_id
  LEFT JOIN charges ch ON ch.id = pm.charge_id LEFT JOIN users u ON u.id = pm.created_by LEFT JOIN users ru ON ru.id = pm.reversed_by`;

router.get('/', requirePerm('payment.view'), async (req, res) => {
  const q = req.query; const p = []; const where = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace(/\?/g, `$${p.length}`)); };
  if (q.q) add('(pm.receipt_no ILIKE ? OR c.full_name ILIKE ? OR pl.plot_no ILIKE ? OR b.booking_no ILIKE ? OR c.cnic ILIKE ? OR pm.reference_no ILIKE ?)', `%${q.q}%`);
  if (q.from) add('pm.payment_date >= ?', q.from);
  if (q.to) add('pm.payment_date <= ?', q.to);
  if (q.method) add('pm.method = ?', q.method);
  if (q.status) add('pm.status = ?', q.status);
  if (q.booking_id) add('pm.booking_id = ?', Number(q.booking_id));
  if (q.customer_id) add('pm.customer_id = ?', Number(q.customer_id));
  const limit = Math.min(Number(q.limit) || 2000, 10000);
  const r = await pool.query(`${DETAIL_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pm.id DESC LIMIT ${limit}`, p);
  res.json(maskFor(req, r.rows));
});

router.get('/:id', requirePerm('payment.view'), async (req, res) => {
  const r = (await pool.query(`${DETAIL_SQL} WHERE pm.id = $1`, [Number(req.params.id)])).rows[0];
  if (!r) throw notFound('Receipt');
  r.allocations = (await pool.query(`SELECT a.amount, i.label, i.due_date FROM payment_allocations a JOIN installments i ON i.id = a.installment_id
    WHERE a.payment_id = $1 ORDER BY i.due_date`, [r.id])).rows;
  res.json(maskFor(req, r));
});

router.post('/', requirePerm('payment.create'), async (req, res) => {
  const b = parse(z.object({
    booking_id: intId('Booking'),
    purpose: z.enum(['INSTALLMENT', 'CHARGE']).default('INSTALLMENT'),
    charge_id: optId,
    amount: money('Amount received').refine((v) => v > 0, 'Amount received must be greater than 0'),
    payment_date: date('Payment date'),
    method,
    reference_no: optText, bank_name: optText, notes: optText,
  }), req.body);
  if (b.purpose === 'CHARGE' && !b.charge_id) { const { badRequest } = require('../lib/errors'); throw badRequest('Select the charge being paid'); }
  const pay = await withTx((c) => recordPayment(c, req, b));
  res.status(201).json(pay);
});

router.post('/:id/reverse', requirePerm('payment.reverse'), async (req, res) => {
  const { reason } = parse(z.object({ reason: reqText('Reason for reversal') }), req.body);
  res.json(await withTx((c) => reversePayment(c, req, Number(req.params.id), reason)));
});

router.get('/:id/receipt.pdf', requirePerm('payment.view'), async (req, res) => {
  const id = Number(req.params.id);
  const r = (await pool.query(`${DETAIL_SQL} WHERE pm.id = $1`, [id])).rows[0];
  if (!r) throw notFound('Receipt');
  const printCount = r.print_count;
  await pool.query('UPDATE payments SET print_count = print_count + 1 WHERE id=$1', [id]);
  await pdf.sendPdf(res, `Receipt-${r.receipt_no}.pdf`, (doc, ctx) => pdf.receipt(doc, ctx, maskFor(req, r), { duplicate: printCount > 0 }), req.query.download);
});

module.exports = router;
