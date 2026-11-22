'use strict';
const path = require('path');
require('dotenv').config({ path: process.env.FH_ENV_FILE || path.resolve(__dirname, '../../.env'), quiet: true });

const root = path.resolve(__dirname, '../..');
const env = (...names) => names.map((n) => process.env[n]).find((v) => v !== undefined && v !== '');

/**
 * Connection string without ssl* query parameters: node-postgres would let them override the ssl
 * settings below (and treats sslmode=require as full verification). SSL is configured explicitly instead.
 */
function cleanDatabaseUrl(raw) {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (/^ssl/i.test(k) || k === 'supa' || k === 'pgbouncer') u.searchParams.delete(k);
    return u.toString();
  } catch { return raw; }
}

const databaseUrl = env('DATABASE_URL', 'POSTGRES_URL') || 'postgres://postgres:postgres@localhost:5432/faisal_homes';
const dbHost = (() => { try { return new URL(databaseUrl).hostname; } catch { return ''; } })();
const localDb = ['localhost', '127.0.0.1', '::1'].includes(dbHost);

/**
 * SSL to the database: off for a local database, otherwise encrypted. With DATABASE_CA_CERT (the
 * Supabase certificate, PEM text) the server's identity is verified as well.
 */
function databaseSsl() {
  if (process.env.DATABASE_SSL === 'false' || (localDb && process.env.DATABASE_SSL !== 'true')) return false;
  const ca = env('DATABASE_CA_CERT');
  return ca ? { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true } : { rejectUnauthorized: false };
}

const supabaseUrl = (env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL') || '').replace(/\/+$/, '');

module.exports = {
  root,
  env: process.env.NODE_ENV || 'development',
  onVercel: !!process.env.VERCEL,
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: cleanDatabaseUrl(databaseUrl),
  databaseSsl: databaseSsl(),
  dbPoolMax: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
  timezone: process.env.APP_TIMEZONE || 'Asia/Karachi',
  supabaseUrl,
  supabaseAnonKey: env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY') || '',
  supabaseServiceKey: env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY') || '',
  supabaseJwtSecret: env('SUPABASE_JWT_SECRET') || '',
  storageBucket: env('STORAGE_BUCKET') || 'documents',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  clientDist: path.join(root, 'client', 'dist'),
};
