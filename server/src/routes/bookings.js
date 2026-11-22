'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { maskFor } = require('../lib/mask');
const { notFound } = require('../lib/errors');
const svc = require('../services/bookingService');
const pdf = require('../lib/pdf');
const { z, parse, intId, money, optMoney, date, optDate, optText, reqText, method, bool, optId } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id', 'chargeId');

const planSchema = z.object({
  type: z.enum(['FULL', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'], { errorMap: () => ({ message: 'Select a payment plan' }) }),
  installments: z.union([z.coerce.number().int(), z.literal(''), z.null(), z.undefined()]).optional(),
  start_date: optDate('First installment date'),
  rounding: z.union([z.coerce.number(), z.null(), z.undefined()]).optional(),
  balloon_count: z.union([z.coerce.number().int().min(0), z.literal(''), z.null(), z.undefined()]).optional(),
  balloon_amount: optMoney('Extra payment amount'),
  balloon_every: z.union([z.coerce.number().int().min(1).max(60), z.literal(''), z.null(), z.undefined()]).optional(),
  balloon_start: optDate('First extra payment date'),
  full_due_date: optDate('Full payment due date'),
  custom_rows: z.array(z.object({ due_date: z.string(), amount: z.union([z.number(), z.string()]), label: z.string().optional() })).optional(),
});
const bookingSchema = z.object({
  customer_id: intId('Customer'),
  plot_id: intId('Plot'),
  booking_date: date('Booking date'),
  rate_per_marla: money('Price per Marla'),
  discount: optMoney('Discount'),
  booking_amount: optMoney('Booking amount'),
  down_payment: optMoney('Down payment'),
  down_payment_date: optDate('Down payment date'),
  plan: planSchema,
  receive_booking_amount: bool.default(true),
  payment: z.object({ method: method.default('CASH'), reference_no: optText, bank_name: optText, notes: optText }).optional(),
  sales_person: optText,
  notes: optText,
});

router.get('/', requirePerm('booking.view'), async (req, res) => {
  const p = []; const where = [];
  if (req.query.status) { p.push(req.query.status); where.push(`b.status = $${p.length}`); }
  if (req.query.society_id) { p.push(Number(req.query.society_id)); where.push(`pl.society_id = $${p.length}`); }
  if (req.query.overdue === '1') where.push('f.overdue_amount > 0');
  if (req.query.q) {
    p.push(`%${req.query.q}%`);
    where.push(`(b.booking_no ILIKE $${p.length} OR c.full_name ILIKE $${p.length} OR pl.plot_no ILIKE $${p.length} OR c.cnic ILIKE $${p.length} OR c.mobile ILIKE $${p.length})`);
  }
  const r = await pool.query(`
    SELECT b.id, b.booking_no, b.booking_date, b.status, b.plan_type, b.size_marla, b.rate_per_marla, b.total_price, b.discount, b.final_price,
      b.booking_amount, b.transfer_count, b.customer_id, c.full_name AS customer_name, c.customer_code, c.mobile, c.cnic,
      pl.id AS plot_id, pl.plot_no, bl.name AS block_name, s.name AS society_name, f.*
    FROM bookings b JOIN customers c ON c.id = b.customer_id JOIN plots pl ON pl.id = b.plot_id
    JOIN blocks bl ON bl.id = pl.block_id JOIN societies s ON s.id = pl.society_id JOIN v_booking_finance f ON f.booking_id = b.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.id DESC`, p);
  res.json(maskFor(req, r.rows));
});

async function loadBooking(id) {
  const b = (await pool.query(`
    SELECT b.*, f.paid, f.balance, f.overdue_amount, f.overdue_count, f.next_due_date, f.next_due_amount, f.paid_count, f.unpaid_count, f.total_count, f.charges_due,
      c.full_name AS customer_name, c.father_name AS customer_father_name, c.cnic AS customer_cnic, c.mobile AS customer_mobile, c.customer_code, c.address AS customer_address,
      oc.full_name AS original_customer_name,
      pl.plot_no, pl.street_no, pl.category, pl.is_corner, pl.is_main_road, pl.is_park_facing, pl.front_ft, pl.depth_ft, pl.status AS plot_status,
      bl.name AS block_name, s.name AS society_name, s.id AS society_id,
      cu.full_name AS created_by_name, xu.full_name AS cancelled_by_name
    FROM bookings b JOIN v_booking_finance f ON f.booking_id = b.id JOIN customers c ON c.id = b.customer_id
    JOIN customers oc ON oc.id = b.original_customer_id JOIN plots pl ON pl.id = b.plot_id JOIN blocks bl ON bl.id = pl.block_id
    JOIN societies s ON s.id = pl.society_id LEFT JOIN users cu ON cu.id = b.created_by LEFT JOIN users xu ON xu.id = b.cancelled_by
    WHERE b.id = $1`, [id])).rows[0];
  if (!b) throw notFound('Booking');
  return b;
}

router.get('/:id', requirePerm('booking.view'), async (req, res) => {
  const id = Number(req.params.id);
  const b = await loadBooking(id);
  const schedule = (await pool.query(`
    SELECT i.*, (SELECT COUNT(*)::int FROM charges ch WHERE ch.installment_id = i.id AND ch.charge_type='LATE_FEE' AND ch.status='ACTIVE') AS late_fee_posted
    FROM installments i WHERE booking_id=$1 ORDER BY due_date, seq_no`, [id])).rows;
  for (const row of schedule) row.suggested_late_fee = await svc.lateFeeFor(row);
  const payments = (await pool.query(`SELECT pm.*, c.full_name AS payer_name, u.full_name AS created_by_name FROM payments pm
    JOIN customers c ON c.id = pm.customer_id LEFT JOIN users u ON u.id = pm.created_by WHERE pm.booking_id=$1 ORDER BY pm.payment_date, pm.id`, [id])).rows;
  const charges = (await pool.query('SELECT * FROM v_charge_finance WHERE booking_id=$1 ORDER BY charge_date, id', [id])).rows;
  const transfers = (await pool.query(`SELECT t.*, fc.full_name AS from_name, tc.full_name AS to_name FROM transfers t
    JOIN customers fc ON fc.id=t.from_customer_id JOIN customers tc ON tc.id=t.to_customer_id WHERE t.booking_id=$1 ORDER BY t.id`, [id])).rows;
  const revisions = (await pool.query(`SELECT r.id, r.reason, r.created_at, u.full_name AS created_by_name, jsonb_array_length(r.old_schedule) AS old_rows,
    jsonb_array_length(r.new_schedule) AS new_rows FROM schedule_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE booking_id=$1 ORDER BY r.id DESC`, [id])).rows;
  const refunds = (await pool.query('SELECT * FROM refunds WHERE booking_id=$1', [id])).rows;
  const owners = (await pool.query(`SELECT o.*, c.full_name AS customer_name FROM ownership_history o JOIN customers c ON c.id=o.customer_id
    WHERE o.booking_id=$1 ORDER BY o.id`, [id])).rows;
  res.json(maskFor(req, { ...b, schedule, payments, charges, transfers, revisions, refunds, owners }));
});

router.post('/preview', requirePerm('booking.create'), async (req, res) => {
  const b = parse(bookingSchema.partial({ customer_id: true }), req.body);
  res.json(await svc.previewBooking(pool, b));
});

router.post('/', requirePerm('booking.create'), async (req, res) => {
  const b = parse(bookingSchema, req.body);
  const result = await withTx((c) => svc.createBooking(c, req, b));
  res.status(201).json(result);
});

router.put('/:id/schedule', requirePerm('schedule.edit'), async (req, res) => {
  const { rows, reason } = parse(z.object({
    reason: reqText('Reason for change'),
    rows: z.array(z.object({ kind: z.string().optional(), label: z.string().optional(), due_date: z.string(), amount: z.union([z.number(), z.string()]) })),
  }), req.body);
  await withTx((c) => svc.updateSchedule(c, req, Number(req.params.id), rows, reason));
  res.json({ ok: true });
});

router.post('/:id/cancel', requirePerm('booking.cancel'), async (req, res) => {
  const x = parse(z.object({
    reason: reqText('Reason for cancellation'),
    refund_amount: optMoney('Refund amount'),
    refund_method: method.optional(),
    refund_reference: optText,
    refund_date: optDate('Refund date'),
  }), req.body);
  res.json(await withTx((c) => svc.cancelBooking(c, req, Number(req.params.id), x)));
});

router.post('/:id/charges', requirePerm('charge.manage'), async (req, res) => {
  const x = parse(z.object({
    charge_type: z.enum(['LATE_FEE', 'OTHER']),
    amount: money('Charge amount').refine((v) => v > 0, 'Charge amount must be greater than 0'),
    description: reqText('Description'),
    charge_date: optDate('Charge date'),
    installment_id: optId,
  }), req.body);
  res.status(201).json(await withTx((c) => svc.addCharge(c, req, Number(req.params.id), x)));
});

router.post('/charges/:chargeId/waive', requirePerm('charge.manage'), async (req, res) => {
  const { reason } = parse(z.object({ reason: reqText('Reason') }), req.body);
  await withTx((c) => svc.waiveCharge(c, req, Number(req.params.chargeId), reason));
  res.json({ ok: true });
});

router.get('/:id/confirmation.pdf', requirePerm('booking.view'), async (req, res) => {
  const id = Number(req.params.id);
  const b = maskFor(req, await loadBooking(id));
  const schedule = (await pool.query('SELECT * FROM installments WHERE booking_id=$1 ORDER BY due_date, seq_no', [id])).rows;
  await pdf.sendPdf(res, `Booking-${b.booking_no}.pdf`, (doc, ctx) => pdf.bookingConfirmation(doc, ctx, b, schedule), req.query.download);
});

module.exports = router;
