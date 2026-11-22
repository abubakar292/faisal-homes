'use strict';
// Land-wise reports (JSON / Excel / PDF through the generic report exporter).
const { pool } = require('../db/pool');
const { toPaisa, fromPaisa } = require('../lib/money');
const { today, isDate } = require('../lib/dates');
const { badRequest } = require('../lib/errors');
const svc = require('./landService');

const C = (key, header, type = 'text', width) => ({ key, header, type, width });
const P = (v) => toPaisa(v);
const R = (p) => Number(fromPaisa(p));
const totalsOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, R(rows.reduce((s, r) => s + P(r[k]), 0))]));
const METHOD = { CASH: 'Cash', BANK_TRANSFER: 'Bank', CHEQUE: 'Cheque', OTHER: 'Other' };

module.exports = {
  async 'land-statement'(q) {
    const id = Number(q.land_id);
    if (!id) throw badRequest('Select a land');
    const { land, rows } = await svc.landLedger(pool, id);
    return {
      title: 'Land Purchase Statement',
      subtitle: `${land.land_code} · Owner: ${land.seller_name || land.owner_name || '-'}${land.seller_mobile ? ` (${land.seller_mobile})` : ''} · ${Number(land.total_marla)} Marla · ${land.location || ''}`,
      columns: [C('date', 'Date', 'date'), C('txn_id', 'Transaction ID'), C('description', 'Description', 'text', 40), C('amount', 'Amount', 'money'),
        C('source', 'Payment Source', 'text', 34), C('method', 'Method'), C('reference', 'Reference'), C('entered_by', 'Entered By'), C('status', 'Status'),
        C('remaining_payable', 'Remaining Payable', 'money')],
      rows: rows.map((r) => ({ ...r, method: METHOD[r.method] || r.method })),
      summary: [
        { label: 'Total purchase price', value: Number(land.purchase_price) },
        { label: 'Total amount paid to owner', value: Number(land.total_paid) },
        { label: 'Remaining payable', value: Number(land.remaining_payable) },
        { label: 'Additional payments beyond agreed price', value: Number(land.additional_paid) },
        { label: 'Total additional expenses', value: Number(land.extra_cost) },
        { label: 'Total land investment', value: Number(land.total_investment) },
        { label: 'Funded by personal investment', value: Number(land.personal_funded) },
        { label: 'Funded by customer money', value: Number(land.customer_funded) },
      ],
      notes: ['Remaining Payable = purchase price - payments to the owner. Additional expenses and additional payments add to the land investment, not to the payable.',
        'When many customer receipts paid one instalment they are summarised here; the receipt-by-receipt list is in the Customer Money Used for Land report.'],
    };
  },

  async 'land-owners'() {
    const rows = (await pool.query(`
      SELECT COALESCE(NULLIF(l.seller_name,''), l.owner_name, '(not entered)') AS owner, MAX(l.seller_mobile) AS contact, COUNT(*)::int AS lands,
        string_agg(l.land_code, ', ' ORDER BY l.id) AS land_codes, SUM(l.total_marla) AS marla, SUM(l.purchase_price) AS purchase_value,
        SUM(f.total_paid) AS paid, SUM(f.remaining_payable) AS remaining, SUM(f.total_investment) AS investment
      FROM lands l JOIN v_land_finance f ON f.land_id = l.id GROUP BY 1 ORDER BY SUM(l.purchase_price) DESC`)).rows;
    return {
      title: 'Owner-wise Land Purchase Report', subtitle: `As of ${today()}`,
      columns: [C('owner', 'Land Owner'), C('contact', 'Contact'), C('lands', 'Lands', 'number'), C('land_codes', 'Land IDs'), C('marla', 'Marla', 'number'),
        C('purchase_value', 'Purchase Value', 'money'), C('paid', 'Paid', 'money'), C('remaining', 'Remaining', 'money'), C('investment', 'Total Investment', 'money')],
      rows, totals: totalsOf(rows, ['purchase_value', 'paid', 'remaining', 'investment']),
    };
  },

  async 'land-payments'(q) {
    const to = isDate(q.to) ? q.to : today();
    const from = isDate(q.from) ? q.from : `${to.slice(0, 4)}-01-01`;
    const p = [from, to]; let extra = '';
    if (q.land_id) { p.push(Number(q.land_id)); extra = ` AND lp.land_id = $${p.length}`; }
    const rows = (await pool.query(`
      SELECT lp.id, lp.payment_date, lp.payment_no, l.land_code, lp.paid_to, lp.amount, lp.kind, lp.method, lp.reference_no, lp.status, u.full_name AS entered_by
      FROM land_payments lp JOIN lands l ON l.id = lp.land_id LEFT JOIN users u ON u.id = lp.created_by
      WHERE lp.payment_date BETWEEN $1 AND $2 ${extra} ORDER BY lp.payment_date, lp.id`, p)).rows;
    const fund = await svc.fundingText(pool, 'land_payment_id', rows.map((r) => r.id));
    rows.forEach((r) => { r.source = fund[r.id] || 'Not recorded'; r.method = METHOD[r.method] || r.method; r.kind = r.kind === 'ADDITIONAL' ? 'Additional' : 'Payment'; });
    return {
      title: 'Land Payment History', subtitle: `${from} to ${to}`,
      columns: [C('payment_date', 'Date', 'date'), C('payment_no', 'Payment ID'), C('land_code', 'Land'), C('paid_to', 'Paid To'), C('kind', 'Type'),
        C('amount', 'Amount', 'money'), C('source', 'Payment Source', 'text', 40), C('method', 'Method'), C('reference_no', 'Reference'), C('status', 'Status'), C('entered_by', 'Entered By')],
      rows, totals: totalsOf(rows.filter((r) => r.status === 'VALID'), ['amount']),
      notes: ['Total excludes reversed payments. Payments entered in Expenses before the upgrade appear in each land statement.'],
    };
  },

  async 'land-outstanding'() {
    const rows = (await pool.query(`${svc.LAND_LIST_SQL} WHERE f.remaining_payable > 0 ORDER BY f.remaining_payable DESC`)).rows
      .map((l) => ({ land_code: l.land_code, owner: l.seller_name || l.owner_name, contact: l.seller_mobile, marla: l.total_marla, purchase_date: l.purchase_date,
        purchase_price: l.purchase_price, total_paid: l.total_paid, remaining_payable: l.remaining_payable, last_payment_date: l.last_payment_date }));
    return {
      title: 'Outstanding Land Payments', subtitle: `As of ${today()}`,
      columns: [C('land_code', 'Land'), C('owner', 'Land Owner'), C('contact', 'Contact'), C('marla', 'Marla', 'number'), C('purchase_date', 'Purchased', 'date'),
        C('purchase_price', 'Purchase Price', 'money'), C('total_paid', 'Paid', 'money'), C('remaining_payable', 'Remaining', 'money'), C('last_payment_date', 'Last Payment', 'date')],
      rows, totals: totalsOf(rows, ['purchase_price', 'total_paid', 'remaining_payable']),
    };
  },

  async investment() {
    const rows = (await pool.query(`
      SELECT v.contribution_no, v.contribution_date, v.investor_name, v.amount, v.method, v.used_land_payment, v.used_land_expense, v.available, v.status,
        COALESCE(lp.payment_no, e.expense_no, 'Added to business') AS made_for, v.notes
      FROM v_capital_balance v LEFT JOIN land_payments lp ON lp.id = v.source_land_payment_id LEFT JOIN expenses e ON e.id = v.source_expense_id
      ORDER BY v.contribution_date, v.id`)).rows.map((r) => ({ ...r, method: METHOD[r.method] || r.method }));
    const s = await svc.investmentSummary(pool);
    return {
      title: 'Personal Investment Report', subtitle: `As of ${today()}`,
      columns: [C('contribution_no', 'Investment ID'), C('contribution_date', 'Date', 'date'), C('investor_name', 'Investor'), C('amount', 'Amount', 'money'),
        C('method', 'Method'), C('made_for', 'Made For'), C('used_land_payment', 'Used: Land Purchase', 'money'), C('used_land_expense', 'Used: Land Expenses', 'money'),
        C('available', 'Not Yet Used', 'money'), C('status', 'Status')],
      rows, totals: totalsOf(rows.filter((r) => r.status === 'VALID'), ['amount', 'used_land_payment', 'used_land_expense', 'available']),
      summary: [
        { label: 'Total personal investment', value: s.personal_investment_total },
        { label: 'Used to purchase land (owner payments)', value: s.personal_used_land_purchase },
        { label: 'Used for land expenses', value: s.personal_used_land_expenses },
        { label: 'Personal investment not yet used for land', value: s.personal_available },
        { label: 'Development expenses paid (all sources)', value: s.development_expenses_paid },
        { label: 'Money received from customers', value: s.customer_money_received },
        { label: 'Customer money used to purchase land', value: s.customer_used_land_purchase },
        { label: 'Customer money used for land expenses', value: s.customer_used_land_expenses },
        { label: 'Cash available in the business (cash book)', value: s.cash_in_business },
      ],
      notes: ['Reversed investments are listed but not totalled. Each investment is counted once: amounts used plus amount not yet used always equal the investment.',
        'Development expenses are entered in the Expenses module without a payment source, so they are shown in total and not split by source.'],
    };
  },

  async 'customer-money'() {
    const rows = (await pool.query(`
      SELECT COALESCE(lp.payment_date, e.expense_date) AS used_on, p.receipt_no, p.payment_date AS receipt_date, cu.full_name AS customer, b.booking_no, pl.plot_no, p.amount AS receipt_amount,
        a.amount AS used_amount, l.land_code, COALESCE(lp.payment_no, e.expense_no) AS used_for, a.status, a.note
      FROM fund_allocations a JOIN payments p ON p.id = a.payment_id JOIN customers cu ON cu.id = p.customer_id JOIN bookings b ON b.id = p.booking_id
      JOIN plots pl ON pl.id = p.plot_id JOIN lands l ON l.id = a.land_id LEFT JOIN land_payments lp ON lp.id = a.land_payment_id LEFT JOIN expenses e ON e.id = a.expense_id
      WHERE a.source_type = 'CUSTOMER' ORDER BY COALESCE(lp.payment_date, e.expense_date), a.id`)).rows;
    const s = await svc.investmentSummary(pool);
    return {
      title: 'Customer Money Utilization Report', subtitle: `As of ${today()}`,
      columns: [C('used_on', 'Used On', 'date'), C('receipt_no', 'Receipt'), C('receipt_date', 'Receipt Date', 'date'), C('customer', 'Customer'), C('booking_no', 'Booking'),
        C('plot_no', 'Plot'), C('receipt_amount', 'Receipt Amount', 'money'), C('used_amount', 'Amount Used', 'money'), C('land_code', 'Land'), C('used_for', 'Used For'), C('status', 'Status')],
      rows, totals: totalsOf(rows.filter((r) => r.status === 'ACTIVE'), ['used_amount']),
      summary: [
        { label: 'Money received from customers (valid receipts)', value: s.customer_money_received },
        { label: 'Used to purchase land', value: s.customer_used_land_purchase },
        { label: 'Used for land expenses', value: s.customer_used_land_expenses },
        { label: 'Refunds paid to customers', value: s.refunds_paid },
        { label: 'Customer money not yet allocated', value: s.customer_money_unallocated },
      ],
      notes: ["Customer receipts stay unchanged in each customer's payment history. Only the part of a receipt that is not yet used can be allocated."],
    };
  },
};
