'use strict';
// Test harness: a real PostgreSQL 17 (started just for the tests, or TEST_DATABASE_URL), the real
// supabase/schema.sql, a stand-in for Supabase Auth + Storage, and the real HTTP server.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// Ports are chosen now, before any application module reads its configuration.
const freePort = () => Number(execFileSync(process.execPath, ['-e',
  "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"]).toString());
const PG_PORT = freePort();
const FAKE_PORT = freePort();
const DB_NAME = 'faisal_homes_test';
const EXTERNAL_DB = process.env.TEST_DATABASE_URL || null;
const TEST_DB = EXTERNAL_DB || `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/${DB_NAME}`;

const { ANON_KEY, SERVICE_KEY, startFakeSupabase } = require('./fakeSupabase');

process.env.FH_ENV_FILE = path.join(os.tmpdir(), 'fh-nonexistent.env');
process.env.DATABASE_URL = TEST_DB;
process.env.DATABASE_SSL = 'false';
process.env.SUPABASE_URL = `http://127.0.0.1:${FAKE_PORT}`;
process.env.SUPABASE_ANON_KEY = ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
delete process.env.SUPABASE_JWT_SECRET;
delete process.env.VERCEL;

const { Client: PgClient } = require('pg');
let embedded = null;
let dataDir = null;

async function startPostgres() {
  if (EXTERNAL_DB) return;
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-test-pg-'));
  embedded = new EmbeddedPostgres({
    databaseDir: dataDir, port: PG_PORT, user: 'postgres', password: 'postgres', persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  });
  await embedded.initialise();
  await embedded.start();
}

async function resetDatabase() {
  const u = new URL(TEST_DB);
  const name = u.pathname.slice(1);
  u.pathname = '/postgres';
  const c = new PgClient({ connectionString: u.toString() });
  await c.connect();
  await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name]);
  await c.query(`DROP DATABASE IF EXISTS "${name}"`);
  await c.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
  await c.end();
  await require('../src/db/apply-schema').applySchema(TEST_DB, false);
}

class Api {
  constructor(base, fake) { this.base = base; this.fake = fake; this.token = null; }
  async req(method, p, body, { csrf = true, form, redirect = 'follow', headers: extra = {}, auth = 'bearer' } = {}) {
    const headers = { ...extra };
    if (csrf) headers['X-FH-Request'] = '1';
    if (this.token && auth === 'bearer') headers.authorization = `Bearer ${this.token}`;
    if (this.token && auth === 'cookie') headers.cookie = `fh_at=${this.token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(this.base + p, { method, headers, body: payload, redirect });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
  del(p) { return this.req('DELETE', p); }
  /** Sign in with Supabase Auth (email + password), like the web app does, then load the profile. */
  async login(email, password) {
    const r = await fetch(`${this.fake.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON_KEY }, body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) return { status: r.status, data: d };
    this.token = d.access_token;
    await this.post('/auth/login-event');
    return this.get('/auth/me');
  }
}

async function startServer() {
  await startPostgres();
  await resetDatabase();
  const fake = await startFakeSupabase(FAKE_PORT);
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { server, base, fake, api: () => new Api(base, fake) };
}

async function stopServer(ctx) {
  await new Promise((r) => ctx.server.close(r));
  await ctx.fake.close();
  await require('../src/db/pool').pool.end();
  if (embedded) {
    await embedded.stop().catch(() => {});
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

module.exports = { startServer, stopServer, Api, ANON_KEY };
