'use strict';
const { toPaisa, fromPaisa } = require('./money');
const { conflict } = require('./errors');

/**
 * Re-apply all valid installment payments of a booking to its schedule, oldest due first.
 * Deterministic: called after every payment, reversal or schedule change.
 */
async function reallocate(client, bookingId) {
  await client.query(
    'DELETE FROM payment_allocations WHERE installment_id IN (SELECT id FROM installments WHERE booking_id = $1)', [bookingId]);
  const inst = (await client.query(
    'SELECT id, amount FROM installments WHERE booking_id = $1 ORDER BY due_date, seq_no, id', [bookingId]))
    .rows.map((r) => ({ id: r.id, due: toPaisa(r.amount), paid: 0 }));
  const pays = (await client.query(
    `SELECT id, amount FROM payments WHERE booking_id = $1 AND purpose = 'INSTALLMENT' AND status = 'VALID'
     ORDER BY payment_date, id`, [bookingId])).rows;
  const aPay = []; const aInst = []; const aAmt = [];
  let i = 0;
  for (const p of pays) {
    let left = toPaisa(p.amount);
    while (left > 0) {
      while (i < inst.length && inst[i].paid >= inst[i].due) i++;
      if (i >= inst.length) throw conflict('Payments received are more than the schedule total. Please correct the schedule first.');
      const take = Math.min(left, inst[i].due - inst[i].paid);
      inst[i].paid += take; left -= take;
      aPay.push(p.id); aInst.push(inst[i].id); aAmt.push(fromPaisa(take));
    }
  }
  if (aPay.length) {
    await client.query(
      `INSERT INTO payment_allocations (payment_id, installment_id, amount)
       SELECT * FROM unnest($1::int[], $2::int[], $3::numeric[])`, [aPay, aInst, aAmt]);
  }
  if (inst.length) {
    await client.query(
      `UPDATE installments t SET paid_amount = v.paid
       FROM (SELECT unnest($1::int[]) AS id, unnest($2::numeric[]) AS paid) v WHERE t.id = v.id`,
      [inst.map((x) => x.id), inst.map((x) => fromPaisa(x.paid))]);
  }
}

/** Recalculate paid/balance and set the plot status from the booking state. */
async function refreshBookingState(client, bookingId) {
  const b = (await client.query('SELECT id, plot_id, status, final_price, transfer_count FROM bookings WHERE id = $1', [bookingId])).rows[0];
  const paidP = toPaisa((await client.query(
    `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE booking_id = $1 AND purpose = 'INSTALLMENT' AND status = 'VALID'`,
    [bookingId])).rows[0].s);
  const balanceP = toPaisa(b.final_price) - paidP;
  if (b.status === 'ACTIVE') {
    const status = balanceP <= 0 ? 'SOLD' : b.transfer_count > 0 ? 'TRANSFERRED' : 'BOOKED';
    await client.query(
      `UPDATE plots SET status = $2, current_booking_id = $3, reserved_for = NULL, reserved_customer_id = NULL,
       reserved_until = NULL, reserved_by = NULL, updated_at = now() WHERE id = $1`, [b.plot_id, status, b.id]);
  }
  return { paidP, balanceP };
}

module.exports = { reallocate, refreshBookingState };
