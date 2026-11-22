'use strict';
const { toPaisa, fromPaisa, formatPKR } = require('../lib/money');
const { nextNumber } = require('../lib/counters');
const { generateSchedule, validateManualSchedule } = require('../lib/schedule');
const { reallocate, refreshBookingState } = require('../lib/allocation');
const { audit } = require('../lib/audit');
const { today, daysBetween } = require('../lib/dates');
const settings = require('../lib/settings');
const { recordPayment, paidOnBooking } = require('./paymentService');
const { badRequest, conflict, notFound } = require('../lib/errors');

/** Price maths for a plot: size × rate − discount (integer paisa). */
function priceFor(sizeMarla, rate, discount) {
  const totalP = Math.round(Number(sizeMarla) * Number(rate) * 100);
  const discountP = toPaisa(discount);
  if (discountP > totalP) throw badRequest('Discount cannot be more than the total price');
  return { totalP, discountP, finalP: totalP - discountP };
}

function cleanPlan(plan) {
  const keep = ['type', 'installments', 'start_date', 'rounding', 'balloon_count', 'balloon_amount', 'balloon_every', 'balloon_start', 'full_due_date'];
  const out = {};
  for (const k of keep) if (plan[k] !== undefined && plan[k] !== null && plan[k] !== '') out[k] = plan[k];
  return out;
}

async function insertSchedule(c, bookingId, rows) {
  if (!rows.length) return;
  await c.query(
    `INSERT INTO installments (booking_id, seq_no, kind, label, due_date, amount)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::date[], $6::numeric[])`,
    [bookingId, rows.map((r) => r.seq_no), rows.map((r) => r.kind), rows.map((r) => r.label), rows.map((r) => r.due_date), rows.map((r) => fromPaisa(r.amount))]);
}

/** Preview (no database writes) used by the booking screen. */
async function previewBooking(db, b) {
  const plot = (await db.query('SELECT * FROM plots WHERE id=$1', [b.plot_id])).rows[0];
  if (!plot) throw notFound('Plot');
  const { totalP, discountP, finalP } = priceFor(plot.size_marla, b.rate_per_marla, b.discount);
  const rows = generateSchedule({
    finalPrice: fromPaisa(finalP), bookingAmount: b.booking_amount, bookingDate: b.booking_date,
    downPayment: b.down_payment, downPaymentDate: b.down_payment_date, plan: b.plan,
  });
  return {
    size_marla: plot.size_marla, total_price: fromPaisa(totalP), discount: fromPaisa(discountP), final_price: fromPaisa(finalP),
    remaining_after_booking: fromPaisa(finalP - toPaisa(b.booking_amount)),
    schedule: rows.map((r) => ({ ...r, amount: fromPaisa(r.amount) })),
  };
}

async function createBooking(c, req, b) {
  // Lock the plot row: a second booking attempt on the same plot waits here and then fails the status check.
  const plot = (await c.query('SELECT * FROM plots WHERE id=$1 FOR UPDATE', [b.plot_id])).rows[0];
  if (!plot) throw notFound('Plot');
  if (!['AVAILABLE', 'RESERVED'].includes(plot.status)) throw conflict(`Plot ${plot.plot_no} is ${plot.status} and cannot be booked`);
  const active = await c.query("SELECT booking_no FROM bookings WHERE plot_id=$1 AND status='ACTIVE'", [plot.id]);
  if (active.rowCount) throw conflict(`Plot ${plot.plot_no} already has active booking ${active.rows[0].booking_no}`);
  const cust = (await c.query('SELECT * FROM customers WHERE id=$1', [b.customer_id])).rows[0];
  if (!cust) throw notFound('Customer');
  if (cust.is_archived) throw badRequest('This customer is archived. Restore the customer first.');
  if (b.booking_date > today()) throw badRequest('Booking date cannot be in the future');

  const { totalP, discountP, finalP } = priceFor(plot.size_marla, b.rate_per_marla, b.discount);
  const rows = generateSchedule({
    finalPrice: fromPaisa(finalP), bookingAmount: b.booking_amount, bookingDate: b.booking_date,
    downPayment: b.down_payment, downPaymentDate: b.down_payment_date, plan: b.plan,
  });
  const bookingNo = await nextNumber(c, 'booking');
  const booking = (await c.query(
    `INSERT INTO bookings (booking_no, plot_id, customer_id, original_customer_id, booking_date, size_marla, rate_per_marla, total_price, discount,
       final_price, booking_amount, down_payment, plan_type, plan_config, sales_person, notes, created_by, updated_by)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING *`,
    [bookingNo, plot.id, cust.id, b.booking_date, plot.size_marla, b.rate_per_marla, fromPaisa(totalP), fromPaisa(discountP), fromPaisa(finalP),
      b.booking_amount, b.down_payment || 0, b.plan.type, JSON.stringify(cleanPlan(b.plan)), b.sales_person || null, b.notes || null, req.user.id])).rows[0];
  await insertSchedule(c, booking.id, rows);
  await c.query(`INSERT INTO ownership_history (plot_id, booking_id, customer_id, start_date, acquired_via) VALUES ($1,$2,$3,$4,'BOOKING')`,
    [plot.id, booking.id, cust.id, b.booking_date]);
  await c.query('UPDATE plots SET current_booking_id=$2, status=$3, updated_at=now(), updated_by=$4 WHERE id=$1',
    [plot.id, booking.id, 'BOOKED', req.user.id]);
  await audit(c, req, {
    action: 'CREATE', entity: 'booking', entityId: booking.id,
    summary: `Booking ${bookingNo}: plot ${plot.plot_no} to ${cust.full_name} for ${formatPKR(fromPaisa(finalP))} (${b.plan.type})`, after: { ...booking, schedule_rows: rows.length },
  });

  let payment = null;
  if (toPaisa(b.booking_amount) > 0 && b.receive_booking_amount !== false) {
    payment = await recordPayment(c, req, {
      booking_id: booking.id, purpose: 'INSTALLMENT', amount: b.booking_amount, payment_date: b.booking_date,
      method: b.payment?.method || 'CASH', reference_no: b.payment?.reference_no, bank_name: b.payment?.bank_name,
      notes: b.payment?.notes || 'Booking amount',
    });
  }
  await refreshBookingState(c, booking.id);
  return { booking, payment };
}

async function updateSchedule(c, req, bookingId, rows, reason) {
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
  if (!b) throw notFound('Booking');
  if (b.status !== 'ACTIVE') throw conflict('Only active bookings can be rescheduled');
  const newRows = validateManualSchedule(rows, b.final_price);
  const old = (await c.query('SELECT seq_no, kind, label, due_date, amount, paid_amount FROM installments WHERE booking_id=$1 ORDER BY seq_no', [b.id])).rows;
  await c.query('DELETE FROM payment_allocations WHERE installment_id IN (SELECT id FROM installments WHERE booking_id=$1)', [b.id]);
  await c.query('UPDATE charges SET installment_id = NULL WHERE installment_id IN (SELECT id FROM installments WHERE booking_id=$1)', [b.id]);
  await c.query('DELETE FROM installments WHERE booking_id=$1', [b.id]);
  await insertSchedule(c, b.id, newRows);
  const newJson = newRows.map((r) => ({ ...r, amount: fromPaisa(r.amount) }));
  await c.query('INSERT INTO schedule_revisions (booking_id, reason, old_schedule, new_schedule, created_by) VALUES ($1,$2,$3,$4,$5)',
    [b.id, reason, JSON.stringify(old), JSON.stringify(newJson), req.user.id]);
  await reallocate(c, b.id);
  await refreshBookingState(c, b.id);
  await c.query('UPDATE bookings SET updated_at=now(), updated_by=$2 WHERE id=$1', [b.id, req.user.id]);
  await audit(c, req, { action: 'UPDATE', entity: 'booking', entityId: b.id, summary: `Schedule of ${b.booking_no} changed (${old.length} → ${newRows.length} rows): ${reason}`, before: { schedule: old }, after: { schedule: newJson } });
}

async function cancelBooking(c, req, bookingId, x) {
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
  if (!b) throw notFound('Booking');
  if (b.status !== 'ACTIVE') throw conflict('This booking is already cancelled');
  await c.query('SELECT id FROM plots WHERE id=$1 FOR UPDATE', [b.plot_id]);
  const paidP = await paidOnBooking(c, b.id);
  const refundP = toPaisa(x.refund_amount);
  if (refundP > paidP) throw badRequest(`Refund cannot be more than the amount paid (${formatPKR(fromPaisa(paidP))})`);
  const date = x.refund_date || today();
  if (date > today()) throw badRequest('Refund date cannot be in the future');
  if (refundP > 0 && x.refund_method === 'CHEQUE' && !x.refund_reference) throw badRequest('Enter the cheque number for the refund');

  await c.query(`UPDATE bookings SET status='CANCELLED', cancelled_at=now(), cancelled_by=$2, cancel_reason=$3, refund_amount=$4, updated_at=now(), updated_by=$2
    WHERE id=$1`, [b.id, req.user.id, x.reason, fromPaisa(refundP)]);
  let refund = null;
  if (refundP > 0) {
    const no = await nextNumber(c, 'refund');
    refund = (await c.query(`INSERT INTO refunds (refund_no, booking_id, customer_id, refund_date, amount, method, reference_no, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [no, b.id, b.customer_id, date, fromPaisa(refundP), x.refund_method || 'CASH', x.refund_reference || null, x.reason, req.user.id])).rows[0];
    await c.query(`INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, booking_id, customer_id, plot_id, description, created_by)
      VALUES ($1,'REFUND_PAID','OUT',$2,$3,'refund',$4,$5,$6,$7,$8,$9,$10)`,
    [date, refund.amount, refund.method, refund.id, no, b.id, b.customer_id, b.plot_id, `Refund on cancellation of ${b.booking_no}`, req.user.id]);
  }
  await c.query(`UPDATE charges SET status='WAIVED', waived_reason='Booking cancelled', waived_at=now(), waived_by=$2
    WHERE booking_id=$1 AND status='ACTIVE'`, [b.id, req.user.id]);
  await c.query(`UPDATE ownership_history SET end_date=$2, ended_via='CANCELLATION' WHERE booking_id=$1 AND end_date IS NULL`, [b.id, today()]);
  await c.query(`UPDATE plots SET status='AVAILABLE', current_booking_id=NULL, status_note=$2, updated_at=now(), updated_by=$3 WHERE id=$1`,
    [b.plot_id, `Previous booking ${b.booking_no} cancelled`, req.user.id]);
  await audit(c, req, {
    action: 'CANCEL', entity: 'booking', entityId: b.id,
    summary: `Booking ${b.booking_no} cancelled. Paid ${formatPKR(fromPaisa(paidP))}, refunded ${formatPKR(fromPaisa(refundP))}, retained ${formatPKR(fromPaisa(paidP - refundP))}. Reason: ${x.reason}`,
    before: b,
  });
  return { refund, paid: fromPaisa(paidP), retained: fromPaisa(paidP - refundP) };
}

async function lateFeeFor(installment, asOf = today()) {
  const lf = await settings.get('late_fee');
  if (!lf.enabled) return 0;
  const unpaidP = toPaisa(installment.amount) - toPaisa(installment.paid_amount);
  if (unpaidP <= 0) return 0;
  const days = daysBetween(installment.due_date, asOf);
  if (days <= Number(lf.grace_days || 0)) return 0;
  const feeP = lf.mode === 'PERCENT' ? Math.round((unpaidP * Number(lf.value || 0)) / 100) : toPaisa(lf.value);
  return feeP / 100;
}

async function addCharge(c, req, bookingId, x) {
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
  if (!b) throw notFound('Booking');
  if (b.status !== 'ACTIVE') throw conflict('Charges can only be added to active bookings');
  if (x.installment_id) {
    const i = (await c.query('SELECT 1 FROM installments WHERE id=$1 AND booking_id=$2', [x.installment_id, b.id])).rowCount;
    if (!i) throw badRequest('Installment does not belong to this booking');
    if (x.charge_type === 'LATE_FEE') {
      const dup = await c.query("SELECT 1 FROM charges WHERE installment_id=$1 AND charge_type='LATE_FEE' AND status='ACTIVE'", [x.installment_id]);
      if (dup.rowCount) throw conflict('A late fee is already posted for this installment');
    }
  }
  const ch = (await c.query(`INSERT INTO charges (booking_id, charge_type, description, charge_date, amount, installment_id, transfer_id, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
  [b.id, x.charge_type, x.description, x.charge_date || today(), x.amount, x.installment_id || null, x.transfer_id || null, req.user.id])).rows[0];
  await audit(c, req, { action: 'CREATE', entity: 'charge', entityId: ch.id, summary: `${x.charge_type} of ${formatPKR(ch.amount)} posted on ${b.booking_no}: ${x.description}`, after: ch });
  return ch;
}

async function waiveCharge(c, req, chargeId, reason) {
  const ch = (await c.query('SELECT * FROM charges WHERE id=$1 FOR UPDATE', [chargeId])).rows[0];
  if (!ch) throw notFound('Charge');
  if (ch.status !== 'ACTIVE') throw conflict('This charge is already waived');
  await c.query(`UPDATE charges SET status='WAIVED', waived_reason=$2, waived_at=now(), waived_by=$3 WHERE id=$1`, [ch.id, reason, req.user.id]);
  await audit(c, req, { action: 'CANCEL', entity: 'charge', entityId: ch.id, summary: `${ch.charge_type} of ${formatPKR(ch.amount)} waived: ${reason}`, before: ch });
}

module.exports = { previewBooking, createBooking, updateSchedule, cancelBooking, addCharge, waiveCharge, lateFeeFor, priceFor };
