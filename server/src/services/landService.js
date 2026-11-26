'use strict';
// Land purchase management: land records with rate-based price, payments to land owners with mandatory
// funding sources, personal investment (capital) and customer-money allocations, and the per-land ledger.
const { toPaisa, fromPaisa, formatPKR } = require('../lib/money');
const { nextNumber } = require('../lib/counters');
const { audit } = require('../lib/audit');
const { today, isDate, dateOf } = require('../lib/dates');
const settings = require('../lib/settings');
const { can } = require('../lib/permissions');
const { badRequest, conflict, notFound, forbidden } = require('../lib/errors');

const METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'];
const rs = (p) => formatPKR(fromPaisa(p));

// ------------------------------------------------------------------ area and price
async function computeArea(b) {
  const m = await settings.get('measurement');
  const marlaSqft = Number(b.marla_sqft) || Number(m.marla_sqft) || 272.25;
  const kanalMarla = Number(b.kanal_marla) || Number(m.kanal_marla) || 20;
  const k = Number(b.area_kanal) || 0; const mr = Number(b.area_marla) || 0; const sq = Number(b.area_sqft) || 0;
  const totalSqft = Math.round((k * kanalMarla * marlaSqft + mr * marlaSqft + sq) * 100) / 100;
  const totalMarla = Math.round((totalSqft / marlaSqft) * 10000) / 10000;
  if (totalSqft <= 0) throw badRequest('Enter the land area (Kanal, Marla or square feet)');
  return { marlaSqft, kanalMarla, k, mr, sq, totalSqft, totalMarla };
}
/** Total Purchase Price = Total Marla × Purchase Rate per Marla (integer paisa). */
function autoPriceP(totalMarla, rate) { return Math.round(Number(totalMarla) * Number(rate || 0) * 100); }

async function landFinance(db, landId) {
  return (await db.query('SELECT * FROM v_land_finance WHERE land_id = $1', [landId])).rows[0];
}

// ------------------------------------------------------------------ funding sources
/**
 * Record where the money for a land payment / land expense came from. Sources must add up exactly to totalP.
 *   PERSONAL_NEW      : new personal investment made now (creates a capital contribution + cash-in entry)
 *   PERSONAL_EXISTING : unused balance of an earlier personal investment
 *   CUSTOMER          : unallocated part of an original customer receipt (no new cash entry: that money is already in the cash book)
 */
async function applyFunding(c, req, { landId, useType, landPaymentId = null, expenseId = null, totalP, useDate, sources, label }) {
  if (!Array.isArray(sources) || !sources.length) throw badRequest('Select the payment source (personal investment or customer money)');
  if (sources.length > 30) throw badRequest('Too many payment sources');
  const sumP = sources.reduce((s, x) => s + toPaisa(x.amount), 0);
  if (sumP !== totalP) throw badRequest(`The payment sources add up to ${rs(sumP)} but the payment is ${rs(totalP)}. They must be equal.`);
  const usedInRequest = {};
  const created = [];
  const allocations = [];
  for (const [i, s] of sources.entries()) {
    const amountP = toPaisa(s.amount);
    const n = i + 1;
    if (amountP <= 0) throw badRequest(`Payment source ${n}: amount must be greater than 0`);
    let capitalId = null; let paymentId = null; let sourceType; let note = s.notes || null;

    if (s.type === 'PERSONAL_NEW') {
      // The investor is chosen from the investors list (investor_id). A typed name is still accepted from
      // older forms and linked to the investor with that name when there is one.
      let investor = String(s.investor_name || '').trim();
      let investorId = null;
      if (s.investor_id) {
        const inv = (await c.query('SELECT id, name, is_active FROM investors WHERE id = $1', [Number(s.investor_id)])).rows[0];
        if (!inv) throw badRequest(`Payment source ${n}: the selected investor was not found`);
        if (!inv.is_active) throw badRequest(`Payment source ${n}: investor ${inv.name} is no longer active`);
        investor = inv.name; investorId = inv.id;
      } else if (investor) {
        investorId = (await c.query('SELECT id FROM investors WHERE lower(name) = lower($1)', [investor])).rows[0]?.id || null;
      }
      if (!investor) throw badRequest(`Payment source ${n}: select the investor`);
      const date = s.investment_date || useDate;
      if (!isDate(date)) throw badRequest(`Payment source ${n}: investment date is invalid`);
      if (date > today()) throw badRequest(`Payment source ${n}: investment date cannot be in the future`);
      if (date > useDate) throw badRequest(`Payment source ${n}: the investment date cannot be after the payment date`);
      const method = METHODS.includes(s.method) ? s.method : 'CASH';
      const no = await nextNumber(c, 'investment');
      const cap = (await c.query(
        `INSERT INTO capital_contributions (contribution_no, investor_name, investor_id, contribution_date, amount, method, reference_no, notes,
           source_land_payment_id, source_expense_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [no, investor, investorId, date, fromPaisa(amountP), method, s.reference_no || null, note || `Invested for ${label}`, landPaymentId, expenseId, req.user.id])).rows[0];
      await c.query(
        `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, land_id, description, created_by)
         VALUES ($1,'CAPITAL_CONTRIBUTION','IN',$2,$3,'capital',$4,$5,$6,$7,$8)`,
        [date, cap.amount, method, cap.id, no, landId, `Personal investment by ${investor} (${label})`, req.user.id]);
      await audit(c, req, { action: 'CREATE', entity: 'investment', entityId: cap.id, summary: `Personal investment ${no}: ${formatPKR(cap.amount)} by ${investor} for ${label}`, after: cap });
      created.push(cap);
      capitalId = cap.id; sourceType = 'PERSONAL';
    } else if (s.type === 'PERSONAL_EXISTING') {
      const id = Number(s.capital_id);
      if (!id) throw badRequest(`Payment source ${n}: select the personal investment to use`);
      const cap = (await c.query('SELECT * FROM capital_contributions WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cap) throw notFound('Personal investment');
      if (cap.status !== 'VALID') throw conflict(`Investment ${cap.contribution_no} has been reversed`);
      if (cap.contribution_date > useDate) throw badRequest(`Investment ${cap.contribution_no} is dated after this payment`);
      const used = toPaisa((await c.query(`SELECT COALESCE(SUM(amount),0) AS s FROM fund_allocations WHERE capital_id = $1 AND status = 'ACTIVE'`, [id])).rows[0].s);
      const key = `cap${id}`;
      const available = toPaisa(cap.amount) - used - (usedInRequest[key] || 0);
      if (amountP > available) throw badRequest(`Investment ${cap.contribution_no} has only ${rs(Math.max(available, 0))} unused`);
      usedInRequest[key] = (usedInRequest[key] || 0) + amountP;
      capitalId = id; sourceType = 'PERSONAL';
    } else if (s.type === 'CUSTOMER') {
      const id = Number(s.payment_id);
      if (!id) throw badRequest(`Payment source ${n}: select the customer receipt (collection reference)`);
      const pay = (await c.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!pay) throw notFound('Customer receipt');
      if (pay.status !== 'VALID') throw conflict(`Receipt ${pay.receipt_no} has been reversed and cannot be used`);
      if (s.customer_id && Number(s.customer_id) !== pay.customer_id) throw badRequest(`Receipt ${pay.receipt_no} does not belong to the selected customer`);
      if (s.booking_id && Number(s.booking_id) !== pay.booking_id) throw badRequest(`Receipt ${pay.receipt_no} does not belong to the selected booking`);
      if (pay.payment_date > useDate) throw badRequest(`Receipt ${pay.receipt_no} was received after this payment date`);
      const allocated = toPaisa((await c.query(`SELECT COALESCE(SUM(amount),0) AS s FROM fund_allocations WHERE payment_id = $1 AND status = 'ACTIVE'`, [id])).rows[0].s);
      const key = `pay${id}`;
      let available = toPaisa(pay.amount) - allocated - (usedInRequest[key] || 0);
      // A cancelled booking's refund came out of its collections: never allocate refunded money.
      const bk = (await c.query('SELECT id, booking_no, status, refund_amount FROM bookings WHERE id = $1', [pay.booking_id])).rows[0];
      if (bk.status === 'CANCELLED') {
        const tot = (await c.query(`SELECT COALESCE(SUM(f.amount),0) AS paid, COALESCE(SUM(f.allocated),0) AS alloc FROM v_receipt_funds f
          WHERE f.booking_id = $1 AND f.status = 'VALID'`, [bk.id])).rows[0];
        const bookingAvail = toPaisa(tot.paid) - toPaisa(tot.alloc) - toPaisa(bk.refund_amount) - (usedInRequest[`bk${bk.id}`] || 0);
        available = Math.min(available, bookingAvail);
      }
      if (amountP > available) throw badRequest(`Receipt ${pay.receipt_no} has only ${rs(Math.max(available, 0))} of customer money not yet used`);
      usedInRequest[key] = (usedInRequest[key] || 0) + amountP;
      usedInRequest[`bk${bk.id}`] = (usedInRequest[`bk${bk.id}`] || 0) + amountP;
      paymentId = id; sourceType = 'CUSTOMER';
    } else {
      throw badRequest(`Payment source ${n}: choose personal investment or customer money`);
    }
    const a = (await c.query(
      `INSERT INTO fund_allocations (land_id, use_type, land_payment_id, expense_id, source_type, capital_id, payment_id, amount, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [landId, useType, landPaymentId, expenseId, sourceType, capitalId, paymentId, fromPaisa(amountP), note, req.user.id])).rows[0];
    allocations.push(a);
  }
  return { allocations, created };
}

// ------------------------------------------------------------------ land records
const TEXT_FIELDS = ['seller_name', 'seller_father_name', 'seller_cnic', 'seller_mobile', 'seller_address', 'location', 'owner_name', 'ownership_details',
  'registry_no', 'registry_date', 'mutation_no', 'mutation_date', 'khasra_no', 'khewat_no', 'notes', 'purchase_date', 'purchased_by',
  'agreement_details', 'registry_details', 'saleable_marla'];

function landLabel(b) { return `${b.seller_name} land${b.location ? ` - ${b.location}` : ''}`.slice(0, 150); }

function checkRequired(b) {
  if (!b.seller_name) throw badRequest('Original land owner name is required');
  if (!b.seller_mobile) throw badRequest('Owner contact number is required');
  if (!b.purchase_date) throw badRequest('Purchase date is required');
  if (b.purchase_date > today()) throw badRequest('Purchase date cannot be in the future');
  if (!b.purchased_by) throw badRequest('Enter who purchased the land (responsible person)');
}

/** Decide the total purchase price: automatic (Marla × rate) or an authorised manual price with a reason. */
function decidePrice(req, b, totalMarla) {
  const autoP = autoPriceP(totalMarla, b.rate_per_marla);
  if (!b.manual_price) return { priceP: autoP, autoP, manual: false, reason: null };
  if (!can(req.user.role, 'land.price_override')) throw forbidden('Only an administrator can change the total purchase price manually');
  const reason = String(b.price_adjust_reason || '').trim();
  if (!reason) throw badRequest('Enter the reason for changing the total purchase price manually');
  const priceP = toPaisa(b.purchase_price);
  if (priceP < 0) throw badRequest('Purchase price cannot be negative');
  return { priceP, autoP, manual: true, reason };
}

async function createLand(c, req, b) {
  checkRequired(b);
  const a = await computeArea(b);
  const p = decidePrice(req, b, a.totalMarla);
  const code = await nextNumber(c, 'land');
  const vals = TEXT_FIELDS.map((f) => b[f] ?? null);
  const n = TEXT_FIELDS.length;
  const land = (await c.query(
    `INSERT INTO lands (${TEXT_FIELDS.join(',')}, name, land_code, area_kanal, area_marla, area_sqft, marla_sqft, kanal_marla, total_sqft, total_marla,
       rate_per_marla, purchase_price, price_is_manual, price_adjust_reason, created_by, updated_by)
     VALUES (${TEXT_FIELDS.map((_, i) => `$${i + 1}`).join(',')}, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9},
       $${n + 10}, $${n + 11}, $${n + 12}, $${n + 13}, $${n + 14}, $${n + 14}) RETURNING *`,
    [...vals, b.name || landLabel(b), code, a.k, a.mr, a.sq, a.marlaSqft, a.kanalMarla, a.totalSqft, a.totalMarla,
      b.rate_per_marla, fromPaisa(p.priceP), p.manual, p.reason, req.user.id])).rows[0];
  await audit(c, req, {
    action: 'CREATE', entity: 'land', entityId: land.id,
    summary: `Land ${code} from ${land.seller_name} added: ${land.total_marla} Marla @ ${formatPKR(land.rate_per_marla)} = ${formatPKR(land.purchase_price)}${p.manual ? ` (manual price, auto ${rs(p.autoP)}: ${p.reason})` : ''}`,
    after: land,
  });
  for (const e of b.expenses || []) await createLandExpense(c, req, land.id, e);
  return land;
}

async function updateLand(c, req, id, b) {
  checkRequired(b);
  const before = (await c.query('SELECT * FROM lands WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!before) throw notFound('Land');
  const a = await computeArea(b);
  const fin = await landFinance(c, id);
  // A manual price that the user did not touch stays as it is (no new authorisation needed).
  const keepManual = b.manual_price && before.price_is_manual && toPaisa(b.purchase_price) === toPaisa(before.purchase_price)
    && String(b.price_adjust_reason || '').trim() === String(before.price_adjust_reason || '').trim();
  const p = keepManual ? { priceP: toPaisa(before.purchase_price), autoP: autoPriceP(a.totalMarla, b.rate_per_marla), manual: true, reason: before.price_adjust_reason }
    : decidePrice(req, b, a.totalMarla);
  const paidRegularP = toPaisa(fin.total_paid);
  if (p.priceP < paidRegularP) throw badRequest(`The purchase price cannot be less than the amount already paid to the owner (${rs(paidRegularP)})`);
  const sets = TEXT_FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const n = TEXT_FIELDS.length;
  const land = (await c.query(
    `UPDATE lands SET ${sets}, name = $${n + 2}, area_kanal = $${n + 3}, area_marla = $${n + 4}, area_sqft = $${n + 5}, marla_sqft = $${n + 6},
       kanal_marla = $${n + 7}, total_sqft = $${n + 8}, total_marla = $${n + 9}, rate_per_marla = $${n + 10}, purchase_price = $${n + 11},
       price_is_manual = $${n + 12}, price_adjust_reason = $${n + 13}, updated_by = $${n + 14}, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, ...TEXT_FIELDS.map((f) => b[f] ?? null), b.name || landLabel(b), a.k, a.mr, a.sq, a.marlaSqft, a.kanalMarla, a.totalSqft, a.totalMarla,
      b.rate_per_marla, fromPaisa(p.priceP), p.manual, p.reason, req.user.id])).rows[0];
  if (p.priceP !== toPaisa(before.purchase_price)) {
    await c.query(`INSERT INTO land_price_adjustments (land_id, old_price, new_price, auto_price, change_type, reason, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, before.purchase_price, land.purchase_price, fromPaisa(p.autoP), p.manual ? 'MANUAL' : 'RECALCULATED',
      p.manual ? p.reason : `Recalculated: ${land.total_marla} Marla × ${formatPKR(land.rate_per_marla)}`, req.user.id]);
  }
  await audit(c, req, {
    action: 'UPDATE', entity: 'land', entityId: id,
    summary: `Land ${land.land_code} updated${p.priceP !== toPaisa(before.purchase_price) ? `; price ${formatPKR(before.purchase_price)} → ${formatPKR(land.purchase_price)}${p.manual ? ` (manual: ${p.reason})` : ' (recalculated)'}` : ''}`,
    before, after: land,
  });
  return land;
}

// ------------------------------------------------------------------ payments to the land owner
async function payLandOwner(c, req, landId, b) {
  const land = (await c.query('SELECT * FROM lands WHERE id = $1 FOR UPDATE', [landId])).rows[0];
  if (!land) throw notFound('Land');
  const amountP = toPaisa(b.amount);
  if (amountP <= 0) throw badRequest('Payment amount must be greater than 0');
  if (b.payment_date > today()) throw badRequest('Payment date cannot be in the future');
  if (b.method === 'CHEQUE' && !b.reference_no) throw badRequest('Enter the cheque number in the reference field');
  const fin = await landFinance(c, landId);
  const remainingP = toPaisa(fin.remaining_payable);
  const kind = b.additional ? 'ADDITIONAL' : 'PAYMENT';
  if (kind === 'PAYMENT' && amountP > remainingP) {
    throw badRequest(remainingP <= 0
      ? 'This land is already fully paid. An extra amount can only be recorded by an administrator as an authorised additional payment.'
      : `The payment (${rs(amountP)}) is more than the remaining payable (${rs(remainingP)}). Pay the remaining amount, and record any extra as an authorised additional payment.`);
  }
  if (kind === 'ADDITIONAL') {
    if (!can(req.user.role, 'land.price_override')) throw forbidden('Only an administrator can authorise an additional payment beyond the agreed price');
    if (!String(b.authorization_note || '').trim()) throw badRequest('Enter the reason / authorisation for the additional payment');
  }
  const no = await nextNumber(c, 'land_payment');
  const desc = b.description || (kind === 'ADDITIONAL' ? `Additional payment to ${land.seller_name}` : `Payment to land owner ${land.seller_name}`);
  const lp = (await c.query(
    `INSERT INTO land_payments (payment_no, land_id, payment_date, amount, kind, method, reference_no, description, paid_to, authorization_note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [no, landId, b.payment_date, fromPaisa(amountP), kind, b.method, b.reference_no || null, desc, land.seller_name || land.owner_name,
      kind === 'ADDITIONAL' ? String(b.authorization_note).trim() : null, req.user.id])).rows[0];
  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, land_id, description, created_by)
     VALUES ($1,'LAND_PAYMENT','OUT',$2,$3,'land_payment',$4,$5,$6,$7,$8)`,
    [lp.payment_date, lp.amount, lp.method, lp.id, no, landId, `${desc} (${land.land_code})`, req.user.id]);
  const f = await applyFunding(c, req, { landId, useType: 'LAND_PAYMENT', landPaymentId: lp.id, totalP: amountP, useDate: b.payment_date, sources: b.sources, label: `${no} / ${land.land_code}` });
  await audit(c, req, {
    action: 'CREATE', entity: 'land_payment', entityId: lp.id,
    summary: `${no}: ${formatPKR(lp.amount)} paid to ${lp.paid_to} for ${land.land_code}${kind === 'ADDITIONAL' ? ` (ADDITIONAL: ${lp.authorization_note})` : ''}`,
    after: { ...lp, allocations: f.allocations },
  });
  return { payment: lp, ...f };
}

async function reverseLandPayment(c, req, paymentId, { reason, reverse_new_investments: reverseNew = true }) {
  const lp = (await c.query('SELECT * FROM land_payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
  if (!lp) throw notFound('Land payment');
  if (lp.status !== 'VALID') throw conflict('This land payment is already reversed');
  await c.query(`UPDATE land_payments SET status='REVERSED', reversed_at=now(), reversed_by=$2, reversal_reason=$3 WHERE id=$1`, [lp.id, req.user.id, reason]);
  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, land_id, description, created_by)
     VALUES ($1,'LAND_PAYMENT_REVERSED','IN',$2,$3,'land_payment',$4,$5,$6,$7,$8)`,
    [today(), lp.amount, lp.method, lp.id, lp.payment_no, lp.land_id, `Reversal of ${lp.payment_no}: ${reason}`, req.user.id]);
  await c.query(`UPDATE fund_allocations SET status='REVERSED', reversed_at=now(), reversed_by=$2, reversal_reason=$3
    WHERE land_payment_id=$1 AND status='ACTIVE'`, [lp.id, req.user.id, `Land payment ${lp.payment_no} reversed`]);
  const reversedInv = [];
  if (reverseNew) {
    const caps = (await c.query(`SELECT * FROM capital_contributions WHERE source_land_payment_id=$1 AND status='VALID' FOR UPDATE`, [lp.id])).rows;
    for (const cap of caps) {
      const used = toPaisa((await c.query(`SELECT COALESCE(SUM(amount),0) AS s FROM fund_allocations WHERE capital_id=$1 AND status='ACTIVE'`, [cap.id])).rows[0].s);
      if (used > 0) continue; // still used elsewhere: keep it
      await reverseCapital(c, req, cap, `Land payment ${lp.payment_no} reversed: ${reason}`);
      reversedInv.push(cap.contribution_no);
    }
  }
  await audit(c, req, {
    action: 'REVERSE', entity: 'land_payment', entityId: lp.id,
    summary: `${lp.payment_no} (${formatPKR(lp.amount)}) reversed: ${reason}${reversedInv.length ? `; investments reversed: ${reversedInv.join(', ')}` : ''}`, before: lp,
  });
  return { reversed_investments: reversedInv };
}

// ------------------------------------------------------------------ additional land expenses (registry fee, stamp duty, commission…)
async function createLandExpense(c, req, landId, b) {
  const land = (await c.query('SELECT id, land_code, seller_name FROM lands WHERE id = $1', [landId])).rows[0];
  if (!land) throw notFound('Land');
  const amountP = toPaisa(b.amount);
  if (amountP <= 0) throw badRequest('Expense amount must be greater than 0');
  const date = b.expense_date || today();
  if (!isDate(date) || date > today()) throw badRequest('Expense date is invalid or in the future');
  const method = METHODS.includes(b.method) ? b.method : 'CASH';
  if (method === 'CHEQUE' && !b.reference_no) throw badRequest('Enter the cheque number in the reference field');
  const desc = String(b.description || '').trim();
  if (!desc) throw badRequest('Enter a description for the land expense');
  let cat;
  if (b.category_id) cat = (await c.query('SELECT * FROM expense_categories WHERE id = $1', [b.category_id])).rows[0];
  else cat = (await c.query(`SELECT * FROM expense_categories WHERE lower(name) = 'land purchase expenses'`)).rows[0];
  if (!cat || !cat.is_active || cat.cost_type === 'LAND_PAYMENT') throw badRequest('Select a valid expense category (payments to the owner use Pay Land Owner)');
  const no = await nextNumber(c, 'expense');
  const e = (await c.query(
    `INSERT INTO expenses (expense_no, expense_date, category_id, description, amount, method, reference_no, paid_to, land_id, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
    [no, date, cat.id, desc, fromPaisa(amountP), method, b.reference_no || null, b.paid_to || null, landId, req.user.id])).rows[0];
  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, land_id, description, created_by)
     VALUES ($1,'EXPENSE_PAID','OUT',$2,$3,'expense',$4,$5,$6,$7,$8)`,
    [date, e.amount, method, e.id, no, landId, `${cat.name}: ${desc} (${land.land_code})`, req.user.id]);
  const sources = Array.isArray(b.sources) && b.sources.length ? b.sources
    : [{ type: 'PERSONAL_NEW', amount: fromPaisa(amountP), investor_name: b.investor_name, investment_date: date, method }];
  const f = await applyFunding(c, req, { landId, useType: 'LAND_EXPENSE', expenseId: e.id, totalP: amountP, useDate: date, sources, label: `${no} / ${land.land_code}` });
  await audit(c, req, { action: 'CREATE', entity: 'expense', entityId: e.id, summary: `Land expense ${no} for ${land.land_code}: ${formatPKR(e.amount)} ${desc}`, after: { ...e, allocations: f.allocations } });
  return { expense: e, ...f };
}

// ------------------------------------------------------------------ personal investment
async function createInvestment(c, req, b) {
  const amountP = toPaisa(b.amount);
  if (amountP <= 0) throw badRequest('Investment amount must be greater than 0');
  if (b.contribution_date > today()) throw badRequest('Investment date cannot be in the future');
  const no = await nextNumber(c, 'investment');
  const investorId = (await c.query('SELECT id FROM investors WHERE lower(name) = lower($1)', [b.investor_name])).rows[0]?.id || null;
  const cap = (await c.query(
    `INSERT INTO capital_contributions (contribution_no, investor_name, investor_id, contribution_date, amount, method, reference_no, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [no, b.investor_name, investorId, b.contribution_date, fromPaisa(amountP), b.method, b.reference_no || null, b.notes || null, req.user.id])).rows[0];
  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, description, created_by)
     VALUES ($1,'CAPITAL_CONTRIBUTION','IN',$2,$3,'capital',$4,$5,$6,$7)`,
    [cap.contribution_date, cap.amount, cap.method, cap.id, no, `Personal investment by ${cap.investor_name}`, req.user.id]);
  await audit(c, req, { action: 'CREATE', entity: 'investment', entityId: cap.id, summary: `Personal investment ${no}: ${formatPKR(cap.amount)} by ${cap.investor_name}`, after: cap });
  return cap;
}

/** Record an investor (a person who puts money into the business). No amount: that is entered when money is used. */
async function createInvestor(c, req, b) {
  if (b.added_date > today()) throw badRequest('Date cannot be in the future');
  const inv = (await c.query(
    `INSERT INTO investors (name, added_date, notes, created_by, updated_by) VALUES ($1,$2,$3,$4,$4) RETURNING *`,
    [b.name, b.added_date, b.notes || null, req.user.id])).rows[0];
  await audit(c, req, { action: 'CREATE', entity: 'investor', entityId: inv.id, summary: `Investor ${inv.name} added`, after: inv });
  return inv;
}

async function reverseCapital(c, req, cap, reason) {
  await c.query(`UPDATE capital_contributions SET status='REVERSED', reversed_at=now(), reversed_by=$2, reversal_reason=$3 WHERE id=$1`, [cap.id, req.user.id, reason]);
  await c.query(
    `INSERT INTO ledger_entries (entry_date, entry_type, direction, amount, method, source_type, source_id, reference, description, created_by)
     VALUES ($1,'CAPITAL_REVERSED','OUT',$2,$3,'capital',$4,$5,$6,$7)`,
    [today(), cap.amount, cap.method, cap.id, cap.contribution_no, `Reversal of investment ${cap.contribution_no}: ${reason}`, req.user.id]);
  await audit(c, req, { action: 'REVERSE', entity: 'investment', entityId: cap.id, summary: `Personal investment ${cap.contribution_no} (${formatPKR(cap.amount)}) reversed: ${reason}`, before: cap });
}

async function reverseInvestment(c, req, id, reason) {
  const cap = (await c.query('SELECT * FROM capital_contributions WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!cap) throw notFound('Personal investment');
  if (cap.status !== 'VALID') throw conflict('This investment is already reversed');
  const uses = (await c.query(`SELECT a.amount, COALESCE(lp.payment_no, e.expense_no) AS ref FROM fund_allocations a
    LEFT JOIN land_payments lp ON lp.id = a.land_payment_id LEFT JOIN expenses e ON e.id = a.expense_id
    WHERE a.capital_id = $1 AND a.status = 'ACTIVE'`, [id])).rows;
  if (uses.length) throw conflict(`This investment is used for ${uses.map((u) => u.ref).join(', ')}. Reverse those payments first.`);
  await reverseCapital(c, req, cap, reason);
}

// ------------------------------------------------------------------ queries
const LAND_LIST_SQL = `
  SELECT l.*, f.paid_new, f.paid_legacy, f.total_paid, f.additional_paid, f.remaining_payable, f.extra_cost, f.total_investment,
    f.personal_funded, f.customer_funded, f.payment_count,
    f.total_paid AS paid_to_seller, f.remaining_payable AS payable_to_seller,
    (SELECT MAX(payment_date) FROM land_payments x WHERE x.land_id = l.id AND x.status = 'VALID') AS last_payment_date,
    COALESCE(s.society_count, 0)::int AS society_count,
    COALESCE(s.plotted_marla, 0)::numeric(14,4) AS plotted_marla
  FROM lands l JOIN v_land_finance f ON f.land_id = l.id
  LEFT JOIN (
    SELECT so.land_id, COUNT(DISTINCT so.id) AS society_count, SUM(p.size_marla) FILTER (WHERE p.status <> 'CANCELLED') AS plotted_marla
    FROM societies so LEFT JOIN plots p ON p.society_id = so.id GROUP BY so.land_id
  ) s ON s.land_id = l.id`;

async function landSummary(db) {
  const one = async (sql) => (await db.query(sql)).rows[0];
  const l = await one(`SELECT COUNT(*)::int AS lands, COALESCE(SUM(l.total_marla),0) AS marla, COALESCE(SUM(l.total_sqft),0) AS sqft,
      COALESCE(SUM(l.purchase_price),0) AS purchase_value, COALESCE(SUM(f.total_paid),0) AS paid,
      COALESCE(SUM(GREATEST(f.remaining_payable,0)),0) AS remaining, COALESCE(SUM(f.extra_cost),0) AS extra,
      COALESCE(SUM(f.additional_paid),0) AS additional, COALESCE(SUM(f.total_investment),0) AS investment
    FROM lands l JOIN v_land_finance f ON f.land_id = l.id`);
  const cap = await one(`SELECT COALESCE(SUM(amount),0) AS total, COALESCE(SUM(available),0) AS available FROM v_capital_balance WHERE status='VALID'`);
  const alloc = await one(`SELECT
      COALESCE(SUM(amount) FILTER (WHERE source_type='PERSONAL'),0) AS personal_used,
      COALESCE(SUM(amount) FILTER (WHERE source_type='CUSTOMER'),0) AS customer_used
    FROM fund_allocations WHERE status='ACTIVE'`);
  return {
    total_lands: l.lands, total_marla: Number(l.marla), total_sqft: Number(l.sqft), total_purchase_value: Number(l.purchase_value),
    total_paid: Number(l.paid), total_remaining: Number(l.remaining), total_extra_expenses: Number(l.extra), total_additional_paid: Number(l.additional),
    total_land_investment: Number(l.investment), total_personal_investment: Number(cap.total), personal_available: Number(cap.available),
    personal_used_for_land: Number(alloc.personal_used), total_customer_money_used: Number(alloc.customer_used),
  };
}

async function investmentSummary(db) {
  const one = async (sql) => (await db.query(sql)).rows[0];
  const cap = await one(`SELECT COALESCE(SUM(amount),0) AS total, COALESCE(SUM(used_land_payment),0) AS land_pay, COALESCE(SUM(used_land_expense),0) AS land_exp,
    COALESCE(SUM(available),0) AS available, COUNT(*)::int AS n FROM v_capital_balance WHERE status='VALID'`);
  const cust = await one(`SELECT COALESCE(SUM(amount),0) AS received FROM payments WHERE status='VALID'`);
  const custUse = await one(`SELECT COALESCE(SUM(amount) FILTER (WHERE use_type='LAND_PAYMENT'),0) AS land_pay,
    COALESCE(SUM(amount) FILTER (WHERE use_type='LAND_EXPENSE'),0) AS land_exp FROM fund_allocations WHERE status='ACTIVE' AND source_type='CUSTOMER'`);
  const dev = await one(`SELECT COALESCE(SUM(e.amount),0) AS s FROM expenses e JOIN expense_categories c ON c.id=e.category_id
    WHERE e.status='ACTIVE' AND c.cost_type='PROJECT' AND e.land_id IS NULL`);
  const refunds = await one(`SELECT COALESCE(SUM(amount),0) AS s FROM refunds`);
  const cash = await one(`SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0) AS s FROM ledger_entries`);
  const legacy = await one(`SELECT COALESCE(SUM(e.amount),0) AS s FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.status='ACTIVE' AND c.cost_type='LAND_PAYMENT'`);
  const lp = await one(`SELECT COALESCE(SUM(lp.amount),0) AS paid, COALESCE(SUM(a.funded),0) AS funded FROM land_payments lp
    LEFT JOIN (SELECT land_payment_id, SUM(amount) AS funded FROM fund_allocations WHERE status='ACTIVE' AND land_payment_id IS NOT NULL GROUP BY land_payment_id) a ON a.land_payment_id = lp.id
    WHERE lp.status='VALID'`);
  const P = toPaisa;
  const customerUsed = P(custUse.land_pay) + P(custUse.land_exp);
  return {
    personal_investment_total: Number(cap.total),
    personal_investment_count: cap.n,
    personal_used_land_purchase: Number(cap.land_pay),
    personal_used_land_expenses: Number(cap.land_exp),
    personal_available: Number(cap.available),
    development_expenses_paid: Number(dev.s),
    customer_money_received: Number(cust.received),
    customer_used_land_purchase: Number(custUse.land_pay),
    customer_used_land_expenses: Number(custUse.land_exp),
    customer_money_unallocated: Number(fromPaisa(P(cust.received) - customerUsed - P(refunds.s))),
    refunds_paid: Number(refunds.s),
    cash_in_business: Number(cash.s),
    land_payments_total: Number(lp.paid),
    land_payments_funded: Number(lp.funded),
    land_payments_unreconciled: Number(fromPaisa(P(lp.paid) - P(lp.funded))),
    legacy_land_payments_no_source: Number(legacy.s),
  };
}

/** Human-readable description of the funding of each land payment / expense. */
/**
 * Where the money for each land payment / expense came from.
 * Compact text (default) keeps long splits readable: many customer receipts are summarised as
 * "Customer money Rs X from N receipts (names)"; { detail: true } returns every allocation line.
 */
async function fundingText(db, column, ids, { detail = false } = {}) {
  if (!ids.length) return {};
  const rows = (await db.query(`
    SELECT a.${column} AS use_id, a.source_type, a.amount, a.status, a.note, cc.contribution_no, cc.investor_name,
      p.receipt_no, cu.full_name AS customer_name, pl.plot_no, b.booking_no
    FROM fund_allocations a
    LEFT JOIN capital_contributions cc ON cc.id = a.capital_id
    LEFT JOIN payments p ON p.id = a.payment_id LEFT JOIN customers cu ON cu.id = p.customer_id
    LEFT JOIN plots pl ON pl.id = p.plot_id LEFT JOIN bookings b ON b.id = p.booking_id
    WHERE a.${column} = ANY($1) ORDER BY a.id`, [ids])).rows;
  const line = (r) => (r.source_type === 'PERSONAL'
    ? `Personal investment ${formatPKR(r.amount)} (${r.contribution_no}, ${r.investor_name})`
    : `Customer money ${formatPKR(r.amount)} (receipt ${r.receipt_no}, ${r.customer_name}, plot ${r.plot_no}, ${r.booking_no})`);
  const groups = {};
  for (const r of rows) (groups[r.use_id] = groups[r.use_id] || []).push(r);
  const sumOf = (list) => formatPKR(fromPaisa(list.reduce((t, r) => t + toPaisa(r.amount), 0)));
  const out = {};
  for (const [id, list] of Object.entries(groups)) {
    if (detail) { out[id] = list.map(line); continue; }
    const parts = [];
    const pers = list.filter((r) => r.source_type === 'PERSONAL');
    const cust = list.filter((r) => r.source_type === 'CUSTOMER');
    if (pers.length > 2) parts.push(`Personal investment ${sumOf(pers)} (${pers.length} entries, ${[...new Set(pers.map((r) => r.investor_name))].join(', ')})`);
    else parts.push(...pers.map(line));
    if (cust.length > 2) {
      const names = [...new Set(cust.map((r) => r.customer_name))];
      const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '');
      parts.push(`Customer money ${sumOf(cust)} from ${cust.length} receipts (${shown})`);
    } else parts.push(...cust.map(line));
    out[id] = parts.join(' + ');
  }
  return out;
}

/** Complete chronological ledger of one land with a running "remaining payable" balance. */
async function landLedger(db, landId) {
  const land = (await db.query(`${LAND_LIST_SQL} WHERE l.id = $1`, [landId])).rows[0];
  if (!land) throw notFound('Land');
  const user = async (id) => (id ? (await db.query('SELECT full_name FROM users WHERE id=$1', [id])).rows[0]?.full_name : null);
  const adjustments = (await db.query(`SELECT a.*, u.full_name AS by_name FROM land_price_adjustments a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.land_id = $1 ORDER BY a.id`, [landId])).rows;
  const payments = (await db.query(`SELECT lp.*, u.full_name AS by_name, ru.full_name AS reversed_by_name FROM land_payments lp
    LEFT JOIN users u ON u.id = lp.created_by LEFT JOIN users ru ON ru.id = lp.reversed_by WHERE lp.land_id = $1 ORDER BY lp.payment_date, lp.id`, [landId])).rows;
  const expenses = (await db.query(`SELECT e.*, c.name AS category, c.cost_type, u.full_name AS by_name FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id LEFT JOIN users u ON u.id = e.created_by WHERE e.land_id = $1 ORDER BY e.expense_date, e.id`, [landId])).rows;
  const payFund = await fundingText(db, 'land_payment_id', payments.map((p) => p.id));
  const expFund = await fundingText(db, 'expense_id', expenses.map((e) => e.id));
  const ev = [];
  const initialPrice = adjustments.length ? adjustments[0].old_price : land.purchase_price;
  ev.push({
    date: land.purchase_date || dateOf(land.created_at), ord: 0, id: 0, txn_id: land.land_code, type: 'PURCHASE',
    description: `Land purchased from ${land.seller_name || land.owner_name || '-'}: ${Number(land.total_marla)} Marla @ ${formatPKR(land.rate_per_marla || 0)} per Marla`
      + (land.price_is_manual && !adjustments.length && land.price_adjust_reason ? ` (price set manually: ${land.price_adjust_reason})` : ''),
    amount: Number(initialPrice), payable_change: Number(initialPrice), source: '-', method: '-', reference: '-', entered_by: await user(land.created_by), status: 'AGREED',
  });
  for (const a of adjustments) {
    const d = toPaisa(a.new_price) - toPaisa(a.old_price);
    ev.push({ date: dateOf(a.created_at), ord: 1, id: a.id, txn_id: `ADJ-${a.id}`, type: 'PRICE_CHANGE',
      description: `Purchase price ${a.change_type === 'MANUAL' ? 'changed manually' : 'recalculated'}: ${formatPKR(a.old_price)} → ${formatPKR(a.new_price)} (${a.reason})`,
      amount: Number(fromPaisa(d)), payable_change: Number(fromPaisa(d)), source: '-', method: '-', reference: '-', entered_by: a.by_name, status: a.change_type });
  }
  for (const p of payments) {
    const regular = p.kind === 'PAYMENT';
    ev.push({ date: p.payment_date, ord: 2, id: p.id, txn_id: p.payment_no, type: regular ? 'PAYMENT' : 'ADDITIONAL',
      description: `${p.description}${regular ? '' : ` — additional payment beyond agreed price (${p.authorization_note})`}`,
      amount: Number(p.amount), payable_change: regular ? -Number(p.amount) : 0, source: payFund[p.id] || 'Not recorded',
      method: p.method, reference: p.reference_no || '-', entered_by: p.by_name, status: p.status });
    if (p.status === 'REVERSED') {
      ev.push({ date: dateOf(p.reversed_at), ord: 3, id: p.id, txn_id: `${p.payment_no}-R`, type: 'REVERSAL',
        description: `Reversal of ${p.payment_no}: ${p.reversal_reason}`, amount: -Number(p.amount), payable_change: regular ? Number(p.amount) : 0,
        source: 'Funding released', method: p.method, reference: p.reference_no || '-', entered_by: p.reversed_by_name, status: 'REVERSAL' });
    }
  }
  for (const e of expenses) {
    const legacyPay = e.cost_type === 'LAND_PAYMENT';
    const active = e.status === 'ACTIVE';
    ev.push({ date: e.expense_date, ord: 2, id: 100000 + e.id, txn_id: e.expense_no, type: legacyPay ? 'PAYMENT' : 'EXPENSE',
      description: legacyPay ? `Payment to land owner (recorded in Expenses before upgrade): ${e.description}` : `Additional expense — ${e.category}: ${e.description}`,
      amount: Number(e.amount), payable_change: legacyPay && active ? -Number(e.amount) : 0,
      source: expFund[e.id] || 'Not recorded (entered before upgrade)', method: e.method, reference: e.reference_no || '-', entered_by: e.by_name,
      status: active ? 'VALID' : 'CANCELLED' });
  }
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord || a.id - b.id));
  let bal = 0;
  for (const r of ev) { bal += toPaisa(r.payable_change); r.remaining_payable = Number(fromPaisa(bal)); }
  return { land, rows: ev };
}

module.exports = {
  computeArea, autoPriceP, landFinance, applyFunding, createLand, updateLand, payLandOwner, reverseLandPayment, createLandExpense,
  createInvestment, createInvestor, reverseInvestment, landSummary, investmentSummary, landLedger, fundingText, LAND_LIST_SQL,
};
