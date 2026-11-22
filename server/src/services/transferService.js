'use strict';
const { toPaisa, fromPaisa, formatPKR } = require('../lib/money');
const { nextNumber } = require('../lib/counters');
const { refreshBookingState } = require('../lib/allocation');
const { audit } = require('../lib/audit');
const { today } = require('../lib/dates');
const { addCharge } = require('./bookingService');
const { recordPayment } = require('./paymentService');
const { AppError, badRequest, conflict, notFound } = require('../lib/errors');

async function duesCheck(db, bookingId) {
  const r = (await db.query(`SELECT b.id, b.booking_no, b.status, b.customer_id, b.final_price, f.paid, f.balance, f.overdue_amount, f.overdue_count, f.charges_due
    FROM bookings b JOIN v_booking_finance f ON f.booking_id = b.id WHERE b.id=$1`, [bookingId])).rows[0];
  if (!r) throw notFound('Booking');
  return { ...r, clear: toPaisa(r.overdue_amount) === 0 && toPaisa(r.charges_due) === 0 };
}

async function createTransfer(c, req, x) {
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [x.booking_id])).rows[0];
  if (!b) throw notFound('Booking');
  if (b.status !== 'ACTIVE') throw conflict('Only active bookings can be transferred');
  if (b.customer_id === x.to_customer_id) throw badRequest('The new owner must be a different customer');
  const to = (await c.query('SELECT * FROM customers WHERE id=$1', [x.to_customer_id])).rows[0];
  if (!to) throw notFound('New owner');
  if (to.is_archived) throw badRequest('The new owner is archived');
  if (x.transfer_date > today()) throw badRequest('Transfer date cannot be in the future');
  if (x.transfer_date < b.booking_date) throw badRequest('Transfer date cannot be before the booking date');
  const lastTransfer = (await c.query('SELECT MAX(transfer_date) AS d FROM transfers WHERE booking_id=$1', [b.id])).rows[0].d;
  if (lastTransfer && x.transfer_date < lastTransfer) throw badRequest(`Transfer date cannot be before the previous transfer (${lastTransfer})`);

  const d = await duesCheck(c, b.id);
  if (!d.clear) {
    if (!x.override_dues) {
      throw new AppError(409, `Pending dues must be cleared before transfer: overdue ${formatPKR(d.overdue_amount)}, unpaid charges ${formatPKR(d.charges_due)}`, 'DUES_PENDING', d);
    }
    if (!x.override_reason) throw badRequest('Enter the reason for allowing transfer with pending dues');
  }
  const no = await nextNumber(c, 'transfer');
  const t = (await c.query(`INSERT INTO transfers (transfer_no, booking_id, plot_id, from_customer_id, to_customer_id, transfer_date, transfer_fee, fee_paid_by,
      final_price, paid_at_transfer, balance_at_transfer, overdue_at_transfer, unpaid_charges_at_transfer, dues_override, override_reason, witness_1, witness_2,
      notes, approved_by, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING *`,
  [no, b.id, b.plot_id, b.customer_id, to.id, x.transfer_date, x.transfer_fee || 0, x.fee_paid_by || 'FROM', b.final_price, d.paid, d.balance,
    d.overdue_amount, d.charges_due, !d.clear, d.clear ? null : x.override_reason, x.witness_1 || null, x.witness_2 || null, x.notes || null, req.user.id])).rows[0];

  await c.query('UPDATE ownership_history SET end_date=$2, ended_via=$3 WHERE booking_id=$1 AND end_date IS NULL', [b.id, x.transfer_date, 'TRANSFER']);
  await c.query(`INSERT INTO ownership_history (plot_id, booking_id, customer_id, start_date, acquired_via, transfer_id) VALUES ($1,$2,$3,$4,'TRANSFER',$5)`,
    [b.plot_id, b.id, to.id, x.transfer_date, t.id]);
  await c.query('UPDATE bookings SET customer_id=$2, transfer_count=transfer_count+1, updated_at=now(), updated_by=$3 WHERE id=$1', [b.id, to.id, req.user.id]);

  let payment = null;
  if (toPaisa(x.transfer_fee) > 0) {
    const ch = await addCharge(c, req, b.id, { charge_type: 'TRANSFER_FEE', amount: x.transfer_fee, description: `Transfer fee ${no}`, charge_date: x.transfer_date, transfer_id: t.id });
    if (x.fee_paid_now) {
      payment = await recordPayment(c, req, {
        booking_id: b.id, purpose: 'CHARGE', charge_id: ch.id, amount: x.transfer_fee, payment_date: x.transfer_date,
        method: x.fee_method || 'CASH', reference_no: x.fee_reference, notes: `Transfer fee ${no}`,
        customer_id: x.fee_paid_by === 'TO' ? to.id : b.customer_id,
      });
    }
  }
  await refreshBookingState(c, b.id);
  await audit(c, req, {
    action: 'CREATE', entity: 'transfer', entityId: t.id,
    summary: `Transfer ${no}: ${b.booking_no} from customer #${b.customer_id} to ${to.full_name}${t.dues_override ? ` (dues override: ${x.override_reason})` : ''}`, after: t,
  });
  return { transfer: t, payment };
}

module.exports = { createTransfer, duesCheck };
