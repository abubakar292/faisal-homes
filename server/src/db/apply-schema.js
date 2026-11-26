'use strict';
// Apply supabase/schema.sql and then every update in supabase/migrations/ (in name order) to an EMPTY
// database from the command line (npm run db:schema). The normal way is to paste the files into the
// Supabase SQL Editor; this is the same thing for a test or development database.
// It refuses to run on a database that already has the tables.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');

const SCHEMA_FILE = path.resolve(__dirname, '../../../supabase/schema.sql');
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');
const migrationFiles = () => (fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort() : []);

async function applySchema(connectionString = config.databaseUrl, ssl = config.databaseSsl) {
  const client = new Client({ connectionString, ssl });
  await client.connect();
  try {
    const exists = (await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS x")).rows[0].x;
    if (exists) throw new Error('This database already has the FAISAL HOMES tables. schema.sql is only for an empty database.');
    await client.query('BEGIN');
    await client.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    for (const f of migrationFiles()) await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  applySchema().then(() => { console.log('Database tables created.'); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { applySchema, SCHEMA_FILE };
