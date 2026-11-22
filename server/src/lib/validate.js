'use strict';
const { z } = require('zod');
const { isDate } = require('./dates');

const trimmed = z.string().trim();
const optText = z.union([z.string(), z.null(), z.undefined()]).transform((v) => (v === null || v === undefined ? null : String(v).trim() || null));
const reqText = (label) => z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`);

const money = (label = 'Amount') => z.union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim() || '0');
    if (!Number.isFinite(n)) { ctx.addIssue({ code: 'custom', message: `${label} must be a number` }); return z.NEVER; }
    if (n < 0) { ctx.addIssue({ code: 'custom', message: `${label} cannot be negative` }); return z.NEVER; }
    if (Math.round(n * 100) !== Math.round(n * 1000) / 10) { ctx.addIssue({ code: 'custom', message: `${label} can have at most 2 decimal places` }); return z.NEVER; }
    return Math.round(n * 100) / 100;
  });
const optMoney = (label) => z.union([money(label), z.null(), z.undefined(), z.literal('')]).transform((v) => (v === '' || v === null || v === undefined ? 0 : v));
const positiveNumber = (label) => z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) { ctx.addIssue({ code: 'custom', message: `${label} must be greater than 0` }); return z.NEVER; }
  return n;
});
const optNumber = (label) => z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((v, ctx) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) { ctx.addIssue({ code: 'custom', message: `${label} must be a valid number` }); return z.NEVER; }
  return n;
});
const date = (label = 'Date') => z.string({ required_error: `${label} is required` }).refine(isDate, `${label} must be a valid date (YYYY-MM-DD)`);
const optDate = (label = 'Date') => z.union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isDate(v), `${label} must be a valid date`);
const intId = (label = 'ID') => z.coerce.number({ invalid_type_error: `${label} is required` }).int().positive(`${label} is required`);
const optId = z.union([z.coerce.number().int().positive(), z.null(), z.undefined(), z.literal('')]).transform((v) => (v ? Number(v) : null));
const bool = z.union([z.boolean(), z.string(), z.number(), z.undefined(), z.null()]).transform((v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on');

/** Normalise CNIC: accepts 3520212345671 or 35202-1234567-1 → 35202-1234567-1 */
function normalizeCnic(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length !== 13) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}
const cnic = (label = 'CNIC') => z.string({ required_error: `${label} is required` }).transform((v, ctx) => {
  const n = normalizeCnic(v);
  if (!n) { ctx.addIssue({ code: 'custom', message: `${label} must have 13 digits (e.g. 35202-1234567-1)` }); return z.NEVER; }
  return n;
});
const optCnic = (label = 'CNIC') => z.union([z.string(), z.null(), z.undefined()]).transform((v, ctx) => {
  if (!v || !String(v).trim()) return null;
  const n = normalizeCnic(v);
  if (!n) { ctx.addIssue({ code: 'custom', message: `${label} must have 13 digits` }); return z.NEVER; }
  return n;
});
const phone = (label = 'Mobile') => z.union([z.string(), z.null(), z.undefined()]).transform((v, ctx) => {
  if (!v || !String(v).trim()) return null;
  const s = String(v).trim();
  if (!/^\+?[\d\s-]{7,20}$/.test(s)) { ctx.addIssue({ code: 'custom', message: `${label} is not a valid phone number` }); return z.NEVER; }
  return s;
});
const method = z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'], { errorMap: () => ({ message: 'Select a payment method' }) });

function parse(schema, data) {
  return schema.parse(data ?? {});
}

module.exports = { z, trimmed, optText, reqText, money, optMoney, positiveNumber, optNumber, date, optDate, intId, optId, bool, cnic, optCnic, phone, method, normalizeCnic, parse };

/** Reject non-numeric :id style route params with 404 instead of a database error. */
function numericParams(router, ...names) {
  const { notFound } = require('./errors');
  for (const n of names) router.param(n, (req, _res, next, v) => (/^\d{1,9}$/.test(String(v)) ? next() : next(notFound())));
}
module.exports.numericParams = numericParams;
