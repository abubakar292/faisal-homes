'use strict';
const { toPaisa, fromPaisa, formatPKR } = require('../lib/money');
const { nextNumber } = require('../lib/counters');
const { reallocate, refreshBookingState } = require('../lib/allocation');
const { audit } = require('../lib/audit');
const { today } = require('../lib/dates');
const { badRequest, conflict, notFound } = require('../lib/errors');

async function paidOnBooking(c, bookingId) {
  return toPaisa((await c.query(
    `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE booking_id=$1 AND purpose='INSTALLMENT' AND status='VALID'`, [bookingId])).rows[0].s);
}

/**
 * Record a payment inside an existing transaction. Locks the booking row so two cashiers
 * cannot over-collect the same balance at the same moment.
 */
async function recordPayment(c, req, p) {
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [p.booking_id])).rows[0];
  if (!b) throw notFound('Booking');
  if (b.status !== 'ACTIVE') throw conflict('Payments can only be received on active bookings');
  const amountP = toPaisa(p.amount);
  if (amountP <= 0) throw badRequest('Amount received must be greater than 0');
  if (p.payment_date > today()) throw badRequest('Payment date cannot be in the future');
  if (p.payment_date < b.booking_date && p.purpose === 'INSTALLMENT') throw badRequest('Payment date cannot be before the booking date');
  if (p.method === 'CHEQUE' && !p.reference_no) throw badRequest('Enter the cheque number in the reference field');

  const finalP = toPaisa(b.final_price);
  const paidBefore = await paidOnBooking(c, b.id);
  const balanceBefore = finalP - paidBefore;
  let balanceAfter = balanceBefore;
  let charge = null;

  if (p.purpose === 'CHARGE') {
    // The booking row lock above serialises all payments of this booking, so reading the view is safe.
    charge = (await c.query('SELECT * FROM v_charge_finance WHERE id=$1 AND booking_id=$2', [p.charge_id, b.id])).rows[0];
    if (!charge) throw notFound('Charge');
    if (charge.status !== 'ACTIVE') throw conflict('This charge has been waived');
    const dueP = toPaisa(charge.due);
    if (amountP > dueP) throw badRequest(`Amount is more than the charge due (${formatPKR(fromPaisa(dueP))})`);
  } else {
    if (amountP > balanceBefore) {
      throw badRequest(`Amount is more than the remaining balance (${formatPKR(fromPaisa(balanceBefore))}). Over-payment is not allowed.`);
    }
    balanceAfter = balanceBefore - amountP;
  }

  const receiptNo = await nextNumber(c, 'receipt');
  const customerId = p.customer_id || b.customer_id;
  const pay = (await c.query(
    `INSERT INTO payments (receipt_no, booking_id, customer_id, plot_id, purpose, charge_id, payment_date, amount, method, reference_no, bank_name, notes,
       final_price_snapshot, balance_before, balance_after, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [receiptNo, b.id, customerId, b.plot_id, p.purpose, charge ? charge.id : null, p.payment_date, fromPaisa(amountP), p.method,
      p.reference_no || null, p.bank_name || null, p.notes || null, b.final_price, fromPaisa(balanceBefore), fromPaisa(balanceAfter), req.user.id])).rows[0];

  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, booking_id, customer_id, plot_id, description, created_by)
     VALUES ($1,'PAYMENT_RECEIVED','IN',$2,$3,'payment',$4,$5,$6,$7,$8,$9,$10)`,
    [p.payment_date, pay.amount, p.method, pay.id, receiptNo, b.id, customerId, b.plot_id,
      charge ? `${charge.description} (${b.booking_no})` : `Installment payment ${b.booking_no}`, req.user.id]);

  if (p.purpose === 'INSTALLMENT') {
    await reallocate(c, b.id);
    await refreshBookingState(c, b.id);
  }
  await audit(c, req, { action: 'CREATE', entity: 'payment', entityId: pay.id, summary: `Receipt ${receiptNo}: ${formatPKR(pay.amount)} received (${p.method}) for ${b.booking_no}`, after: pay });
  return pay;
}

async function reversePayment(c, req, paymentId, reason) {
  const pay = (await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [paymentId])).rows[0];
  if (!pay) throw notFound('Payment');
  if (pay.status === 'REVERSED') throw conflict('This receipt is already reversed');
  const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [pay.booking_id])).rows[0];
  if (b.status !== 'ACTIVE') throw conflict('Payments on a cancelled booking cannot be reversed (the cancellation already settled them)');
  // Customer money that was used to pay for land must stay linked to its receipt.
  const used = (await c.query(`SELECT COALESCE(SUM(a.amount),0) AS s, string_agg(DISTINCT COALESCE(lp.payment_no, e.expense_no), ', ') AS refs
    FROM fund_allocations a LEFT JOIN land_payments lp ON lp.id = a.land_payment_id LEFT JOIN expenses e ON e.id = a.expense_id
    WHERE a.payment_id = $1 AND a.status = 'ACTIVE'`, [pay.id])).rows[0];
  if (toPaisa(used.s) > 0) {
    throw conflict(`${formatPKR(used.s)} of receipt ${pay.receipt_no} was used to pay for land (${used.refs}). Reverse that land payment first.`);
  }
  await c.query(`UPDATE payments SET status='REVERSED', reversed_at=now(), reversed_by=$2, reversal_reason=$3 WHERE id=$1`, [pay.id, req.user.id, reason]);
  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, booking_id, customer_id, plot_id, description, created_by)
     VALUES ($1,'PAYMENT_REVERSED','OUT',$2,$3,'payment',$4,$5,$6,$7,$8,$9,$10)`,
    [today(), pay.amount, pay.method, pay.id, pay.receipt_no, pay.booking_id, pay.customer_id, pay.plot_id, `Reversal of ${pay.receipt_no}: ${reason}`, req.user.id]);
  if (pay.purpose === 'INSTALLMENT') {
    await reallocate(c, b.id);
    await refreshBookingState(c, b.id);
  }
  await audit(c, req, { action: 'REVERSE', entity: 'payment', entityId: pay.id, summary: `Receipt ${pay.receipt_no} (${formatPKR(pay.amount)}) reversed: ${reason}`, before: pay });
  return { ...pay, status: 'REVERSED' };
}

module.exports = { recordPayment, reversePayment, paidOnBooking };
