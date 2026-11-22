'use strict';
const { toPaisa } = require('./money');
const { addMonths, isDate } = require('./dates');
const { badRequest } = require('./errors');

const STEP = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };
const LABEL = { MONTHLY: 'Monthly Installment', QUARTERLY: 'Quarterly Installment', HALF_YEARLY: 'Half-Yearly Installment', YEARLY: 'Yearly Installment' };
const KIND_ORDER = { BOOKING: 0, DOWN_PAYMENT: 1 };
const KINDS = ['BOOKING', 'DOWN_PAYMENT', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'BALLOON', 'FULL', 'CUSTOM'];
const PLAN_TYPES = ['FULL', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'];

const rs = (p) => (p / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

function sortAndNumber(rows) {
  rows.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1
    : (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)));
  rows.forEach((r, i) => { r.seq_no = i + 1; });
  return rows;
}

/**
 * Build a payment schedule. Input amounts are rupees; output amounts are integer paisa.
 * The schedule total always equals the final price exactly (last installment absorbs rounding).
 */
function generateSchedule({ finalPrice, bookingAmount = 0, bookingDate, downPayment = 0, downPaymentDate, plan = {} }) {
  if (!isDate(bookingDate)) throw badRequest('Booking date is required');
  const type = plan.type;
  if (!PLAN_TYPES.includes(type)) throw badRequest('Select a payment plan');
  const fp = toPaisa(finalPrice);
  const bk = toPaisa(bookingAmount);
  const dp = toPaisa(downPayment);
  if (fp < 0) throw badRequest('Final price cannot be negative');
  if (bk + dp > fp) throw badRequest('Booking amount + down payment cannot be more than the final price');
  let remaining = fp - bk - dp;
  const rows = [];
  if (bk > 0) rows.push({ kind: 'BOOKING', label: 'Booking Amount', due_date: bookingDate, amount: bk });
  if (dp > 0) {
    const d = downPaymentDate || bookingDate;
    if (!isDate(d)) throw badRequest('Down payment date is invalid');
    if (d < bookingDate) throw badRequest('Down payment date cannot be before the booking date');
    rows.push({ kind: 'DOWN_PAYMENT', label: 'Down Payment', due_date: d, amount: dp });
  }

  if (type === 'FULL') {
    if (remaining > 0) {
      const d = plan.full_due_date || bookingDate;
      if (!isDate(d)) throw badRequest('Full payment due date is invalid');
      rows.push({ kind: 'FULL', label: 'Full Payment (Balance)', due_date: d, amount: remaining });
    }
  } else if (type === 'CUSTOM') {
    const custom = Array.isArray(plan.custom_rows) ? plan.custom_rows : [];
    let sum = 0;
    custom.forEach((r, i) => {
      if (!isDate(r.due_date)) throw badRequest(`Custom row ${i + 1}: due date is invalid`);
      const a = toPaisa(r.amount);
      if (a <= 0) throw badRequest(`Custom row ${i + 1}: amount must be greater than 0`);
      sum += a;
      rows.push({ kind: 'CUSTOM', label: (r.label && String(r.label).trim()) || `Installment ${i + 1}`, due_date: r.due_date, amount: a });
    });
    if (sum !== remaining) {
      throw badRequest(`Custom schedule total (Rs ${rs(sum)}) must equal the remaining balance (Rs ${rs(remaining)})`);
    }
  } else {
    const step = STEP[type];
    const n = parseInt(plan.installments, 10);
    const bc = parseInt(plan.balloon_count || 0, 10) || 0;
    const ba = toPaisa(plan.balloon_amount || 0);
    const every = parseInt(plan.balloon_every || 6, 10) || 6;
    if (bc < 0 || bc > 200) throw badRequest('Number of extra (balloon) payments is invalid');
    if (bc > 0 && ba <= 0) throw badRequest('Enter the amount of each extra (balloon) payment');
    const balloonTotal = bc * ba;
    if (balloonTotal > remaining) throw badRequest(`Extra payments total (Rs ${rs(balloonTotal)}) is more than the remaining balance (Rs ${rs(remaining)})`);
    const instTotal = remaining - balloonTotal;
    const start = plan.start_date || addMonths(bookingDate, step);
    if (!isDate(start)) throw badRequest('First installment date is invalid');
    if (instTotal > 0) {
      if (!Number.isInteger(n) || n < 1 || n > 600) throw badRequest('Number of installments must be between 1 and 600');
      const round = Math.max(1, toPaisa(plan.rounding || 1));
      let per = Math.floor(instTotal / n / round) * round;
      if (per <= 0) per = Math.floor(instTotal / n);
      const last = instTotal - per * (n - 1);
      for (let i = 0; i < n; i++) {
        rows.push({ kind: type, label: `${LABEL[type]} ${i + 1} of ${n}`, due_date: addMonths(start, i * step), amount: i === n - 1 ? last : per });
      }
    }
    if (bc > 0) {
      const bstart = plan.balloon_start || addMonths(bookingDate, every);
      if (!isDate(bstart)) throw badRequest('First extra payment date is invalid');
      const name = every === 6 ? 'Half-Yearly Payment' : every === 12 ? 'Yearly Payment' : every === 3 ? 'Quarterly Payment' : 'Extra Payment';
      for (let j = 0; j < bc; j++) {
        rows.push({ kind: 'BALLOON', label: `${name} ${j + 1} of ${bc}`, due_date: addMonths(bstart, j * every), amount: ba });
      }
    }
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total !== fp) throw badRequest(`Schedule total (Rs ${rs(total)}) does not match final price (Rs ${rs(fp)})`);
  return sortAndNumber(rows);
}

/** Validate a manually edited schedule. Rows: {kind,label,due_date,amount(rupees)}. Returns paisa rows. */
function validateManualSchedule(rows, finalPrice) {
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('Schedule must have at least one row');
  if (rows.length > 1000) throw badRequest('Too many schedule rows');
  const out = rows.map((r, i) => {
    if (!isDate(r.due_date)) throw badRequest(`Row ${i + 1}: due date is invalid`);
    const amount = toPaisa(r.amount);
    if (amount <= 0) throw badRequest(`Row ${i + 1}: amount must be greater than 0`);
    const kind = KINDS.includes(r.kind) ? r.kind : 'CUSTOM';
    const label = (r.label && String(r.label).trim()) || `Installment ${i + 1}`;
    return { kind, label: label.slice(0, 120), due_date: r.due_date, amount };
  });
  const total = out.reduce((s, r) => s + r.amount, 0);
  const fp = toPaisa(finalPrice);
  if (total !== fp) throw badRequest(`Schedule total (Rs ${rs(total)}) must equal the final price (Rs ${rs(fp)}). Difference: Rs ${rs(fp - total)}`);
  return sortAndNumber(out);
}

module.exports = { generateSchedule, validateManualSchedule, PLAN_TYPES, KINDS };
