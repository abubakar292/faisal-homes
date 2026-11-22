'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { ROLES } = require('../lib/permissions');
const { AppError, notFound } = require('../lib/errors');
const { z, parse, bool } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');
router.use(requirePerm('users.manage'));
const COLS = 'id, username, full_name, role, is_active, must_change_password, last_login_at, created_at';

router.get('/', async (_req, res) => {
  res.json((await pool.query(`SELECT ${COLS} FROM users ORDER BY is_active DESC, full_name`)).rows);
});

const createSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dot, dash and underscore'),
  full_name: z.string().trim().min(2, 'Full name is required'),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  must_change_password: bool,
});
router.post('/', async (req, res) => {
  const b = parse(createSchema, req.body);
  const hash = await bcrypt.hash(b.password, 12);
  const u = await withTx(async (c) => {
    const row = (await c.query(
      `INSERT INTO users (username, full_name, role, password_hash, must_change_password, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING ${COLS}`,
      [b.username, b.full_name, b.role, hash, b.must_change_password, req.user.id])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'user', entityId: row.id, summary: `User ${row.username} (${row.role}) created`, after: row });
    return row;
  });
  res.status(201).json(u);
});

async function adminCount(c, exceptId) {
  return (await c.query("SELECT COUNT(*)::int AS n FROM users WHERE role='ADMIN' AND is_active AND id <> $1", [exceptId])).rows[0].n;
}

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ full_name: z.string().trim().min(2, 'Full name is required'), role: z.enum(ROLES), is_active: bool }), req.body);
  const u = await withTx(async (c) => {
    const before = (await c.query(`SELECT ${COLS} FROM users WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!before) throw notFound('User');
    const losingAdmin = before.role === 'ADMIN' && (b.role !== 'ADMIN' || !b.is_active);
    if (losingAdmin && (await adminCount(c, id)) === 0) throw new AppError(400, 'There must always be at least one active administrator');
    if (id === req.user.id && !b.is_active) throw new AppError(400, 'You cannot disable your own account');
    const row = (await c.query(
      `UPDATE users SET full_name=$2, role=$3, is_active=$4, updated_at=now(), updated_by=$5 WHERE id=$1 RETURNING ${COLS}`,
      [id, b.full_name, b.role, b.is_active, req.user.id])).rows[0];
    if (!b.is_active || before.role !== b.role) await c.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await audit(c, req, { action: 'UPDATE', entity: 'user', entityId: id, summary: `User ${row.username} updated`, before, after: row });
    return row;
  });
  res.json(u);
});

router.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ password: z.string().min(8, 'Password must be at least 8 characters'), must_change_password: bool }), req.body);
  const hash = await bcrypt.hash(b.password, 12);
  await withTx(async (c) => {
    const r = await c.query('UPDATE users SET password_hash=$2, must_change_password=$3, updated_at=now(), updated_by=$4 WHERE id=$1 RETURNING username',
      [id, hash, b.must_change_password, req.user.id]);
    if (!r.rowCount) throw notFound('User');
    await c.query('DELETE FROM sessions WHERE user_id = $1 AND $1 <> $2', [id, req.user.id]);
    await audit(c, req, { action: 'UPDATE', entity: 'user', entityId: id, summary: `Password reset for ${r.rows[0].username}` });
  });
  res.json({ ok: true });
});

module.exports = router;
