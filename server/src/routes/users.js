'use strict';
// Staff accounts. Each FAISAL HOMES user has a Supabase Auth login (email + password) created here,
// so no confirmation email is needed. Role and "active" are kept in the users table.
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { requirePerm } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { ROLES } = require('../lib/permissions');
const supa = require('../lib/supabase');
const { AppError, notFound } = require('../lib/errors');
const { z, parse, bool } = require('../lib/validate');

const router = express.Router();
require('../lib/validate').numericParams(router, 'id');
router.use(requirePerm('users.manage'));
const COLS = 'id, email, full_name, role, is_active, must_change_password, last_login_at, created_at';

const email = z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address');
const password = z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters').max(72, 'Password is too long');

router.get('/', async (_req, res) => {
  res.json((await pool.query(`SELECT ${COLS} FROM users ORDER BY is_active DESC, full_name`)).rows);
});

const createSchema = z.object({
  email,
  full_name: z.string().trim().min(2, 'Full name is required'),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
  password,
  must_change_password: bool,
});
router.post('/', async (req, res) => {
  const b = parse(createSchema, req.body);
  if ((await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [b.email])).rowCount) throw new AppError(409, 'A user with this email already exists');
  const authId = await supa.createAuthUser({ email: b.email, password: b.password, fullName: b.full_name });
  try {
    const u = await withTx(async (c) => {
      const row = (await c.query(
        `INSERT INTO users (auth_user_id, email, full_name, role, must_change_password, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING ${COLS}`,
        [authId, b.email, b.full_name, b.role, b.must_change_password, req.user.id])).rows[0];
      await audit(c, req, { action: 'CREATE', entity: 'user', entityId: row.id, summary: `User ${row.email} (${row.role}) created`, after: row });
      return row;
    });
    res.status(201).json(u);
  } catch (e) {
    await supa.deleteAuthUser(authId);
    throw e;
  }
});

async function adminCount(c, exceptId) {
  return (await c.query("SELECT COUNT(*)::int AS n FROM users WHERE role='ADMIN' AND is_active AND id <> $1", [exceptId])).rows[0].n;
}

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ full_name: z.string().trim().min(2, 'Full name is required'), role: z.enum(ROLES), is_active: bool }), req.body);
  const u = await withTx(async (c) => {
    const before = (await c.query(`SELECT ${COLS}, auth_user_id FROM users WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!before) throw notFound('User');
    const losingAdmin = before.role === 'ADMIN' && (b.role !== 'ADMIN' || !b.is_active);
    if (losingAdmin && (await adminCount(c, id)) === 0) throw new AppError(400, 'There must always be at least one active administrator');
    if (id === req.user.id && !b.is_active) throw new AppError(400, 'You cannot disable your own account');
    const row = (await c.query(
      `UPDATE users SET full_name=$2, role=$3, is_active=$4, updated_at=now(), updated_by=$5 WHERE id=$1 RETURNING ${COLS}`,
      [id, b.full_name, b.role, b.is_active, req.user.id])).rows[0];
    // Disabled users cannot sign in to Supabase either (the server also refuses them on every request).
    if (before.is_active !== b.is_active && before.auth_user_id) await supa.updateAuthUser(before.auth_user_id, { disabled: !b.is_active });
    const { auth_user_id: _a, ...beforeData } = before;
    await audit(c, req, { action: 'UPDATE', entity: 'user', entityId: id, summary: `User ${row.email} updated`, before: beforeData, after: row });
    return row;
  });
  res.json(u);
});

router.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ password, must_change_password: bool }), req.body);
  await withTx(async (c) => {
    const r = await c.query('UPDATE users SET must_change_password=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING email, auth_user_id',
      [id, b.must_change_password, req.user.id]);
    if (!r.rowCount) throw notFound('User');
    if (!r.rows[0].auth_user_id) throw new AppError(400, 'This user has no Supabase login');
    await supa.updateAuthUser(r.rows[0].auth_user_id, { password: b.password });
    await audit(c, req, { action: 'UPDATE', entity: 'user', entityId: id, summary: `Password reset for ${r.rows[0].email}` });
  });
  res.json({ ok: true });
});

module.exports = router;
