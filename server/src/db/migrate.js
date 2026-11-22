'use strict';
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');

async function ensureDatabase() {
  // Create the database if it does not exist (needs permission on the "postgres" maintenance DB).
  const url = new URL(config.databaseUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  try {
    await admin.connect();
    const r = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!r.rowCount) {
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}" ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`[migrate] created database ${dbName}`);
    }
  } catch (e) {
    console.warn(`[migrate] could not check/create database automatically: ${e.message}`);
  } finally {
    await admin.end().catch(() => {});
  }
}

/**
 * Apply pending SQL migrations in order, each in its own transaction.
 * backupFirst: when an existing database (one that already has applied migrations) is about to be upgraded,
 * a full backup is made first. If that backup fails the upgrade is NOT applied.
 */
async function migrate({ quiet = false, backupFirst = false } = {}) {
  await ensureDatabase();
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const pending = files.filter((f) => !done.has(f));
    if (backupFirst && pending.length && done.size > 0) {
      const { createBackup } = require('../services/backupService');
      try {
        const b = await createBackup('pre-migration');
        console.log(`[migrate] safety backup before upgrade: ${b.name}`);
      } catch (e) {
        throw new Error(`The database upgrade was NOT applied because the safety backup failed: ${e.message}`);
      }
    }
    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied++;
        if (!quiet) console.log(`[migrate] applied ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${e.message}`);
      }
    }
    if (!quiet) console.log(applied ? `[migrate] ${applied} migration(s) applied` : '[migrate] database is up to date');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate({ backupFirst: true }).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { migrate };
