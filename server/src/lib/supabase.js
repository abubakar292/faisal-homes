'use strict';
// Everything the server needs from Supabase: checking login tokens, managing Supabase Auth users,
// and private file storage (documents + company logo). The database itself is reached through pg.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { AppError } = require('./errors');

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function requireConfig(...keys) {
  const names = { supabaseUrl: 'SUPABASE_URL', supabaseAnonKey: 'SUPABASE_ANON_KEY', supabaseServiceKey: 'SUPABASE_SERVICE_ROLE_KEY' };
  const missing = keys.filter((k) => !config[k]).map((k) => names[k]);
  if (missing.length) throw new AppError(500, `Supabase is not configured on the server (missing ${missing.join(', ')}).`, 'CONFIG');
}

let adminClient = null;
/** Supabase client with the secret (service role) key. Server only, never sent to browsers. */
function admin() {
  requireConfig('supabaseUrl', 'supabaseServiceKey');
  if (!adminClient) adminClient = createClient(config.supabaseUrl, config.supabaseServiceKey, CLIENT_OPTS);
  return adminClient;
}

// ------------------------------------------------------------------ access token verification
const tokenError = (code) => Object.assign(new Error(code), { code });
let jwks = { keys: null, at: 0 };

async function fetchJwks(force) {
  const age = Date.now() - jwks.at;
  if (jwks.keys && (force ? age < 30 * 1000 : age < 10 * 60 * 1000)) return jwks.keys;
  const r = await fetch(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`, { headers: { apikey: config.supabaseAnonKey } });
  if (!r.ok) throw new AppError(503, `Cannot reach Supabase Auth to check the login (HTTP ${r.status}).`, 'AUTH_UNAVAILABLE');
  const body = await r.json();
  jwks = { keys: Array.isArray(body.keys) ? body.keys : [], at: Date.now() };
  return jwks.keys;
}

function checkClaims(p) {
  if (typeof p.sub !== 'string' || !p.sub) throw tokenError('INVALID');
  if (typeof p.exp !== 'number' || p.exp * 1000 < Date.now() - 30 * 1000) throw tokenError('EXPIRED');
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes('authenticated')) throw tokenError('INVALID');
  if (p.iss && config.supabaseUrl && p.iss.replace(/\/+$/, '') !== `${config.supabaseUrl}/auth/v1`) throw tokenError('INVALID');
  return p;
}

// Projects still on the legacy shared JWT secret without SUPABASE_JWT_SECRET set: ask Supabase Auth.
const remoteCache = new Map();
async function verifyRemotely(token, payload) {
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = remoteCache.get(key);
  if (hit && hit > Date.now()) return checkClaims(payload);
  const r = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) throw tokenError('INVALID');
  if (!r.ok) throw new AppError(503, `Cannot reach Supabase Auth to check the login (HTTP ${r.status}).`, 'AUTH_UNAVAILABLE');
  const user = await r.json();
  if (user.id !== payload.sub) throw tokenError('INVALID');
  if (remoteCache.size > 1000) remoteCache.clear();
  remoteCache.set(key, Math.min(Date.now() + 60 * 1000, payload.exp * 1000));
  return checkClaims(payload);
}

/**
 * Verify a Supabase Auth access token and return its claims ({ sub, email, exp, ... }).
 * Asymmetric keys (ES256 / RS256 / EdDSA, the Supabase default) are checked locally against the
 * project's public keys; the legacy HS256 secret is checked with SUPABASE_JWT_SECRET when set.
 * Throws an error with code 'INVALID' or 'EXPIRED'.
 */
async function verifyAccessToken(token) {
  requireConfig('supabaseUrl', 'supabaseAnonKey');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw tokenError('INVALID');
  let header; let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw tokenError('INVALID'); }
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], 'base64url');
  let ok = false;
  if (header.alg === 'HS256') {
    if (!config.supabaseJwtSecret) return verifyRemotely(token, payload);
    const expected = crypto.createHmac('sha256', config.supabaseJwtSecret).update(data).digest();
    ok = expected.length === sig.length && crypto.timingSafeEqual(expected, sig);
  } else if (['ES256', 'RS256', 'EdDSA'].includes(header.alg)) {
    let jwk = (await fetchJwks(false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await fetchJwks(true)).find((k) => k.kid === header.kid);
    if (!jwk) throw tokenError('INVALID');
    const { kty, crv, x, y, n, e } = jwk;
    let key;
    try { key = crypto.createPublicKey({ key: Object.fromEntries(Object.entries({ kty, crv, x, y, n, e }).filter(([, v]) => v !== undefined)), format: 'jwk' }); } catch { throw tokenError('INVALID'); }
    if (header.alg === 'ES256') ok = crypto.verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
    else if (header.alg === 'RS256') ok = crypto.verify('sha256', data, key, sig);
    else ok = crypto.verify(null, data, key, sig);
  } else {
    throw tokenError('INVALID');
  }
  if (!ok) throw tokenError('INVALID');
  return checkClaims(payload);
}

// ------------------------------------------------------------------ Supabase Auth users
function authError(error, fallback) {
  const msg = error?.message || fallback;
  if (error?.code === 'email_exists' || /already (been )?registered|already exists/i.test(msg)) {
    return new AppError(409, 'A Supabase login with this email already exists. Use another email, or delete that login in Supabase → Authentication → Users.', 'DUPLICATE');
  }
  if (error?.code === 'weak_password' || /password/i.test(msg)) return new AppError(400, `Password not accepted by Supabase: ${msg}`, 'BAD_REQUEST');
  if (error?.code === 'email_address_invalid' || /email/i.test(msg)) return new AppError(400, `Email not accepted by Supabase: ${msg}`, 'BAD_REQUEST');
  return new AppError(502, `Supabase Auth error: ${msg}`, 'AUTH_ERROR');
}

/** Create a confirmed email + password login (no confirmation email is sent). Returns the auth user id. */
async function createAuthUser({ email, password, fullName }) {
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw authError(error, 'could not create the login');
  return data.user.id;
}

/** attrs: { password?, email?, disabled? (true = block login, false = allow) } */
async function updateAuthUser(id, { password, email, disabled } = {}) {
  const attrs = {};
  if (password) attrs.password = password;
  if (email) attrs.email = email;
  if (disabled !== undefined) attrs.ban_duration = disabled ? '876000h' : 'none';
  const { error } = await admin().auth.admin.updateUserById(id, attrs);
  if (error) throw authError(error, 'could not update the login');
}

async function deleteAuthUser(id) {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) console.error('[auth] could not remove login', id, error.message);
}

/** True when email + password are correct (used to confirm the current password before changing it). */
async function checkPassword(email, password) {
  requireConfig('supabaseUrl', 'supabaseAnonKey');
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, CLIENT_OPTS);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return false;
  // Close the session this check just opened.
  try { await admin().auth.admin.signOut(data.session.access_token, 'local'); } catch { /* not important */ }
  return true;
}

// ------------------------------------------------------------------ storage (private bucket)
function storageError(error, what) {
  return new AppError(502, `File storage error (${what}): ${error?.message || 'unknown error'}`, 'STORAGE_ERROR');
}
const bucket = () => admin().storage.from(config.storageBucket);

/** Signed URL the browser uploads one file to (valid 2 hours). */
async function createUploadUrl(path) {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error) throw storageError(error, 'prepare upload');
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** { size, contentType } of a stored file, or null if it does not exist. */
async function objectInfo(path) {
  const { data, error } = await bucket().info(path);
  if (error) {
    if (error.status === 404 || error.statusCode === '404' || /not.?found|NoSuchKey/i.test(`${error.code || ''} ${error.message || ''}`)) return null;
    throw storageError(error, 'check file');
  }
  return {
    size: Number(data.size ?? data.metadata?.size ?? 0),
    contentType: data.contentType || data.metadata?.mimetype || data.metadata?.contentType || '',
  };
}

/** Short-lived link to one file. downloadName makes the browser save it instead of showing it. */
async function signedDownloadUrl(path, seconds = 60, downloadName) {
  const { data, error } = await bucket().createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error) throw storageError(error, 'open file');
  return data.signedUrl;
}

async function uploadObject(path, buffer, contentType) {
  const { error } = await bucket().upload(path, buffer, { contentType, upsert: true });
  if (error) throw storageError(error, 'upload');
}

async function downloadObject(path) {
  const { data, error } = await bucket().download(path);
  if (error) {
    if (/not.?found|NoSuchKey|404/i.test(`${error.message || ''} ${error.status || ''}`)) return null;
    throw storageError(error, 'download');
  }
  return Buffer.from(await data.arrayBuffer());
}

async function removeObjects(paths) {
  if (!paths.length) return;
  const { error } = await bucket().remove(paths);
  if (error) console.error('[storage] could not remove', paths, error.message);
}

/** For the automatic tests only. */
function _reset() { adminClient = null; jwks = { keys: null, at: 0 }; remoteCache.clear(); }

module.exports = {
  verifyAccessToken, createAuthUser, updateAuthUser, deleteAuthUser, checkPassword,
  createUploadUrl, objectInfo, signedDownloadUrl, uploadObject, downloadObject, removeObjects, _reset,
};
