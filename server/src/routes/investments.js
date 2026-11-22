'use strict';
// Personal investment (capital contributions) and customer-money availability for land payments.
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { maskFor } = require('../lib/mask');
const { toPaisa, fromPaisa } = require('../lib/money');
const svc = require('../services/landService');
const { z, parse, reqText, optText, money, date, method } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');

router.get('/', requirePerm('investment.view', 'land.pay'), async (req, res) => {
  const r = await pool.query(`
    SELECT v.*, lp.payment_no AS made_with_payment, e.expense_no AS made_with_expense, u.full_name AS entered_by_name,
      (SELECT string_agg(DISTINCT COALESCE(x.payment_no, ee.expense_no) || ' (' || l.land_code || ')', ', ')
         FROM fund_allocations a LEFT JOIN land_payments x ON x.id = a.land_payment_id LEFT JOIN expenses ee ON ee.id = a.expense_id
         JOIN lands l ON l.id = a.land_id WHERE a.capital_id = v.id AND a.status = 'ACTIVE') AS used_for
    FROM v_capital_balance v LEFT JOIN land_payments lp ON lp.id = v.source_land_payment_id
    LEFT JOIN expenses e ON e.id = v.source_expense_id LEFT JOIN users u ON u.id = v.created_by
    ORDER BY v.contribution_date DESC, v.id DESC`);
  res.json(r.rows);
});

router.get('/summary', requirePerm('investment.view', 'land.pay'), async (_req, res) => {
  res.json(await svc.investmentSummary(pool));
});

// Customer receipts with money not yet used for land (for the "customer money" payment source).
router.get('/customer-funds', requirePerm('land.pay'), async (req, res) => {
  const p = []; const where = ["f.status = 'VALID'", 'f.available > 0'];
  if (req.query.customer_id) { p.push(Number(req.query.customer_id)); where.push(`f.customer_id = $${p.length}`); }
  if (req.query.booking_id) { p.push(Number(req.query.booking_id)); where.push(`f.booking_id = $${p.length}`); }
  const rows = (await pool.query(`
    SELECT f.*, c.full_name AS customer_name, c.customer_code, b.booking_no, b.status AS booking_status, b.refund_amount, pl.plot_no, bl.name AS block_name
    FROM v_receipt_funds f JOIN customers c ON c.id = f.customer_id JOIN bookings b ON b.id = f.booking_id
    JOIN plots pl ON pl.id = f.plot_id JOIN blocks bl ON bl.id = pl.block_id
    WHERE ${where.join(' AND ')} ORDER BY f.payment_date, f.payment_id`, p)).rows;
  // Cancelled bookings: refunded money is not available (taken from the oldest receipts first).
  const refundLeft = {};
  for (const r of rows) {
    if (r.booking_status !== 'CANCELLED') continue;
    // Same rule as when the money is used: available on the booking = paid - already used - refunded.
    if (refundLeft[r.booking_id] === undefined) refundLeft[r.booking_id] = toPaisa(r.refund_amount);
    const take = Math.min(refundLeft[r.booking_id], toPaisa(r.available));
    refundLeft[r.booking_id] -= take;
    r.available = fromPaisa(toPaisa(r.available) - take);
  }
  res.json(maskFor(req, rows.filter((r) => toPaisa(r.available) > 0)));
});

router.post('/', requirePerm('investment.manage'), async (req, res) => {
  const b = parse(z.object({
    investor_name: reqText('Investor name'),
    contribution_date: date('Investment date'),
    amount: money('Investment amount').refine((v) => v > 0, 'Investment amount must be greater than 0'),
    method,
    reference_no: optText,
    notes: optText,
  }), req.body);
  res.status(201).json(await withTx((c) => svc.createInvestment(c, req, b)));
});

router.post('/:id/reverse', requirePerm('land.reverse'), async (req, res) => {
  const { reason } = parse(z.object({ reason: reqText('Reason for reversal') }), req.body);
  await withTx((c) => svc.reverseInvestment(c, req, Number(req.params.id), reason));
  res.json({ ok: true });
});

module.exports = router;
