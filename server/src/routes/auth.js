'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool, withTx } = require('../db/pool');
const { COOKIE, createSession, destroySession, timeoutMinutes } = require('../middleware/auth');
const { permissionsFor } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const settings = require('../lib/settings');
const { AppError } = require('../lib/errors');
const { z, parse } = require('../lib/validate');

const router = express.Router();

// Simple brute-force protection: 5 failed attempts per username+IP => 10 minute lock.
const failures = new Map();
const LOCK_MS = 10 * 60 * 1000;
function lockKey(req, username) { return `${req.ip}|${String(username).toLowerCase()}`; }
function isLocked(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > LOCK_MS) { failures.delete(key); return false; }
  return f.count >= 5;
}
function noteFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > LOCK_MS) failures.set(key, { count: 1, first: Date.now() });
  else f.count++;
}

function cookieOpts(maxMinutes) {
  return { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/', maxAge: maxMinutes * 60 * 1000 * 48 };
}

async function mePayload(user) {
  const all = await settings.getAll();
  return {
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, must_change_password: user.must_change_password },
    permissions: permissionsFor(user.role),
    settings: {
      company: all.company, measurement: all.measurement, display: all.display,
      session_timeout_minutes: await timeoutMinutes(), late_fee: all.late_fee, installments: all.installments,
    },
  };
}

router.get('/setup-status', async (_req, res) => {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  res.json({ needsSetup: r.rows[0].n === 0 });
});

// First run only: create the first administrator when no users exist.
router.post('/setup', async (req, res) => {
  if ((await pool.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n > 0) throw new AppError(409, 'Setup has already been completed');
  const body = parse(z.object({
    username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dot, dash and underscore'),
    full_name: z.string().trim().min(2, 'Full name is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }), req.body);
  const user = await withTx(async (c) => {
    await c.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const n = (await c.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;
    if (n > 0) throw new AppError(409, 'Setup has already been completed');
    const hash = await bcrypt.hash(body.password, 12);
    const u = (await c.query(
      `INSERT INTO users (username, full_name, password_hash, role) VALUES ($1,$2,$3,'ADMIN')
       RETURNING id, username, full_name, role, must_change_password`, [body.username, body.full_name, hash])).rows[0];
    await audit(c, req, { action: 'CREATE', entity: 'user', entityId: u.id, summary: `First administrator ${u.username} created`, user: u });
    return u;
  });
  const token = await createSession(user, req);
  res.cookie(COOKIE, token, cookieOpts(await timeoutMinutes()));
  res.json(await mePayload(user));
});

router.post('/login', async (req, res) => {
  const { username, password } = parse(z.object({ username: z.string().trim().min(1, 'Enter your username'), password: z.string().min(1, 'Enter your password') }), req.body);
  const key = lockKey(req, username);
  if (isLocked(key)) throw new AppError(429, 'Too many failed attempts. Please wait 10 minutes and try again.');
  const r = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  const u = r.rows[0];
  const ok = u && u.is_active && (await bcrypt.compare(password, u.password_hash));
  if (!ok) {
    noteFailure(key);
    await audit(null, req, { action: 'LOGIN_FAILED', entity: 'user', entityId: u?.id, summary: `Failed login for "${username}"` });
    throw new AppError(401, u && !u.is_active ? 'This account is disabled' : 'Incorrect username or password');
  }
  failures.delete(key);
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  const token = await createSession(u, req);
  res.cookie(COOKIE, token, cookieOpts(await timeoutMinutes()));
  await audit(null, req, { action: 'LOGIN', entity: 'user', entityId: u.id, summary: `${u.username} logged in`, user: u });
  res.json(await mePayload(u));
});

router.post('/logout', async (req, res) => {
  if (req.user) await audit(null, req, { action: 'LOGOUT', entity: 'user', entityId: req.user.id, summary: `${req.user.username} logged out` });
  await destroySession(req);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.user) {
    throw new AppError(401, req.sessionExpired ? 'Your session has expired. Please log in again.' : 'Please log in', req.sessionExpired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED');
  }
  res.json(await mePayload(req.user));
});

router.post('/change-password', async (req, res) => {
  if (!req.user) throw new AppError(401, 'Please log in');
  const body = parse(z.object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
  }), req.body);
  const u = (await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0];
  if (!(await bcrypt.compare(body.current_password, u.password_hash))) throw new AppError(400, 'Current password is incorrect');
  if (body.current_password === body.new_password) throw new AppError(400, 'New password must be different');
  const hash = await bcrypt.hash(body.new_password, 12);
  await pool.query('UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now(), updated_by = $1 WHERE id = $1', [u.id, hash]);
  await audit(null, req, { action: 'UPDATE', entity: 'user', entityId: u.id, summary: `${u.username} changed password` });
  req.user.must_change_password = false;
  res.json(await mePayload(req.user));
});

module.exports = router;
