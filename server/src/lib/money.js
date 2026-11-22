'use strict';
// All money maths is done in integer paisa (1 rupee = 100 paisa) to avoid floating point errors.
const { AppError } = require('./errors');

function toPaisa(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) throw new AppError(400, `Invalid amount: ${v}`);
  return Math.round(n * 100);
}
/** paisa -> '1234.50' string suitable for NUMERIC columns */
function fromPaisa(p) {
  const neg = p < 0;
  const a = Math.abs(Math.round(p));
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
/** NUMERIC string -> JS number (for display/JSON only, never for further maths) */
function num(v) { return v === null || v === undefined ? 0 : Number(v); }

function groupDigits(intStr, style) {
  if (style === 'lakh' && intStr.length > 3) {
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${rest},${last3}`;
  }
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** Format a rupee amount: 'Rs 1,234,567' (intl) or 'Rs 12,34,567' (lakh). Shows paisa only when non-zero. */
function formatPKR(value, style = 'intl', { symbol = true } = {}) {
  const p = toPaisa(value);
  const neg = p < 0;
  const a = Math.abs(p);
  const intPart = groupDigits(String(Math.floor(a / 100)), style);
  const dec = a % 100 ? `.${String(a % 100).padStart(2, '0')}` : '';
  return `${neg ? '-' : ''}${symbol ? 'Rs ' : ''}${intPart}${dec}`;
}

module.exports = { toPaisa, fromPaisa, num, formatPKR };
