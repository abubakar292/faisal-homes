'use strict';
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { can, permissionsFor } = require('../lib/permissions');
const settings = require('../lib/settings');
const { AppError } = require('../lib/errors');

const COOKIE = 'fh_session';
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function timeoutMinutes() {
  const s = await settings.get('security');
  const m = Number(s.session_timeout_minutes);
  return Number.isFinite(m) && m >= 5 && m <= 1440 ? m : 30;
}

async function createSession(user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const mins = await timeoutMinutes();
  await pool.query(
    `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES ($1,$2, now() + ($3 || ' minutes')::interval, $4, $5)`,
    [hashToken(token), user.id, String(mins), req.ip, String(req.headers['user-agent'] || '').slice(0, 300)]);
  return token;
}

async function destroySession(req) {
  const token = req.cookies?.[COOKIE];
  if (token) await pool.query('DELETE FROM sessions WHERE id = $1', [hashToken(token)]);
}

/** Loads req.user from the session cookie (sliding idle timeout). Does not reject anonymous requests. */
async function loadUser(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    const id = hashToken(token);
    const mins = await timeoutMinutes();
    const r = await pool.query(
      `UPDATE sessions s SET last_seen_at = now(), expires_at = now() + ($2 || ' minutes')::interval
       FROM users u
       WHERE s.id = $1 AND s.user_id = u.id AND s.expires_at > now() AND u.is_active
       RETURNING u.id, u.username, u.full_name, u.role, u.must_change_password`, [id, String(mins)]);
    if (r.rowCount) {
      req.user = r.rows[0];
      req.user.permissions = permissionsFor(req.user.role);
    } else {
      req.sessionExpired = true;
      await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    }
    next();
  } catch (e) { next(e); }
}

function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, req.sessionExpired ? 'Your session has expired. Please log in again.' : 'Please log in',
      req.sessionExpired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED'));
  }
  // Users who must change their password can only reach auth endpoints.
  if (req.user.must_change_password && !req.originalUrl.startsWith('/api/auth')) {
    return next(new AppError(403, 'Please change your password first', 'MUST_CHANGE_PASSWORD'));
  }
  next();
}

function requirePerm(...perms) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'Please log in', 'UNAUTHENTICATED'));
    if (!perms.some((p) => can(req.user.role, p))) return next(new AppError(403, 'You do not have permission to do this', 'FORBIDDEN'));
    next();
  };
}

/** CSRF defence: state-changing API calls must carry the custom header (browsers cannot add it cross-site). */
function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-FH-Request') !== '1') return next(new AppError(403, 'Request blocked (missing security header)', 'CSRF'));
  next();
}

module.exports = { COOKIE, createSession, destroySession, loadUser, requireAuth, requirePerm, csrfGuard, hashToken, timeoutMinutes };
