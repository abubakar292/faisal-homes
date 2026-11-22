'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { nextNumber } = require('../lib/counters');
const { formatPKR } = require('../lib/money');
const { today } = require('../lib/dates');
const { notFound, badRequest, conflict } = require('../lib/errors');
const { z, parse, intId, money, date, optText, reqText, method, optId } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');

const SQL = `SELECT e.*, c.name AS category_name, c.cost_type, l.name AS land_name, s.name AS society_name, u.full_name AS entered_by_name,
    xu.full_name AS cancelled_by_name,
    (SELECT COUNT(*)::int FROM documents d WHERE d.entity_type='EXPENSE' AND d.entity_id=e.id AND NOT d.is_deleted) AS attachment_count
  FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN lands l ON l.id = e.land_id
  LEFT JOIN societies s ON s.id = e.society_id LEFT JOIN users u ON u.id = e.created_by LEFT JOIN users xu ON xu.id = e.cancelled_by`;

router.get('/categories', requirePerm('expense.view', 'land.view'), async (_req, res) => {
  res.json((await pool.query('SELECT * FROM expense_categories ORDER BY sort_order, name')).rows);
});

router.get('/', requirePerm('expense.view'), async (req, res) => {
  const q = req.query; const p = []; const where = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace(/\?/g, `$${p.length}`)); };
  if (q.from) add('e.expense_date >= ?', q.from);
  if (q.to) add('e.expense_date <= ?', q.to);
  if (q.category_id) add('e.category_id = ?', Number(q.category_id));
  if (q.status) add('e.status = ?', q.status);
  if (q.land_id) add('e.land_id = ?', Number(q.land_id));
  if (q.q) add('(e.description ILIKE ? OR e.expense_no ILIKE ? OR e.paid_to ILIKE ? OR e.reference_no ILIKE ?)', `%${q.q}%`);
  res.json((await pool.query(`${SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.expense_date DESC, e.id DESC`, p)).rows);
});

router.get('/:id', requirePerm('expense.view'), async (req, res) => {
  const r = (await pool.query(`${SQL} WHERE e.id=$1`, [Number(req.params.id)])).rows[0];
  if (!r) throw notFound('Expense');
  res.json(r);
});

const base = {
  category_id: intId('Category'), description: reqText('Description'), paid_to: optText, reference_no: optText,
  land_id: optId, society_id: optId,
};
router.post('/', requirePerm('expense.edit'), async (req, res) => {
  const b = parse(z.object({ ...base, expense_date: date('Date'), amount: money('Amount').refine((v) => v > 0, 'Amount must be greater than 0'), method }), req.body);
  if (b.expense_date > today()) throw badRequest('Expense date cannot be in the future');
  if (b.method === 'CHEQUE' && !b.reference_no) throw badRequest('Enter the cheque number in the reference field');
  const row = await withTx(async (c) => {
    const cat = (await c.query('SELECT * FROM expense_categories WHERE id=$1', [b.category_id])).rows[0];
    if (!cat || !cat.is_active) throw badRequest('Select a valid category');
    if (cat.cost_type === 'LAND_PAYMENT' && !b.land_id) throw badRequest('Select the land this payment is for');
    const no = await nextNumber(c, 'expense');
    const e = (await c.query(`INSERT INTO expenses (expense_no, expense_date, category_id, description, amount, method, reference_no, paid_to, land_id, society_id, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
    [no, b.expense_date, b.category_id, b.description, b.amount, b.method, b.reference_no, b.paid_to, b.land_id, b.society_id, req.user.id])).rows[0];
    await c.query(`INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, description, created_by)
      VALUES ($1,'EXPENSE_PAID','OUT',$2,$3,'expense',$4,$5,$6,$7)`, [e.expense_date, e.amount, e.method, e.id, no, `${cat.name}: ${e.description}`, req.user.id]);
    await audit(c, req, { action: 'CREATE', entity: 'expense', entityId: e.id, summary: `Expense ${no}: ${formatPKR(e.amount)} ${cat.name} - ${e.description}`, after: e });
    return e;
  });
  res.status(201).json(row);
});

// Amount, date and method are financial facts: to change them, cancel and re-enter. Other details can be corrected.
router.put('/:id', requirePerm('expense.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object(base), req.body);
  const row = await withTx(async (c) => {
    const before = (await c.query('SELECT * FROM expenses WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!before) throw notFound('Expense');
    if (before.status !== 'ACTIVE') throw conflict('Cancelled expenses cannot be edited');
    const cat = (await c.query('SELECT * FROM expense_categories WHERE id=$1', [b.category_id])).rows[0];
    if (!cat) throw badRequest('Select a valid category');
    if (cat.cost_type === 'LAND_PAYMENT' && !b.land_id) throw badRequest('Select the land this payment is for');
    const e = (await c.query(`UPDATE expenses SET category_id=$2, description=$3, paid_to=$4, reference_no=$5, land_id=$6, society_id=$7, updated_by=$8, updated_at=now()
      WHERE id=$1 RETURNING *`, [id, b.category_id, b.description, b.paid_to, b.reference_no, b.land_id, b.society_id, req.user.id])).rows[0];
    await audit(c, req, { action: 'UPDATE', entity: 'expense', entityId: id, summary: `Expense ${e.expense_no} details updated`, before, after: e });
    return e;
  });
  res.json(row);
});

router.post('/:id/cancel', requirePerm('expense.cancel'), async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = parse(z.object({ reason: reqText('Reason') }), req.body);
  await withTx(async (c) => {
    const e = (await c.query('SELECT * FROM expenses WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!e) throw notFound('Expense');
    if (e.status !== 'ACTIVE') throw conflict('This expense is already cancelled');
    await c.query(`UPDATE expenses SET status='CANCELLED', cancel_reason=$2, cancelled_at=now(), cancelled_by=$3 WHERE id=$1`, [id, reason, req.user.id]);
    // Land expenses: release the personal investment / customer money that funded it (it stays in the business).
    await c.query(`UPDATE fund_allocations SET status='REVERSED', reversed_at=now(), reversed_by=$2, reversal_reason=$3
      WHERE expense_id=$1 AND status='ACTIVE'`, [id, req.user.id, `Expense ${e.expense_no} cancelled: ${reason}`]);
    await c.query(`INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, description, created_by)
      VALUES ($1,'EXPENSE_CANCELLED','IN',$2,$3,'expense',$4,$5,$6,$7)`, [today(), e.amount, e.method, e.id, e.expense_no, `Cancellation of ${e.expense_no}: ${reason}`, req.user.id]);
    await audit(c, req, { action: 'CANCEL', entity: 'expense', entityId: id, summary: `Expense ${e.expense_no} (${formatPKR(e.amount)}) cancelled: ${reason}`, before: e });
  });
  res.json({ ok: true });
});

module.exports = router;
