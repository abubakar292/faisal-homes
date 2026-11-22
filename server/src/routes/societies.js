'use strict';
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const settings = require('../lib/settings');
const { notFound, badRequest } = require('../lib/errors');
const { z, parse, reqText, optText, optId, optNumber } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id', 'blockId');

const STATS = `
  COUNT(p.id) FILTER (WHERE p.status <> 'CANCELLED')::int AS plot_count,
  COUNT(p.id) FILTER (WHERE p.status = 'AVAILABLE')::int AS available,
  COUNT(p.id) FILTER (WHERE p.status = 'RESERVED')::int AS reserved,
  COUNT(p.id) FILTER (WHERE p.status IN ('BOOKED','TRANSFERRED'))::int AS booked,
  COUNT(p.id) FILTER (WHERE p.status = 'SOLD')::int AS sold,
  COALESCE(SUM(p.size_marla) FILTER (WHERE p.status <> 'CANCELLED'), 0)::numeric(14,4) AS plotted_marla`;

router.get('/', requirePerm('society.view'), async (req, res) => {
  const where = req.query.include_archived === '1' ? '' : "WHERE s.status = 'ACTIVE'";
  const r = await pool.query(`
    SELECT s.*, l.name AS land_name, ${STATS},
      (SELECT COUNT(*)::int FROM blocks b WHERE b.society_id = s.id) AS block_count
    FROM societies s LEFT JOIN lands l ON l.id = s.land_id LEFT JOIN plots p ON p.society_id = s.id
    ${where} GROUP BY s.id, l.name ORDER BY s.name`);
  res.json(r.rows);
});

router.get('/:id', requirePerm('society.view'), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await pool.query(`SELECT s.*, l.name AS land_name FROM societies s LEFT JOIN lands l ON l.id = s.land_id WHERE s.id = $1`, [id])).rows[0];
  if (!s) throw notFound('Society');
  const blocks = (await pool.query(`
    SELECT b.*, ${STATS},
      COALESCE(array_agg(DISTINCT p.street_no) FILTER (WHERE p.street_no IS NOT NULL), '{}') AS streets
    FROM blocks b LEFT JOIN plots p ON p.block_id = b.id WHERE b.society_id = $1
    GROUP BY b.id ORDER BY b.sort_order, b.name`, [id])).rows;
  const sizes = (await pool.query(`SELECT size_marla, COUNT(*)::int AS n FROM plots WHERE society_id=$1 AND status <> 'CANCELLED' GROUP BY size_marla ORDER BY size_marla`, [id])).rows;
  res.json({ ...s, blocks, sizes });
});

const schema = z.object({
  name: reqText('Society name'), code: optText, land_id: optId, location: optText, description: optText,
  marla_sqft: optNumber('Marla square feet'),
});

router.post('/', requirePerm('society.edit'), async (req, res) => {
  const b = parse(schema, req.body);
  const m = await settings.get('measurement');
  const row = await withTx(async (c) => {
    const r = (await c.query(
      `INSERT INTO societies (name, code, land_id, location, description, marla_sqft, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [b.name, b.code, b.land_id, b.location, b.description, b.marla_sqft || Number(m.marla_sqft) || 272.25, req.user.id])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'society', entityId: r.id, summary: `Society "${r.name}" created`, after: r });
    return r;
  });
  res.status(201).json(row);
});

router.put('/:id', requirePerm('society.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(schema.extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE') }), req.body);
  const row = await withTx(async (c) => {
    const before = (await c.query('SELECT * FROM societies WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!before) throw notFound('Society');
    const r = (await c.query(
      `UPDATE societies SET name=$2, code=$3, land_id=$4, location=$5, description=$6, marla_sqft=$7, status=$8, updated_by=$9, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, b.name, b.code, b.land_id, b.location, b.description, b.marla_sqft || before.marla_sqft, b.status, req.user.id])).rows[0];
    await audit(c, req, { action: 'UPDATE', entity: 'society', entityId: id, summary: `Society "${r.name}" updated`, before, after: r });
    return r;
  });
  res.json(row);
});

// ----- blocks
router.post('/:id/blocks', requirePerm('society.edit'), async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ name: reqText('Block name'), description: optText }), req.body);
  const row = await withTx(async (c) => {
    if (!(await c.query('SELECT 1 FROM societies WHERE id=$1', [id])).rowCount) throw notFound('Society');
    const r = (await c.query(
      `INSERT INTO blocks (society_id, name, description, sort_order, created_by)
       VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM blocks WHERE society_id=$1),$4) RETURNING *`,
      [id, b.name, b.description, req.user.id])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'block', entityId: r.id, summary: `Block "${r.name}" created`, after: r });
    return r;
  });
  res.status(201).json(row);
});

router.put('/blocks/:blockId', requirePerm('society.edit'), async (req, res) => {
  const id = Number(req.params.blockId);
  const b = parse(z.object({ name: reqText('Block name'), description: optText }), req.body);
  const row = await withTx(async (c) => {
    const before = (await c.query('SELECT * FROM blocks WHERE id=$1', [id])).rows[0];
    if (!before) throw notFound('Block');
    const r = (await c.query('UPDATE blocks SET name=$2, description=$3 WHERE id=$1 RETURNING *', [id, b.name, b.description])).rows[0];
    await audit(c, req, { action: 'UPDATE', entity: 'block', entityId: id, summary: `Block "${before.name}" renamed to "${r.name}"`, before, after: r });
    return r;
  });
  res.json(row);
});

router.delete('/blocks/:blockId', requirePerm('society.edit'), async (req, res) => {
  const id = Number(req.params.blockId);
  await withTx(async (c) => {
    const blk = (await c.query('SELECT * FROM blocks WHERE id=$1', [id])).rows[0];
    if (!blk) throw notFound('Block');
    const n = (await c.query('SELECT COUNT(*)::int AS n FROM plots WHERE block_id=$1', [id])).rows[0].n;
    if (n) throw badRequest(`This block has ${n} plot(s). Remove or move the plots first.`);
    await c.query('DELETE FROM blocks WHERE id=$1', [id]);
    await audit(c, req, { action: 'DELETE', entity: 'block', entityId: id, summary: `Empty block "${blk.name}" deleted`, before: blk });
  });
  res.json({ ok: true });
});

module.exports = router;
