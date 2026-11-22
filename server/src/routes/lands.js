'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { maskFor } = require('../lib/mask');
const { notFound } = require('../lib/errors');
const svc = require('../services/landService');
const { z, parse, reqText, optText, optMoney, money, optNumber, optDate, date, optCnic, phone, method, bool, optId } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id', 'paymentId');

router.get('/', requirePerm('land.view', 'society.edit'), async (req, res) => {
  const where = req.query.include_archived === '1' ? '' : "WHERE l.status = 'ACTIVE'";
  res.json(maskFor(req, (await pool.query(`${svc.LAND_LIST_SQL} ${where} ORDER BY l.id DESC`)).rows));
});

router.get('/summary', requirePerm('land.view'), async (_req, res) => {
  res.json(await svc.landSummary(pool));
});

router.get('/:id', requirePerm('land.view'), async (req, res) => {
  const id = Number(req.params.id);
  const land = (await pool.query(`${svc.LAND_LIST_SQL} WHERE l.id = $1`, [id])).rows[0];
  if (!land) throw notFound('Land');
  const societies = (await pool.query('SELECT id, name, code, status FROM societies WHERE land_id = $1 ORDER BY name', [id])).rows;
  const payments = (await pool.query(`SELECT lp.*, u.full_name AS entered_by_name FROM land_payments lp LEFT JOIN users u ON u.id = lp.created_by
    WHERE lp.land_id = $1 ORDER BY lp.payment_date DESC, lp.id DESC`, [id])).rows;
  const expenses = (await pool.query(
    `SELECT e.id, e.expense_no, e.expense_date, e.description, e.amount, e.method, e.status, e.paid_to, e.reference_no, c.name AS category, c.cost_type,
       u.full_name AS entered_by_name
     FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN users u ON u.id = e.created_by
     WHERE e.land_id = $1 ORDER BY e.expense_date DESC, e.id DESC`, [id])).rows;
  const payFund = await svc.fundingText(pool, 'land_payment_id', payments.map((p) => p.id));
  const expFund = await svc.fundingText(pool, 'expense_id', expenses.map((e) => e.id));
  const payDet = await svc.fundingText(pool, 'land_payment_id', payments.map((p) => p.id), { detail: true });
  const expDet = await svc.fundingText(pool, 'expense_id', expenses.map((e) => e.id), { detail: true });
  payments.forEach((p) => { p.funding = payFund[p.id] || 'Not recorded'; p.funding_detail = payDet[p.id] || []; });
  expenses.forEach((e) => { e.funding = expFund[e.id] || 'Not recorded (entered before upgrade)'; e.funding_detail = expDet[e.id] || []; });
  const adjustments = (await pool.query(`SELECT a.*, u.full_name AS by_name FROM land_price_adjustments a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.land_id = $1 ORDER BY a.id DESC`, [id])).rows;
  res.json(maskFor(req, { ...land, societies, payments, expenses, adjustments }));
});

router.get('/:id/ledger', requirePerm('land.view'), async (req, res) => {
  res.json(maskFor(req, await svc.landLedger(pool, Number(req.params.id))));
});

const expenseRow = z.object({
  description: reqText('Expense description'),
  amount: money('Expense amount').refine((v) => v > 0, 'Expense amount must be greater than 0'),
  expense_date: optDate('Expense date'),
  method: method.default('CASH'),
  reference_no: optText,
  paid_to: optText,
  investor_name: optText,
  category_id: optId,
  sources: z.array(z.any()).optional(),
});
const landSchema = z.object({
  name: optText,
  seller_name: reqText('Original land owner name'),
  seller_father_name: optText,
  seller_mobile: phone('Owner contact number'),
  seller_cnic: optCnic('Owner CNIC'),
  seller_address: optText,
  location: optText,
  area_kanal: optNumber('Kanal'),
  area_marla: optNumber('Marla'),
  area_sqft: optNumber('Additional square feet'),
  marla_sqft: optNumber('Marla square feet'),
  kanal_marla: optNumber('Marla per Kanal'),
  saleable_marla: optNumber('Saleable area'),
  purchase_date: optDate('Purchase date'),
  rate_per_marla: money('Purchase rate per Marla'),
  manual_price: bool,
  purchase_price: optMoney('Total purchase price'),
  price_adjust_reason: optText,
  purchased_by: optText,
  agreement_details: optText,
  registry_details: optText,
  owner_name: optText, ownership_details: optText,
  registry_no: optText, registry_date: optDate('Registry date'), mutation_no: optText, mutation_date: optDate('Mutation date'),
  khasra_no: optText, khewat_no: optText, notes: optText,
  expenses: z.array(expenseRow).max(30).optional(),
});

router.post('/', requirePerm('land.edit'), async (req, res) => {
  const b = parse(landSchema, req.body);
  const land = await withTx((c) => svc.createLand(c, req, b));
  res.status(201).json(land);
});

router.put('/:id', requirePerm('land.edit'), async (req, res) => {
  const b = parse(landSchema.omit({ expenses: true }), req.body);
  res.json(await withTx((c) => svc.updateLand(c, req, Number(req.params.id), b)));
});

router.post('/:id/status', requirePerm('land.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  await withTx(async (c) => {
    const r = await c.query('UPDATE lands SET status=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING land_code', [id, status, req.user.id]);
    if (!r.rowCount) throw notFound('Land');
    await audit(c, req, { action: 'UPDATE', entity: 'land', entityId: id, summary: `Land ${r.rows[0].land_code} ${status === 'ARCHIVED' ? 'archived' : 'restored'}` });
  });
  res.json({ ok: true });
});

const sourceSchema = z.object({
  type: z.enum(['PERSONAL_NEW', 'PERSONAL_EXISTING', 'CUSTOMER'], { errorMap: () => ({ message: 'Choose the payment source' }) }),
  amount: money('Source amount'),
  investor_name: optText,
  investment_date: optDate('Investment date'),
  method: method.optional(),
  reference_no: optText,
  notes: optText,
  capital_id: optId,
  payment_id: optId,
  customer_id: optId,
  booking_id: optId,
});

router.post('/:id/payments', requirePerm('land.pay'), async (req, res) => {
  const b = parse(z.object({
    amount: money('Payment amount').refine((v) => v > 0, 'Payment amount must be greater than 0'),
    payment_date: date('Payment date'),
    method,
    reference_no: optText,
    description: optText,
    additional: bool,
    authorization_note: optText,
    sources: z.array(sourceSchema).min(1, 'Select the payment source'),
  }), req.body);
  res.status(201).json(await withTx((c) => svc.payLandOwner(c, req, Number(req.params.id), b)));
});

router.post('/payments/:paymentId/reverse', requirePerm('land.reverse'), async (req, res) => {
  const b = parse(z.object({ reason: reqText('Reason for reversal'), reverse_new_investments: bool.default(true) }),
    { reverse_new_investments: true, ...req.body });
  res.json(await withTx((c) => svc.reverseLandPayment(c, req, Number(req.params.paymentId), b)));
});

router.post('/:id/expenses', requirePerm('land.pay'), async (req, res) => {
  const b = parse(expenseRow.extend({ expense_date: date('Expense date'), sources: z.array(sourceSchema).min(1, 'Select the payment source') }), req.body);
  res.status(201).json(await withTx((c) => svc.createLandExpense(c, req, Number(req.params.id), b)));
});

module.exports = router;
