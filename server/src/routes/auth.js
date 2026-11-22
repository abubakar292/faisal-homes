'use strict';
// Sign-in itself happens in the browser with Supabase Auth (email + password).
// These endpoints cover first-time setup, the user's profile/permissions, and password changes.
const express = require('express');
const { pool, withTx } = require('../db/pool');
const { timeoutMinutes, authFailure } = require('../middleware/auth');
const { permissionsFor } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const settings = require('../lib/settings');
const supa = require('../lib/supabase');
const { AppError } = require('../lib/errors');
const { z, parse } = require('../lib/validate');

const router = express.Router();

const email = z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address');
const password = (label = 'Password') => z.string({ required_error: `${label} is required` }).min(8, `${label} must be at least 8 characters`).max(72, `${label} is too long`);

async function mePayload(user) {
  const all = await settings.getAll();
  return {
    user: { id: user.id, email: user.email, username: user.email, full_name: user.full_name, role: user.role, must_change_password: user.must_change_password },
    permissions: permissionsFor(user.role),
    settings: {
      company: all.company, measurement: all.measurement, display: all.display,
      session_timeout_minutes: await timeoutMinutes(), late_fee: all.late_fee, installments: all.installments,
    },
  };
}

function signedIn(req) {
  if (!req.user) throw authFailure(req);
  return req.user;
}

router.get('/setup-status', async (_req, res) => {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  res.json({ needsSetup: r.rows[0].n === 0 });
});

// First run only: create the first administrator (Supabase login + FAISAL HOMES user) when no users exist.
router.post('/setup', async (req, res) => {
  if ((await pool.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n > 0) throw new AppError(409, 'Setup has already been completed');
  const body = parse(z.object({ email, full_name: z.string().trim().min(2, 'Full name is required'), password: password() }), req.body);
  let authId = null;
  try {
    await withTx(async (c) => {
      await c.query('LOCK TABLE users IN EXCLUSIVE MODE');
      if ((await c.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n > 0) throw new AppError(409, 'Setup has already been completed');
      authId = await supa.createAuthUser({ email: body.email, password: body.password, fullName: body.full_name });
      const u = (await c.query(
        `INSERT INTO users (auth_user_id, email, full_name, role) VALUES ($1,$2,$3,'ADMIN') RETURNING id, email, full_name, role`,
        [authId, body.email, body.full_name])).rows[0];
      await audit(c, req, { action: 'CREATE', entity: 'user', entityId: u.id, summary: `First administrator ${u.email} created`, user: { ...u, username: u.email } });
    });
  } catch (e) {
    if (authId) await supa.deleteAuthUser(authId);
    throw e;
  }
  res.status(201).json({ ok: true });
});

router.get('/me', async (req, res) => {
  res.json(await mePayload(signedIn(req)));
});

// Called by the web app right after a successful Supabase sign-in.
router.post('/login-event', async (req, res) => {
  const u = signedIn(req);
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  await audit(null, req, { action: 'LOGIN', entity: 'user', entityId: u.id, summary: `${u.email} logged in` });
  res.json({ ok: true });
});

router.post('/logout', async (req, res) => {
  if (req.user) await audit(null, req, { action: 'LOGOUT', entity: 'user', entityId: req.user.id, summary: `${req.user.email} logged out` });
  res.json({ ok: true });
});

router.post('/change-password', async (req, res) => {
  const u = signedIn(req);
  const body = parse(z.object({ current_password: z.string().min(1, 'Enter your current password'), new_password: password('New password') }), req.body);
  if (body.current_password === body.new_password) throw new AppError(400, 'New password must be different');
  if (!(await supa.checkPassword(u.email, body.current_password))) throw new AppError(400, 'Current password is incorrect');
  await supa.updateAuthUser(u.auth_user_id, { password: body.new_password });
  await pool.query('UPDATE users SET must_change_password = false, updated_at = now(), updated_by = $1 WHERE id = $1', [u.id]);
  await audit(null, req, { action: 'UPDATE', entity: 'user', entityId: u.id, summary: `${u.email} changed password` });
  req.user.must_change_password = false;
  res.json(await mePayload(req.user));
});

module.exports = router;
