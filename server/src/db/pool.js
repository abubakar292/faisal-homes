'use strict';
const { Pool, types } = require('pg');
const config = require('../config');

// DATE -> 'YYYY-MM-DD' string (never shift by timezone). NUMERIC stays string (exact).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint counts

// The business timezone (Asia/Karachi) is set on the database itself by supabase/schema.sql, so
// CURRENT_DATE (used for overdue logic) is the Pakistan date on every pooled connection.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});
pool.on('error', (err) => console.error('[db] idle client error', err.message));

async function query(text, params) {
  return pool.query(text, params);
}

/** Run fn(client) inside a transaction. Rolls back on any error. */
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTx };
