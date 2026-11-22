'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { maskFor } = require('../lib/mask');
const { notFound } = require('../lib/errors');
const { createTransfer, duesCheck } = require('../services/transferService');
const pdf = require('../lib/pdf');
const { z, parse, intId, optMoney, date, optText, method, bool } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id', 'bookingId');

const SQL = `
  SELECT t.*, pl.plot_no, pl.street_no, pl.size_marla, bl.name AS block_name, s.name AS society_name, b.booking_no,
    fc.full_name AS from_name, fc.father_name AS from_father_name, fc.cnic AS from_cnic, fc.mobile AS from_mobile, fc.address AS from_address, fc.customer_code AS from_code,
    tc.full_name AS to_name, tc.father_name AS to_father_name, tc.cnic AS to_cnic, tc.mobile AS to_mobile, tc.address AS to_address, tc.customer_code AS to_code,
    u.full_name AS approved_by_name
  FROM transfers t JOIN plots pl ON pl.id = t.plot_id JOIN blocks bl ON bl.id = pl.block_id JOIN societies s ON s.id = pl.society_id
  JOIN bookings b ON b.id = t.booking_id JOIN customers fc ON fc.id = t.from_customer_id JOIN customers tc ON tc.id = t.to_customer_id
  LEFT JOIN users u ON u.id = t.approved_by`;

router.get('/', requirePerm('transfer.view'), async (req, res) => {
  const p = []; let where = '';
  if (req.query.q) { p.push(`%${req.query.q}%`); where = 'WHERE (t.transfer_no ILIKE $1 OR fc.full_name ILIKE $1 OR tc.full_name ILIKE $1 OR pl.plot_no ILIKE $1)'; }
  res.json(maskFor(req, (await pool.query(`${SQL} ${where} ORDER BY t.id DESC`, p)).rows));
});

router.get('/check/:bookingId', requirePerm('transfer.view'), async (req, res) => {
  res.json(await duesCheck(pool, Number(req.params.bookingId)));
});

router.get('/:id', requirePerm('transfer.view'), async (req, res) => {
  const t = (await pool.query(`${SQL} WHERE t.id=$1`, [Number(req.params.id)])).rows[0];
  if (!t) throw notFound('Transfer');
  res.json(maskFor(req, t));
});

router.post('/', requirePerm('transfer.create'), async (req, res) => {
  const x = parse(z.object({
    booking_id: intId('Plot / booking'),
    to_customer_id: intId('New owner'),
    transfer_date: date('Transfer date'),
    transfer_fee: optMoney('Transfer fee'),
    fee_paid_by: z.enum(['FROM', 'TO']).default('FROM'),
    fee_paid_now: bool,
    fee_method: method.optional(),
    fee_reference: optText,
    override_dues: bool,
    override_reason: optText,
    witness_1: optText, witness_2: optText, notes: optText,
  }), req.body);
  res.status(201).json(await withTx((c) => createTransfer(c, req, x)));
});

router.get('/:id/letter.pdf', requirePerm('transfer.view'), async (req, res) => {
  const t = (await pool.query(`${SQL} WHERE t.id=$1`, [Number(req.params.id)])).rows[0];
  if (!t) throw notFound('Transfer');
  await pdf.sendPdf(res, `Transfer-${t.transfer_no}.pdf`, (doc, ctx) => pdf.transferLetter(doc, ctx, maskFor(req, t)), req.query.download);
});

module.exports = router;
