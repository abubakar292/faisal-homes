'use strict';
const { Pool, types } = require('pg');
const config = require('../config');

// DATE -> 'YYYY-MM-DD' string (never shift by timezone). NUMERIC stays string (exact).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint counts

// Session timezone = business timezone so CURRENT_DATE (used for overdue logic) is the Pakistan date.
const pool = new Pool({ connectionString: config.databaseUrl, max: 15, options: `-c timezone=${config.timezone}` });
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
