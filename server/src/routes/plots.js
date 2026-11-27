'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { maskFor } = require('../lib/mask');
const { notFound, badRequest, conflict } = require('../lib/errors');
const { z, parse, reqText, optText, money, optMoney, optNumber, positiveNumber, intId, optId, optDate, bool } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');

const LIST_SQL = `
  SELECT p.*, b.name AS block_name, s.name AS society_name,
    bk.booking_no, bk.final_price, c.id AS customer_id, c.full_name AS customer_name, c.customer_code,
    f.paid, f.balance, f.overdue_amount,
    rc.full_name AS reserved_customer_name
  FROM plots p
  JOIN blocks b ON b.id = p.block_id
  JOIN societies s ON s.id = p.society_id
  LEFT JOIN bookings bk ON bk.id = p.current_booking_id
  LEFT JOIN customers c ON c.id = bk.customer_id
  LEFT JOIN v_booking_finance f ON f.booking_id = bk.id
  LEFT JOIN customers rc ON rc.id = p.reserved_customer_id`;

router.get('/', requirePerm('plot.view'), async (req, res) => {
  const q = req.query; const where = []; const p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (q.society_id) add('p.society_id = ?', Number(q.society_id));
  if (q.block_id) add('p.block_id = ?', Number(q.block_id));
  if (q.status) add('p.status = ANY(?)', String(q.status).split(','));
  if (q.size) add('p.size_marla = ?', Number(q.size));
  if (q.category) add('p.category = ?', q.category);
  if (q.min_price) add('(p.list_price - p.discount) >= ?', Number(q.min_price));
  if (q.max_price) add('(p.list_price - p.discount) <= ?', Number(q.max_price));
  if (q.corner === '1') where.push('p.is_corner');
  if (q.main_road === '1') where.push('p.is_main_road');
  if (q.park === '1') where.push('p.is_park_facing');
  if (q.q) add("(p.plot_no ILIKE ? OR c.full_name ILIKE $X OR p.street_no ILIKE $X)".replace(/\$X/g, `$${p.length + 1}`), `%${q.q}%`);
  const r = await pool.query(`${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.name, b.sort_order, b.name, NULLIF(regexp_replace(p.plot_no, '\\D', '', 'g'), '')::numeric NULLS LAST, p.plot_no`, p);
  res.json(r.rows);
});

router.get('/sizes', requirePerm('plot.view'), async (_req, res) => {
  res.json((await pool.query(`SELECT DISTINCT size_marla FROM plots ORDER BY size_marla`)).rows.map((r) => r.size_marla));
});

router.get('/map', requirePerm('plot.view'), async (req, res) => {
  const sid = Number(req.query.society_id);
  if (!sid) throw badRequest('Select a society');
  const blocks = (await pool.query('SELECT id, name FROM blocks WHERE society_id=$1 ORDER BY sort_order, name', [sid])).rows;
  const plots = (await pool.query(`
    SELECT p.id, p.block_id, p.plot_no, p.street_no, p.size_marla, p.status, p.category, p.is_corner, p.is_main_road, p.is_park_facing,
      p.list_price, p.discount, p.price_per_marla, c.full_name AS customer_name, bk.booking_no, f.balance
    FROM plots p LEFT JOIN bookings bk ON bk.id = p.current_booking_id LEFT JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN v_booking_finance f ON f.booking_id = bk.id
    WHERE p.society_id = $1
    ORDER BY NULLIF(regexp_replace(p.plot_no, '\\D', '', 'g'), '')::numeric NULLS LAST, p.plot_no`, [sid])).rows;
  res.json({ blocks, plots });
});

router.get('/:id', requirePerm('plot.view'), async (req, res) => {
  const id = Number(req.params.id);
  const plot = (await pool.query(`${LIST_SQL} WHERE p.id = $1`, [id])).rows[0];
  if (!plot) throw notFound('Plot');
  const bookings = (await pool.query(`
    SELECT bk.id, bk.booking_no, bk.booking_date, bk.final_price, bk.status, bk.plan_type, bk.cancel_reason, bk.refund_amount,
      c.full_name AS customer_name, c.id AS customer_id, f.paid, f.balance
    FROM bookings bk JOIN customers c ON c.id = bk.customer_id LEFT JOIN v_booking_finance f ON f.booking_id = bk.id
    WHERE bk.plot_id = $1 ORDER BY bk.id DESC`, [id])).rows;
  const owners = (await pool.query(`
    SELECT o.*, c.full_name AS customer_name, c.customer_code, c.cnic, bk.booking_no, t.transfer_no
    FROM ownership_history o JOIN customers c ON c.id = o.customer_id JOIN bookings bk ON bk.id = o.booking_id
    LEFT JOIN transfers t ON t.id = o.transfer_id WHERE o.plot_id = $1 ORDER BY o.start_date, o.id`, [id])).rows;
  res.json(maskFor(req, { ...plot, bookings, owners }));
});

const plotSchema = z.object({
  society_id: intId('Society'),
  block_id: intId('Block'),
  plot_no: reqText('Plot number'),
  street_no: optText,
  size_marla: positiveNumber('Plot size (Marla)'),
  front_ft: optNumber('Front'),
  depth_ft: optNumber('Depth'),
  category: z.enum(['RESIDENTIAL', 'COMMERCIAL']).default('RESIDENTIAL'),
  is_corner: bool, is_main_road: bool, is_park_facing: bool,
  location_note: optText,
  price_per_marla: optMoney('Price per Marla'),
  discount: optMoney('Discount'),
  // The Add/Edit plot form sends the offer discount per Marla; the total is worked out from the plot size.
  discount_per_marla: z.union([money('Offer discount per Marla'), z.null(), z.literal('')]).optional(),
  notes: optText,
});

async function checkBlock(c, societyId, blockId) {
  const r = await c.query('SELECT 1 FROM blocks WHERE id=$1 AND society_id=$2', [blockId, societyId]);
  if (!r.rowCount) throw badRequest('The selected block does not belong to this society');
}
function checkDiscount(b) {
  if (b.discount_per_marla !== undefined) {
    const perMarla = Number(b.discount_per_marla) || 0;
    if (perMarla > b.price_per_marla) throw badRequest('Offer discount per Marla cannot be more than the price per Marla');
    b.discount = Math.round(b.size_marla * Math.round(perMarla * 100)) / 100;
  }
  const list = Math.round(b.size_marla * b.price_per_marla * 100);
  if (Math.round(b.discount * 100) > list) throw badRequest('Discount cannot be more than the plot price');
  if (b.size_marla > 100000) throw badRequest('Plot size is too large');
}

router.post('/', requirePerm('plot.edit'), async (req, res) => {
  const b = parse(plotSchema, req.body);
  checkDiscount(b);
  const row = await withTx(async (c) => {
    await checkBlock(c, b.society_id, b.block_id);
    const r = (await c.query(
      `INSERT INTO plots (society_id, block_id, plot_no, street_no, size_marla, front_ft, depth_ft, category, is_corner, is_main_road, is_park_facing,
        location_note, price_per_marla, discount, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING *`,
      [b.society_id, b.block_id, b.plot_no, b.street_no, b.size_marla, b.front_ft, b.depth_ft, b.category, b.is_corner, b.is_main_road,
        b.is_park_facing, b.location_note, b.price_per_marla, b.discount, b.notes, req.user.id])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'plot', entityId: r.id, summary: `Plot ${r.plot_no} added (${Number(r.size_marla)} Marla)`, after: r });
    return r;
  });
  res.status(201).json(row);
});

// Bulk generation: e.g. prefix "A-", start 1, count 50 => A-1 ... A-50
router.post('/bulk', requirePerm('plot.edit'), async (req, res) => {
  const b = parse(z.object({
    society_id: intId('Society'), block_id: intId('Block'),
    prefix: z.string().trim().max(20).optional().default(''),
    suffix: z.string().trim().max(20).optional().default(''),
    start_no: z.coerce.number().int().min(0, 'Start number is invalid'),
    count: z.coerce.number().int().min(1, 'Enter how many plots to create').max(1000, 'Maximum 1000 plots at a time'),
    street_no: optText,
    size_marla: positiveNumber('Plot size (Marla)'),
    front_ft: optNumber('Front'), depth_ft: optNumber('Depth'),
    category: z.enum(['RESIDENTIAL', 'COMMERCIAL']).default('RESIDENTIAL'),
    price_per_marla: optMoney('Price per Marla'),
    is_corner: bool, is_main_road: bool, is_park_facing: bool,
  }), req.body);
  const nos = Array.from({ length: b.count }, (_, i) => `${b.prefix}${b.start_no + i}${b.suffix}`);
  const result = await withTx(async (c) => {
    await checkBlock(c, b.society_id, b.block_id);
    const existing = (await c.query('SELECT plot_no FROM plots WHERE block_id=$1 AND lower(plot_no) = ANY($2)', [b.block_id, nos.map((x) => x.toLowerCase())])).rows;
    if (existing.length) throw conflict(`These plot numbers already exist in this block: ${existing.slice(0, 15).map((x) => x.plot_no).join(', ')}${existing.length > 15 ? '…' : ''}`);
    const r = await c.query(
      `INSERT INTO plots (society_id, block_id, plot_no, street_no, size_marla, front_ft, depth_ft, category, price_per_marla,
          is_corner, is_main_road, is_park_facing, created_by, updated_by)
       SELECT $1, $2, x, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13 FROM unnest($3::text[]) AS x RETURNING id`,
      [b.society_id, b.block_id, nos, b.street_no, b.size_marla, b.front_ft, b.depth_ft, b.category, b.price_per_marla,
        b.is_corner, b.is_main_road, b.is_park_facing, req.user.id]);
    await audit(c, req, { action: 'CREATE', entity: 'plot', entityId: `bulk:${b.block_id}`, summary: `${r.rowCount} plots created in bulk (${nos[0]} to ${nos[nos.length - 1]}, ${b.size_marla} Marla)`, after: { ...b, plot_numbers: nos } });
    return { created: r.rowCount, first: nos[0], last: nos[nos.length - 1] };
  });
  res.status(201).json(result);
});

router.put('/:id', requirePerm('plot.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(plotSchema, req.body);
  checkDiscount(b);
  const row = await withTx(async (c) => {
    const before = (await c.query('SELECT * FROM plots WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!before) throw notFound('Plot');
    await checkBlock(c, b.society_id, b.block_id);
    const hasBooking = !!before.current_booking_id;
    if (hasBooking && (Number(before.size_marla) !== b.size_marla || before.society_id !== b.society_id)) {
      throw badRequest('This plot has an active booking. Its size and society cannot be changed. Cancel the booking first if this is a correction.');
    }
    const r = (await c.query(
      `UPDATE plots SET society_id=$2, block_id=$3, plot_no=$4, street_no=$5, size_marla=$6, front_ft=$7, depth_ft=$8, category=$9,
        is_corner=$10, is_main_road=$11, is_park_facing=$12, location_note=$13, price_per_marla=$14, discount=$15, notes=$16,
        updated_by=$17, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, b.society_id, b.block_id, b.plot_no, b.street_no, b.size_marla, b.front_ft, b.depth_ft, b.category, b.is_corner, b.is_main_road,
        b.is_park_facing, b.location_note, b.price_per_marla, b.discount, b.notes, req.user.id])).rows[0];
    await audit(c, req, { action: 'UPDATE', entity: 'plot', entityId: id, summary: `Plot ${r.plot_no} updated`, before, after: r });
    return r;
  });
  res.json(row);
});

// ----- status actions
async function lockPlot(c, id) {
  const p = (await c.query('SELECT * FROM plots WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!p) throw notFound('Plot');
  return p;
}

router.post('/:id/reserve', requirePerm('plot.reserve'), async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ reserved_for: optText, customer_id: optId, reserved_until: optDate('Reserved until'), note: optText }), req.body);
  if (!b.reserved_for && !b.customer_id) throw badRequest('Enter who the plot is reserved for');
  await withTx(async (c) => {
    const p = await lockPlot(c, id);
    if (p.status !== 'AVAILABLE') throw conflict(`Only available plots can be reserved (this plot is ${p.status})`);
    let name = b.reserved_for;
    if (b.customer_id) {
      const cu = (await c.query('SELECT full_name FROM customers WHERE id=$1', [b.customer_id])).rows[0];
      if (!cu) throw notFound('Customer');
      name = name || cu.full_name;
    }
    await c.query(`UPDATE plots SET status='RESERVED', reserved_for=$2, reserved_customer_id=$3, reserved_until=$4, reserved_by=$5, status_note=$6,
      updated_at=now(), updated_by=$5 WHERE id=$1`, [id, name, b.customer_id, b.reserved_until, req.user.id, b.note]);
    await audit(c, req, { action: 'UPDATE', entity: 'plot', entityId: id, summary: `Plot ${p.plot_no} reserved for ${name}${b.reserved_until ? ` until ${b.reserved_until}` : ''}` });
  });
  res.json({ ok: true });
});

router.post('/:id/release', requirePerm('plot.reserve'), async (req, res) => {
  const id = Number(req.params.id);
  await withTx(async (c) => {
    const p = await lockPlot(c, id);
    if (p.status !== 'RESERVED') throw conflict('This plot is not reserved');
    await c.query(`UPDATE plots SET status='AVAILABLE', reserved_for=NULL, reserved_customer_id=NULL, reserved_until=NULL, reserved_by=NULL,
      status_note=NULL, updated_at=now(), updated_by=$2 WHERE id=$1`, [id, req.user.id]);
    await audit(c, req, { action: 'UPDATE', entity: 'plot', entityId: id, summary: `Reservation of plot ${p.plot_no} released (was for ${p.reserved_for})` });
  });
  res.json({ ok: true });
});

router.post('/:id/withdraw', requirePerm('plot.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = parse(z.object({ reason: reqText('Reason') }), req.body);
  await withTx(async (c) => {
    const p = await lockPlot(c, id);
    if (!['AVAILABLE', 'RESERVED'].includes(p.status)) throw conflict('Only available or reserved plots can be withdrawn from sale');
    await c.query(`UPDATE plots SET status='CANCELLED', status_note=$2, reserved_for=NULL, reserved_customer_id=NULL, reserved_until=NULL,
      updated_at=now(), updated_by=$3 WHERE id=$1`, [id, reason, req.user.id]);
    await audit(c, req, { action: 'CANCEL', entity: 'plot', entityId: id, summary: `Plot ${p.plot_no} withdrawn from sale: ${reason}` });
  });
  res.json({ ok: true });
});

router.post('/:id/restore', requirePerm('plot.edit'), async (req, res) => {
  const id = Number(req.params.id);
  await withTx(async (c) => {
    const p = await lockPlot(c, id);
    if (p.status !== 'CANCELLED') throw conflict('This plot is not withdrawn');
    await c.query(`UPDATE plots SET status='AVAILABLE', status_note=NULL, updated_at=now(), updated_by=$2 WHERE id=$1`, [id, req.user.id]);
    await audit(c, req, { action: 'UPDATE', entity: 'plot', entityId: id, summary: `Plot ${p.plot_no} returned to sale` });
  });
  res.json({ ok: true });
});

// Hard delete is only allowed for plots that never had any booking (e.g. a typo during bulk creation).
router.delete('/:id', requirePerm('plot.edit'), async (req, res) => {
  const id = Number(req.params.id);
  await withTx(async (c) => {
    const p = await lockPlot(c, id);
    const used = (await c.query('SELECT COUNT(*)::int AS n FROM bookings WHERE plot_id=$1', [id])).rows[0].n;
    if (used || !['AVAILABLE', 'CANCELLED'].includes(p.status)) throw conflict('This plot has booking history and cannot be deleted. Withdraw it from sale instead.');
    await c.query("UPDATE documents SET is_deleted = true, deleted_at = now(), deleted_by = $2 WHERE entity_type='PLOT' AND entity_id=$1", [id, req.user.id]);
    await c.query('DELETE FROM plots WHERE id=$1', [id]);
    await audit(c, req, { action: 'DELETE', entity: 'plot', entityId: id, summary: `Unused plot ${p.plot_no} deleted`, before: p });
  });
  res.json({ ok: true });
});

module.exports = router;
