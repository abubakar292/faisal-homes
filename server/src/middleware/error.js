'use strict';
const { ZodError } = require('zod');
const { AppError } = require('../lib/errors');

const UNIQUE_MESSAGES = {
  customers_cnic_uq: 'A customer with this CNIC already exists',
  plots_no_uq: 'This plot number already exists in this block',
  blocks_name_uq: 'A block with this name already exists in this society',
  societies_name_uq: 'A society with this name already exists',
  users_username_uq: 'This username is already taken',
  bookings_one_active_per_plot: 'This plot already has an active booking. It cannot be booked or sold twice.',
  expense_categories_name_uq: 'This category already exists',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
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
