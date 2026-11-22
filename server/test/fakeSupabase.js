'use strict';
// A small stand-in for Supabase used by the automatic tests: Supabase Auth (password sign-in, ES256
// signed access tokens + public keys, admin user management) and Supabase Storage (signed uploads,
// signed downloads, info, upload, download, remove). It answers the same HTTP calls that
// @supabase/supabase-js makes, so the real library is used against it.
const http = require('http');
const crypto = require('crypto');

const ANON_KEY = 'test-anon-key';
const SERVICE_KEY = 'test-service-role-key';

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

function startFakeSupabase(port = 0) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = 'test-key-1';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' };
  const users = new Map(); // id -> { id, email, password, banned }
  const objects = new Map(); // `${bucket}/${path}` -> { body: Buffer, contentType }
  const uploadTokens = new Map(); // token -> key
  const downloadTokens = new Map(); // token -> key
  const calls = [];
  let url = '';

  function sign(payload, key = privateKey, keyId = kid) {
    const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: keyId }));
    const body = b64url(JSON.stringify(payload));
    const sig = crypto.sign('sha256', Buffer.from(`${header}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
    return `${header}.${body}.${b64url(sig)}`;
  }
  function issueToken(user, { expiresIn = 3600 } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return sign({ aud: 'authenticated', exp: now + expiresIn, iat: now, iss: `${url}/auth/v1`, sub: user.id, email: user.email, role: 'authenticated', session_id: crypto.randomUUID() });
  }
  /** A well-formed token signed with a key Supabase never published. */
  function forgeToken(sub) {
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const now = Math.floor(Date.now() / 1000);
    return sign({ aud: 'authenticated', exp: now + 3600, iat: now, iss: `${url}/auth/v1`, sub, role: 'authenticated' }, other);
  }
  function verify(token) {
    const [h, p, s] = String(token || '').split('.');
    if (!s) return null;
    if (!crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    return payload.exp * 1000 > Date.now() ? payload : null;
  }
  const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
    banned_until: u.banned ? '3000-01-01T00:00:00Z' : null, user_metadata: u.metadata || {}, app_metadata: { provider: 'email' }, created_at: u.created_at });
  /** Create a Supabase login directly (as if made in the Supabase dashboard). */
  function addUser(email, password) {
    const u = { id: crypto.randomUUID(), email: email.toLowerCase(), password, banned: false, created_at: new Date().toISOString() };
    users.set(u.id, u);
    return u;
  }

  // Browsers call Supabase from the web app's origin, so (like real Supabase) answer CORS.
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
  const send = (res, status, body, headers = {}) => {
    headers = { ...CORS, ...headers };
    if (Buffer.isBuffer(body)) { res.writeHead(status, headers); return res.end(body); }
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
  const storageErr = (res, status, error, message) => send(res, status, { statusCode: String(status), error, message });
  const isService = (req) => req.headers.authorization === `Bearer ${SERVICE_KEY}`;

  // Storage uploads from the library are either a raw body (content-type header) or multipart form data.
  async function readUpload(req, raw) {
    const ct = req.headers['content-type'] || 'application/octet-stream';
    if (!ct.startsWith('multipart/form-data')) return { body: raw, contentType: ct.split(';')[0] };
    const form = await new Response(raw, { headers: { 'content-type': ct } }).formData();
    for (const [, v] of form.entries()) if (typeof v !== 'string') return { body: Buffer.from(await v.arrayBuffer()), contentType: v.type || 'application/octet-stream' };
    return { body: Buffer.alloc(0), contentType: 'application/octet-stream' };
  }

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const u = new URL(req.url, url);
    const p = decodeURIComponent(u.pathname);
    const json = () => { try { return JSON.parse(raw.toString() || '{}'); } catch { return {}; } };
    calls.push(`${req.method} ${p}`);
    if (req.method === 'OPTIONS') return send(res, 204);
    try {
      // ------------------------------------------------------------- auth
      if (p === '/auth/v1/.well-known/jwks.json') return send(res, 200, { keys: [jwk] });
      if (p === '/auth/v1/settings') return send(res, 200, { external: { email: true }, disable_signup: true });
      if (p === '/auth/v1/token' && req.method === 'POST' && u.searchParams.get('grant_type') === 'password') {
        if (req.headers.apikey !== ANON_KEY) return authErr(res, 401, 'no_api_key', 'Invalid API key');
        const b = json();
        const usr = [...users.values()].find((x) => x.email === String(b.email || '').toLowerCase());
        if (!usr || usr.password !== b.password) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
        if (usr.banned) return authErr(res, 400, 'user_banned', 'User is banned');
        const access = issueToken(usr);
        return send(res, 200, { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: crypto.randomUUID(), user: userJson(usr) });
      }
      if (p === '/auth/v1/user' && req.method === 'GET') {
        const claims = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
        const usr = claims && users.get(claims.sub);
        return usr ? send(res, 200, userJson(usr)) : authErr(res, 401, 'bad_jwt', 'invalid JWT');
      }
      if (p === '/auth/v1/logout') return send(res, 204);
      if (p.startsWith('/auth/v1/admin/')) {
        if (!isService(req)) return authErr(res, 403, 'not_admin', 'User not allowed');
        if (p === '/auth/v1/admin/users' && req.method === 'POST') {
          const b = json();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) return authErr(res, 400, 'email_address_invalid', 'Unable to validate email address: invalid format');
          if ([...users.values()].some((x) => x.email === b.email.toLowerCase())) return authErr(res, 422, 'email_exists', 'A user with this email address has already been registered');
          if (!b.password || b.password.length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
          const usr = addUser(b.email, b.password);
          usr.metadata = b.user_metadata;
          return send(res, 200, userJson(usr));
        }
        if (p === '/auth/v1/admin/users' && req.method === 'GET') return send(res, 200, { users: [...users.values()].map(userJson), aud: 'authenticated' });
        const m = p.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
        if (m) {
          const usr = users.get(m[1]);
          if (!usr) return authErr(res, 404, 'user_not_found', 'User not found');
          if (req.method === 'PUT') {
            const b = json();
            if (b.password) usr.password = b.password;
            if (b.email) usr.email = b.email.toLowerCase();
            if (b.ban_duration) usr.banned = b.ban_duration !== 'none';
            return send(res, 200, userJson(usr));
          }
          if (req.method === 'DELETE') { users.delete(usr.id); return send(res, 200, {}); }
          return send(res, 200, userJson(usr));
        }
        return authErr(res, 404, 'not_found', 'Not found');
      }
      // ------------------------------------------------------------- storage
      let m;
      if ((m = p.match(/^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/))) {
        const key = `${m[1]}/${m[2]}`;
        if (req.method === 'POST') {
          if (!isService(req)) return storageErr(res, 403, 'Unauthorized', 'service key required');
          const token = crypto.randomUUID();
          uploadTokens.set(token, key);
          return send(res, 200, { url: `/object/upload/sign/${key}?token=${token}` });
        }
        if (req.method === 'PUT') {
          const token = u.searchParams.get('token');
          if (uploadTokens.get(token) !== key) return storageErr(res, 400, 'InvalidSignature', 'invalid upload token');
          uploadTokens.delete(token);
          objects.set(key, await readUpload(req, raw));
          return send(res, 200, { Key: key });
        }
      }
      if ((m = p.match(/^\/storage\/v1\/object\/info\/([^/]+)\/(.+)$/))) {
        if (!isService(req)) return storageErr(res, 403, 'Unauthorized', 'service key required');
        const o = objects.get(`${m[1]}/${m[2]}`);
        if (!o) return storageErr(res, 404, 'not_found', 'Object not found');
        return send(res, 200, { name: m[2], bucket_id: m[1], size: o.body.length, content_type: o.contentType, metadata: { size: o.body.length, mimetype: o.contentType } });
      }
      if ((m = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/))) {
        const key = `${m[1]}/${m[2]}`;
        if (req.method === 'POST') {
          if (!isService(req)) return storageErr(res, 403, 'Unauthorized', 'service key required');
          if (!objects.has(key)) return storageErr(res, 404, 'not_found', 'Object not found');
          const token = crypto.randomUUID();
          downloadTokens.set(token, key);
          return send(res, 200, { signedURL: `/object/sign/${key}?token=${token}` });
        }
        const o = downloadTokens.get(u.searchParams.get('token')) === key && objects.get(key);
        if (!o) return storageErr(res, 400, 'InvalidSignature', 'invalid token');
        return send(res, 200, o.body, { 'content-type': o.contentType });
      }
      if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)$/)) && req.method === 'DELETE') {
        if (!isService(req)) return storageErr(res, 403, 'Unauthorized', 'service key required');
        const removed = (json().prefixes || []).filter((x) => objects.delete(`${m[1]}/${x}`));
        return send(res, 200, removed.map((name) => ({ name })));
      }
      if ((m = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/))) {
        if (!isService(req)) return storageErr(res, 403, 'Unauthorized', 'service key required');
        const key = `${m[1]}/${m[2]}`;
        if (req.method === 'POST' || req.method === 'PUT') {
          if (objects.has(key) && req.headers['x-upsert'] !== 'true' && req.method === 'POST') return storageErr(res, 409, 'Duplicate', 'The resource already exists');
          objects.set(key, await readUpload(req, raw));
          return send(res, 200, { Id: crypto.randomUUID(), Key: key });
        }
        const o = objects.get(key);
        if (!o) return storageErr(res, 404, 'not_found', 'Object not found');
        return send(res, 200, o.body, { 'content-type': o.contentType });
      }
      return send(res, 404, { error: 'not found', path: p });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      url = `http://127.0.0.1:${server.address().port}`;
      resolve({ url, server, users, objects, calls, issueToken, forgeToken, addUser, ANON_KEY, SERVICE_KEY, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { startFakeSupabase, ANON_KEY, SERVICE_KEY };
