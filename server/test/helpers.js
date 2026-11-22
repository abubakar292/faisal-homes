'use strict';
// Test harness: real PostgreSQL test database + real HTTP server.
const path = require('path');
const fs = require('fs');
const os = require('os');

// Each test file uses its own database (suffix) so files can run in parallel.
const BASE_TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5432/faisal_homes_test';
const TEST_DB = (() => {
  if (!process.env.TEST_DB_SUFFIX) return BASE_TEST_DB;
  const u = new URL(BASE_TEST_DB);
  u.pathname += process.env.TEST_DB_SUFFIX;
  return u.toString();
})();
process.env.DATABASE_URL = TEST_DB;
process.env.FH_ENV_FILE = path.join(os.tmpdir(), 'fh-nonexistent.env');
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-test-storage-'));
process.env.STORAGE_DIR = storage;
process.env.DISABLE_SCHEDULER = 'true';

const { Client: PgClient } = require('pg');

/**
 * legacy: { upTo: '004_x.sql', seed: async (client) => {} } builds the database as an older version would have,
 * adds existing data, and then runs the real upgrade (with its safety backup).
 */
async function resetDatabase(legacy) {
  const u = new URL(TEST_DB);
  const name = u.pathname.slice(1);
  u.pathname = '/postgres';
  const c = new PgClient({ connectionString: u.toString() });
  await c.connect();
  await c.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [name]);
  await c.query(`DROP DATABASE IF EXISTS "${name}"`);
  await c.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
  await c.end();
  if (legacy) {
    const dir = path.join(__dirname, '../src/db/migrations');
    const db = new PgClient({ connectionString: TEST_DB });
    await db.connect();
    await db.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (f > legacy.upTo) break;
      await db.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await db.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    }
    await legacy.seed(db);
    await db.end();
    await require('../src/db/migrate').migrate({ quiet: true, backupFirst: true });
    return;
  }
  await require('../src/db/migrate').migrate({ quiet: true });
}

class Api {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, p, body, { csrf = true, form } = {}) {
    const headers = {};
    if (csrf) headers['X-FH-Request'] = '1';
    if (this.cookie) headers.cookie = this.cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(this.base + p, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
  del(p) { return this.req('DELETE', p); }
}

async function startServer(opts = {}) {
  await resetDatabase(opts.legacy);
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { server, base, storage, api: () => new Api(base) };
}

async function stopServer(server) {
  await new Promise((r) => server.close(r));
  await require('../src/db/pool').pool.end();
  fs.rmSync(storage, { recursive: true, force: true });
}

module.exports = { startServer, stopServer, Api };
