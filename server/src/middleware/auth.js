'use strict';
// Login is Supabase Auth. The browser sends the Supabase access token as "Authorization: Bearer …".
// Plain browser links (PDFs, Excel downloads, document images) cannot add that header, so the same
// token is also accepted from the fh_at cookie, which the web app keeps in step with the session.
const { pool } = require('../db/pool');
const { can, permissionsFor } = require('../lib/permissions');
const settings = require('../lib/settings');
const { verifyAccessToken } = require('../lib/supabase');
const { AppError } = require('../lib/errors');

const TOKEN_COOKIE = 'fh_at';

async function timeoutMinutes() {
  const s = await settings.get('security');
  const m = Number(s.session_timeout_minutes);
  return Number.isFinite(m) && m >= 5 && m <= 1440 ? m : 30;
}

function tokenFrom(req) {
  const h = req.get('authorization') || '';
  if (/^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, '').trim();
  return req.cookies?.[TOKEN_COOKIE] || null;
}

/** Loads req.user from the Supabase token. Does not reject anonymous requests. */
async function loadUser(req, _res, next) {
  try {
    const token = tokenFrom(req);
    if (!token) return next();
    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch (e) {
      if (e instanceof AppError) throw e;
      req.authProblem = e.code === 'EXPIRED' ? 'SESSION_EXPIRED' : 'INVALID_TOKEN';
      return next();
    }
    req.authClaims = claims;
    const r = await pool.query(
      `SELECT id, email, full_name, role, is_active, must_change_password, auth_user_id FROM users WHERE auth_user_id = $1`, [claims.sub]);
    const u = r.rows[0];
    if (!u) { req.authProblem = 'NO_PROFILE'; return next(); }
    if (!u.is_active) { req.authProblem = 'DISABLED'; return next(); }
    req.user = { ...u, username: u.email, permissions: permissionsFor(u.role) };
    next();
  } catch (e) { next(e); }
}

const PROBLEMS = {
  SESSION_EXPIRED: [401, 'Your session has expired. Please log in again.'],
  INVALID_TOKEN: [401, 'Please log in'],
  NO_PROFILE: [403, 'This login is not linked to a FAISAL HOMES user. Ask an administrator to add you on the Users page.'],
  DISABLED: [403, 'This account is disabled'],
};

function authFailure(req) {
  const [status, message] = PROBLEMS[req.authProblem] || [401, 'Please log in'];
  return new AppError(status, message, req.authProblem || 'UNAUTHENTICATED');
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(authFailure(req));
  // Users who must change their password can only reach auth endpoints.
  if (req.user.must_change_password && !req.originalUrl.startsWith('/api/auth')) {
    return next(new AppError(403, 'Please change your password first', 'MUST_CHANGE_PASSWORD'));
  }
  next();
}

function requirePerm(...perms) {
  return (req, _res, next) => {
    if (!req.user) return next(authFailure(req));
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

module.exports = { TOKEN_COOKIE, loadUser, requireAuth, requirePerm, csrfGuard, timeoutMinutes, authFailure };
