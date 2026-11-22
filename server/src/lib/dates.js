'use strict';
const config = require('../config');
const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** Today's date in the business timezone (Asia/Karachi by default), 'YYYY-MM-DD'. */
function today(tz = config.timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
/** Business-timezone calendar date ('YYYY-MM-DD') of a timestamp (Date object or ISO string). */
function dateOf(ts, tz = config.timezone) {
  if (!ts) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts instanceof Date ? ts : new Date(ts));
}
function nowParts(tz = config.timezone) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return { date: today(tz), time: f.format(new Date()) };
}
/** Add months keeping the day where possible (31 Jan + 1 month = 28/29 Feb). */
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, dim))}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
/** 'YYYY-MM-DD' -> 'DD-MM-YYYY' */
function fmtDate(s) {
  if (!s) return '';
  const str = typeof s === 'string' ? s.slice(0, 10) : new Date(s).toISOString().slice(0, 10);
  const [y, m, d] = str.split('-');
  return `${d}-${m}-${y}`;
}
function monthStart(dateStr) { return `${dateStr.slice(0, 7)}-01`; }
function monthEnd(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
module.exports = { isDate, today, nowParts, addMonths, addDays, daysBetween, fmtDate, monthStart, monthEnd, pad, dateOf };
