'use strict';
const { ZodError } = require('zod');
const { AppError } = require('../lib/errors');

const UNIQUE_MESSAGES = {
  customers_cnic_uq: 'A customer with this CNIC already exists',
  plots_no_uq: 'This plot number already exists in this block',
  blocks_name_uq: 'A block with this name already exists in this society',
  societies_name_uq: 'A society with this name already exists',
  users_email_uq: 'A user with this email already exists',
  documents_stored_name_key: 'This file has already been saved',
  bookings_one_active_per_plot: 'This plot already has an active booking. It cannot be booked or sold twice.',
  expense_categories_name_uq: 'This category already exists',
  investors_name_uq: 'An investor with this name already exists',
};

/**
 * Plain-language reason when the database cannot be used at all (wrong or missing DATABASE_URL, password,
 * SSL, tables not created). No host names or passwords are included. Returns null for ordinary errors.
 */
function databaseProblem(err) {
  const code = err?.code || err?.errors?.[0]?.code || '';
  const msg = String(err?.message || '');
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) {
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) return 'DATABASE_URL is not set on the server (Vercel → Settings → Environment Variables), then redeploy';
    return `cannot connect to the database host (${code}). Use the Supabase "Transaction pooler" connection string (port 6543), not the direct db.…supabase.co address`;
  }
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'the database password in DATABASE_URL is wrong (special characters must be URL-encoded: @ → %40, # → %23, / → %2F)';
  if (/tenant or user not found/i.test(msg)) return 'the user name in DATABASE_URL is wrong: it must be postgres.<your-project-ref>, copied from Supabase → Connect → Transaction pooler';
  if (code === '3D000') return 'the database name in DATABASE_URL is wrong (it should end with /postgres)';
  if (/certificate|SSL|self.signed/i.test(`${code} ${msg}`)) return `SSL problem (${code || 'certificate'}): remove DATABASE_CA_CERT or paste the full Supabase certificate`;
  if (code === '42P01' && /relation "(settings|users|counters)" does not exist/.test(msg)) return 'the tables do not exist yet: run supabase/schema.sql in the Supabase SQL Editor';
  if ((code === '42P01' && /relation "investors" does not exist/.test(msg)) || (code === '42703' && /investor_id/.test(msg))) {
    return 'it needs the investors update: run supabase/migrations/002_investors.sql in the Supabase SQL Editor';
  }
  if (/timeout exceeded when trying to connect|Connection terminated/i.test(msg)) return 'the database did not answer in time. Check DATABASE_URL (Transaction pooler, port 6543) and that the Supabase project is not paused';
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const db = databaseProblem(err);
  if (db) {
    console.error('[database]', req.method, req.originalUrl, err?.code || '', err?.message || err);
    return res.status(503).json({ error: `The database cannot be used: ${db}.`, code: 'DATABASE_UNAVAILABLE' });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.join('.') || '';
    return res.status(400).json({ error: first?.message || 'Invalid input', field, code: 'VALIDATION', issues: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err && err.code === '23505') {
    return res.status(409).json({ error: UNIQUE_MESSAGES[err.constraint] || 'Duplicate record', code: 'DUPLICATE' });
  }
  if (err && err.code === '23503') {
    return res.status(409).json({ error: 'This record is linked to other records and cannot be changed this way', code: 'FK' });
  }
  if (err && err.code === '23514') {
    return res.status(400).json({ error: `Invalid value (${err.constraint || 'check failed'})`, code: 'CHECK' });
  }
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Something went wrong. The action was not saved. Please try again.', code: 'SERVER_ERROR' });
}
module.exports = { errorHandler };
