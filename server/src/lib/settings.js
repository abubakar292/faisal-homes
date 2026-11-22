'use strict';
const { pool } = require('../db/pool');

let cache = null;
let cacheAt = 0;

async function getAll(db = pool) {
  if (cache && Date.now() - cacheAt < 30000 && db === pool) return cache;
  const r = await db.query('SELECT key, value FROM settings');
  const out = {};
  for (const row of r.rows) out[row.key] = row.value;
  if (db === pool) { cache = out; cacheAt = Date.now(); }
  return out;
}
async function get(key, db) { return (await getAll(db))[key] || {}; }
function invalidate() { cache = null; }
module.exports = { getAll, get, invalidate };
