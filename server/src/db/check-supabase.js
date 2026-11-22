'use strict';
// Read-only check of the Supabase setup (npm run check). It changes nothing.
// Confirms: settings present, database reachable with Pakistan time, tables created by schema.sql,
// tables hidden from the public Data API, storage bucket present, Supabase Auth reachable.
const config = require('../config');

const results = [];
const ok = (m) => results.push(['OK  ', m]);
const bad = (m) => results.push(['FAIL', m]);

async function main() {
  for (const [k, name] of [['supabaseUrl', 'SUPABASE_URL'], ['supabaseAnonKey', 'SUPABASE_ANON_KEY'], ['supabaseServiceKey', 'SUPABASE_SERVICE_ROLE_KEY']]) {
    if (config[k]) ok(`${name} is set`); else bad(`${name} is missing in .env`);
  }
  const hasDb = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (hasDb) ok('DATABASE_URL is set'); else bad('DATABASE_URL is missing in .env (database checks skipped)');

  const { pool } = require('./pool');
  if (hasDb) try {
    const r = (await pool.query(`SELECT current_setting('TimeZone') AS tz, current_database() AS db,
      to_regclass('public.schema_migrations') IS NOT NULL AS has_schema`)).rows[0];
    ok(`Connected to database "${r.db}"`);
    if (r.tz === 'Asia/Karachi') ok('Database timezone is Asia/Karachi'); else bad(`Database timezone is ${r.tz} (expected Asia/Karachi: run schema.sql)`);
    if (!r.has_schema) bad('Tables not found: run supabase/schema.sql in the Supabase SQL Editor');
    else {
      const v = (await pool.query('SELECT string_agg(name, \', \' ORDER BY name) AS v FROM schema_migrations')).rows[0].v;
      ok(`Tables created (schema version: ${v})`);
      const open = (await pool.query(`SELECT string_agg(tablename, ', ') AS t FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity`)).rows[0].t;
      if (open) bad(`Row level security is off on: ${open}`); else ok('All tables are locked against the public Data API (row level security on)');
      const anon = (await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') AS has_anon`)).rows[0].has_anon;
      if (anon) {
        const g = (await pool.query(`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated')`)).rows[0].n;
        if (g) bad(`${g} table permissions are still granted to the public API roles`); else ok('Public API roles (anon, authenticated) have no access to the tables');
      }
      const users = (await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
      ok(users ? `${users} FAISAL HOMES user(s) exist` : 'No users yet: open the web app and create the administrator');
      const b = (await pool.query(`SELECT to_regclass('storage.buckets') IS NOT NULL AS x`)).rows[0].x
        && (await pool.query(`SELECT public FROM storage.buckets WHERE id = $1`, [config.storageBucket])).rows[0];
      if (!b) bad(`Storage bucket "${config.storageBucket}" not found (run schema.sql)`);
      else if (b.public) bad(`Storage bucket "${config.storageBucket}" is PUBLIC: make it private in Supabase → Storage`);
      else ok(`Storage bucket "${config.storageBucket}" exists and is private`);
    }
  } catch (e) {
    const why = e.message || e.code || (e.errors && e.errors.map((x) => x.code || x.message).join(', ')) || String(e);
    bad(`Database: cannot connect (${why}). Check DATABASE_URL and the database password.`);
  } finally {
    await pool.end().catch(() => {});
  }

  if (config.supabaseUrl && config.supabaseAnonKey) {
    try {
      const r = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseAnonKey } });
      if (r.ok) {
        const s = await r.json();
        ok('Supabase Auth is reachable');
        if (s.external && s.external.email === false) bad('Email + password sign-in is turned off: enable the Email provider in Supabase → Authentication → Sign In / Providers');
        if (s.disable_signup) ok('Public sign-ups are off (staff logins are created by the administrator)');
        else results.push(['WARN', 'Public sign-ups are on: turn off "Allow new users to sign up" in Supabase → Authentication → Sign In / Providers (after you create the administrator, it is not needed)']);
      } else bad(`Supabase Auth answered HTTP ${r.status} (check SUPABASE_URL and SUPABASE_ANON_KEY)`);
      const k = await fetch(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`, { headers: { apikey: config.supabaseAnonKey } });
      const keys = k.ok ? (await k.json()).keys || [] : [];
      if (keys.length) ok(`Login tokens are checked with Supabase's signing keys (${keys.map((x) => x.alg).join(', ')})`);
      else if (config.supabaseJwtSecret) ok('Login tokens are checked with SUPABASE_JWT_SECRET (legacy key)');
      else ok('Login tokens are checked by asking Supabase Auth (legacy key; set SUPABASE_JWT_SECRET to make this faster)');
    } catch (e) { bad(`Supabase Auth: ${e.message}`); }
  }

  if (config.supabaseServiceKey && config.supabaseUrl) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const c = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await c.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) bad(`Service role key not accepted: ${error.message}`); else ok('Service role key works (the server can create staff logins)');
      const { error: se } = await c.storage.from(config.storageBucket).list('', { limit: 1 });
      if (se) bad(`Storage not reachable with the service role key: ${se.message}`); else ok('Storage is reachable with the service role key');
    } catch (e) { bad(`Supabase admin: ${e.message}`); }
  }

  for (const [s, m] of results) console.log(`${s} ${m}`);
  const failed = results.filter(([s]) => s === 'FAIL').length;
  console.log(failed ? `\n${failed} problem(s) found.` : '\nEverything is ready.');
  process.exit(failed ? 1 : 0);
}
main();
