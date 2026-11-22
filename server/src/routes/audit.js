'use strict';
const express = require('express');
const { pool } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');
router.use(requirePerm('audit.view'));
router.get('/', async (req, res) => {
  const { q, action, entity, from, to, user_id } = req.query;
  const where = []; const p = [];
  if (q) { p.push(`%${q}%`); const i = p.length; p.push(String(q)); where.push(`(summary ILIKE $${i} OR username ILIKE $${i} OR entity_id = $${p.length})`); }
  if (action) { p.push(action); where.push(`action = $${p.length}`); }
  if (entity) { p.push(entity); where.push(`entity_type = $${p.length}`); }
  if (user_id) { p.push(Number(user_id)); where.push(`user_id = $${p.length}`); }
  if (from) { p.push(from); where.push(`created_at >= $${p.length}::date`); }
  if (to) { p.push(to); where.push(`created_at < ($${p.length}::date + 1)`); }
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  const r = await pool.query(
    `SELECT id, created_at, username, action, entity_type, entity_id, summary, ip,
            before_data IS NOT NULL OR after_data IS NOT NULL AS has_data
     FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${limit}`, p);
  res.json(r.rows);
});
router.get('/entity/:type/:id', async (req, res) => {
  const r = await pool.query(
    `SELECT id, created_at, username, action, summary FROM audit_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 200`,
    [req.params.type, String(req.params.id)]);
  res.json(r.rows);
});
router.get('/:id', async (req, res) => {
  const r = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [Number(req.params.id)]);
  res.json(r.rows[0] || null);
});
module.exports = router;
