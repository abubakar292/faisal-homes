'use strict';
const { pool } = require('../db/pool');
const { toPaisa, fromPaisa } = require('../lib/money');
const { today, monthStart, monthEnd, daysBetween, addDays, isDate } = require('../lib/dates');
const { badRequest, notFound } = require('../lib/errors');
const { lateFeeFor } = require('./bookingService');

const P = (v) => toPaisa(v);
const R = (p) => Number(fromPaisa(p));

/**
 * Company-wide financial position. See ARCHITECTURE.md §6 for the definitions.
 * Profit is NOT "money received minus land cost": it separates contract value, cash, receivables,
 * capitalised project cost and operating expenses, and recognises profit as cash is collected.
 */
async function financialSummary(db = pool) {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const land = await one(`SELECT COALESCE(SUM(purchase_price),0) AS cost, COALESCE(SUM(total_marla),0) AS marla, COALESCE(SUM(saleable_marla),0) AS saleable FROM lands`);
  const exp = (await db.query(`
    SELECT c.cost_type, (e.land_id IS NOT NULL) AS land_linked, COALESCE(SUM(e.amount),0) AS amt
    FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.status = 'ACTIVE'
    GROUP BY c.cost_type, (e.land_id IS NOT NULL)`)).rows;
  const sumExp = (pred) => exp.filter(pred).reduce((s, r) => s + P(r.amt), 0);
  // Payments to land owners: new "Pay Land Owner" payments + older ones entered as "Land Purchase" expenses.
  const lpay = await one(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind='PAYMENT'),0) AS paid, COALESCE(SUM(amount) FILTER (WHERE kind='ADDITIONAL'),0) AS additional
    FROM land_payments WHERE status='VALID'`);
  const landPayments = sumExp((r) => r.cost_type === 'LAND_PAYMENT') + P(lpay.paid);
  const landAdditionalPaid = P(lpay.additional);
  // Any non-land-payment expense linked to a land (registry fee, survey, boundary wall…) is part of the land's cost.
  const landExtra = sumExp((r) => r.cost_type !== 'LAND_PAYMENT' && r.land_linked) + landAdditionalPaid;
  const development = sumExp((r) => r.cost_type === 'PROJECT' && !r.land_linked);
  const operating = sumExp((r) => r.cost_type === 'OPERATING' && !r.land_linked);
  // Land payments are the purchase of an asset, reported under land (not as expenses).
  const totalExpenses = sumExp((r) => r.cost_type !== 'LAND_PAYMENT');

  const plots = await one(`SELECT COALESCE(SUM(size_marla) FILTER (WHERE status <> 'CANCELLED'),0) AS plotted,
    COUNT(*) FILTER (WHERE status <> 'CANCELLED')::int AS n FROM plots`);
  const sales = await one(`SELECT COUNT(*)::int AS n, COALESCE(SUM(b.final_price),0) AS sales, COALESCE(SUM(b.size_marla),0) AS marla,
      COALESCE(SUM(b.booking_amount),0) AS booking_agreed, COALESCE(SUM(b.discount),0) AS discounts,
      COALESCE(SUM(f.paid),0) AS collected, COALESCE(SUM(f.balance),0) AS receivable, COALESCE(SUM(f.overdue_amount),0) AS overdue,
      COALESCE(SUM(f.charges_due),0) AS charges_due
    FROM bookings b JOIN v_booking_finance f ON f.booking_id = b.id WHERE b.status = 'ACTIVE'`);
  const split = await one(`SELECT
      COALESCE(SUM(a.amount) FILTER (WHERE i.kind IN ('BOOKING','DOWN_PAYMENT')),0) AS booking_collected,
      COALESCE(SUM(a.amount) FILTER (WHERE i.kind NOT IN ('BOOKING','DOWN_PAYMENT')),0) AS installments_collected
    FROM payment_allocations a JOIN installments i ON i.id = a.installment_id JOIN bookings b ON b.id = i.booking_id WHERE b.status = 'ACTIVE'`);
  const other = await one(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE purpose='CHARGE' AND status='VALID'`);
  const cancelled = await one(`SELECT COALESCE(SUM(pm.amount),0) AS paid FROM payments pm JOIN bookings b ON b.id = pm.booking_id
    WHERE b.status='CANCELLED' AND pm.status='VALID' AND pm.purpose='INSTALLMENT'`);
  const refunds = await one(`SELECT COALESCE(SUM(amount),0) AS s FROM refunds`);
  const cash = await one(`SELECT COALESCE(SUM(amount) FILTER (WHERE direction='IN'),0) AS cin, COALESCE(SUM(amount) FILTER (WHERE direction='OUT'),0) AS cout FROM ledger_entries`);
  const allReceived = await one(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status='VALID'`);

  const landInvestment = P(land.cost) + landExtra;
  const projectCost = landInvestment + development;
  const plottedMarla = Number(plots.plotted);
  // While a society is only partly plotted, spread cost over the expected saleable area instead of only the plots created so far.
  const costBasisMarla = Math.max(plottedMarla, Number(land.saleable));
  const costPerMarlaP = costBasisMarla > 0 ? Math.round(projectCost / costBasisMarla) : 0;
  const bookedSales = P(sales.sales);
  const collected = P(sales.collected);
  const costOfBooked = Math.round(costPerMarlaP * Number(sales.marla));
  const expectedGross = bookedSales - costOfBooked;
  const collectedRatio = bookedSales > 0 ? collected / bookedSales : 0;
  const realizedGross = Math.round(expectedGross * collectedRatio);
  const forfeited = P(cancelled.paid) - P(refunds.s);
  const otherIncome = P(other.s);
  const realizedNet = realizedGross + otherIncome + forfeited - operating;

  return {
    land_purchase_cost: R(P(land.cost)),
    land_additional_cost: R(landExtra),
    total_land_investment: R(landInvestment),
    land_payments_made: R(landPayments),
    land_payable: R(P(land.cost) - landPayments),
    development_expenses: R(development),
    operating_expenses: R(operating),
    total_expenses: R(totalExpenses),
    total_project_cost: R(projectCost),
    total_land_marla: Number(land.marla),
    plotted_marla: plottedMarla,
    saleable_marla: Number(land.saleable),
    cost_basis_marla: costBasisMarla,
    plot_count: plots.n,
    cost_per_marla: R(costPerMarlaP),
    active_bookings: sales.n,
    booked_marla: Number(sales.marla),
    total_sales: R(bookedSales),
    total_discounts: R(P(sales.discounts)),
    total_booking_amount_agreed: R(P(sales.booking_agreed)),
    total_booking_collected: R(P(split.booking_collected)),
    total_installments_collected: R(P(split.installments_collected)),
    total_collected_on_sales: R(collected),
    total_receivables: R(P(sales.receivable)),
    total_overdue: R(P(sales.overdue)),
    charges_outstanding: R(P(sales.charges_due)),
    other_income: R(otherIncome),
    forfeited_on_cancellation: R(forfeited),
    refunds_paid: R(P(refunds.s)),
    all_payments_received: R(P(allReceived.s)),
    cost_of_booked_area: R(costOfBooked),
    expected_gross_profit: R(expectedGross),
    collection_ratio: Math.round(collectedRatio * 10000) / 100,
    realized_gross_profit: R(realizedGross),
    realized_net_profit: R(realizedNet),
    cash_in: R(P(cash.cin)),
    cash_out: R(P(cash.cout)),
    net_cash: R(P(cash.cin) - P(cash.cout)),
  };
}

async function dashboard(db = pool) {
  const t = today();
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const land = await one(`SELECT COALESCE(SUM(total_marla),0) AS marla, COALESCE(SUM(total_sqft),0) AS sqft, COUNT(*)::int AS n FROM lands WHERE status='ACTIVE'`);
  const st = await one(`SELECT
      COUNT(*) FILTER (WHERE status <> 'CANCELLED')::int AS total,
      COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
      COUNT(*) FILTER (WHERE status = 'RESERVED')::int AS reserved,
      COUNT(*) FILTER (WHERE status = 'BOOKED')::int AS booked,
      COUNT(*) FILTER (WHERE status = 'TRANSFERRED')::int AS transferred,
      COUNT(*) FILTER (WHERE status = 'SOLD')::int AS sold,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS withdrawn,
      COALESCE(SUM(size_marla) FILTER (WHERE status <> 'CANCELLED'),0) AS plotted_marla
    FROM plots`);
  const customers = await one(`SELECT COUNT(*)::int AS n FROM customers WHERE NOT is_archived`);
  const todayCol = await one(`SELECT COALESCE(SUM(amount),0) AS s, COUNT(*)::int AS n FROM payments WHERE status='VALID' AND payment_date = $1`, [t]);
  const monthCol = await one(`SELECT COALESCE(SUM(amount),0) AS s, COUNT(*)::int AS n FROM payments WHERE status='VALID' AND payment_date BETWEEN $1 AND $2`, [monthStart(t), monthEnd(t)]);
  const upcoming = await one(`SELECT COUNT(*)::int AS n, COALESCE(SUM(i.amount - i.paid_amount),0) AS s FROM installments i JOIN bookings b ON b.id=i.booking_id
    WHERE b.status='ACTIVE' AND i.paid_amount < i.amount AND i.due_date BETWEEN $1 AND $2`, [t, addDays(t, 30)]);
  const overdueCust = await one(`SELECT COUNT(DISTINCT b.customer_id)::int AS n FROM bookings b JOIN v_booking_finance f ON f.booking_id=b.id WHERE b.status='ACTIVE' AND f.overdue_amount > 0`);
  const months = (await db.query(`
    WITH m AS (SELECT generate_series(date_trunc('month', $1::date) - interval '11 months', date_trunc('month', $1::date), interval '1 month')::date AS m)
    SELECT to_char(m.m, 'YYYY-MM') AS month,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.status='VALID' AND date_trunc('month', p.payment_date) = m.m), 0) AS collections,
      COALESCE((SELECT SUM(amount) FROM expenses e WHERE e.status='ACTIVE' AND date_trunc('month', e.expense_date) = m.m), 0) AS expenses
    FROM m ORDER BY m.m`, [t])).rows;
  const recent = (await db.query(`SELECT pm.id, pm.receipt_no, pm.payment_date, pm.amount, pm.method, pm.status, c.full_name AS customer_name, pl.plot_no
    FROM payments pm JOIN customers c ON c.id = pm.customer_id JOIN plots pl ON pl.id = pm.plot_id ORDER BY pm.id DESC LIMIT 8`)).rows;
  const dueSoon = (await db.query(`SELECT i.id, i.due_date, i.label, (i.amount - i.paid_amount) AS due, b.id AS booking_id, b.booking_no, c.full_name AS customer_name, c.mobile, pl.plot_no
    FROM installments i JOIN bookings b ON b.id = i.booking_id JOIN customers c ON c.id = b.customer_id JOIN plots pl ON pl.id = b.plot_id
    WHERE b.status='ACTIVE' AND i.paid_amount < i.amount AND i.due_date BETWEEN $1 AND $2 ORDER BY i.due_date LIMIT 8`, [t, addDays(t, 30)])).rows;
  const fin = await financialSummary(db);
  return {
    today: t,
    land: { marla: Number(land.marla), sqft: Number(land.sqft), count: land.n },
    plots: st,
    customers: customers.n,
    finance: {
      total_sales: fin.total_sales,
      total_received: fin.all_payments_received,
      collected_on_sales: fin.total_collected_on_sales,
      outstanding: Math.round((fin.total_receivables + fin.charges_outstanding) * 100) / 100,
      overdue: fin.total_overdue,
      today_collections: Number(todayCol.s), today_count: todayCol.n,
      month_collections: Number(monthCol.s), month_count: monthCol.n,
      total_expenses: fin.total_expenses,
      net_profit: fin.realized_net_profit,
      net_cash: fin.net_cash,
    },
    upcoming: { count: upcoming.n, amount: Number(upcoming.s) },
    overdue_customers: overdueCust.n,
    months: months.map((m) => ({ month: m.month, collections: Number(m.collections), expenses: Number(m.expenses) })),
    recent_payments: recent,
    due_soon: dueSoon,
  };
}

// ---------------------------------------------------------------------------------- tabular reports
// Each returns { title, subtitle, columns:[{key,header,type}], rows, totals?, summary? }
const C = (key, header, type = 'text', width) => ({ key, header, type, width });

function range(q, defFrom) {
  const to = isDate(q.to) ? q.to : today();
  const from = isDate(q.from) ? q.from : defFrom || monthStart(to);
  if (from > to) throw badRequest('"From" date must be before "To" date');
  return { from, to };
}
function totalsOf(rows, keys) {
  const t = {};
  for (const k of keys) t[k] = R(rows.reduce((s, r) => s + P(r[k]), 0));
  return t;
}

const reports = {
  async summary() {
    const f = await financialSummary();
    const rows = [
      ['Land purchase cost', f.land_purchase_cost], ['Additional land costs (linked to land)', f.land_additional_cost],
      ['TOTAL LAND INVESTMENT', f.total_land_investment], ['Payments made to land sellers', f.land_payments_made], ['Land amount still payable', f.land_payable],
      ['Development expenses', f.development_expenses], ['Total project cost (land + development)', f.total_project_cost],
      ['Plotted area (Marla)', f.plotted_marla, 'number'], ['Saleable area used for costing (Marla)', f.cost_basis_marla, 'number'], ['Cost per Marla', f.cost_per_marla],
      ['TOTAL PLOT SALES (booked, active)', f.total_sales], ['Booked area (Marla)', f.booked_marla, 'number'], ['Discounts given', f.total_discounts],
      ['Booking/down payments collected', f.total_booking_collected], ['Installments collected', f.total_installments_collected],
      ['TOTAL COLLECTED ON SALES', f.total_collected_on_sales], ['Collection ratio (%)', f.collection_ratio, 'number'],
      ['TOTAL OUTSTANDING RECEIVABLES', f.total_receivables], ['of which overdue', f.total_overdue], ['Unpaid charges (fees)', f.charges_outstanding],
      ['Other income (transfer/late fees)', f.other_income], ['Forfeited on cancellations', f.forfeited_on_cancellation], ['Refunds paid', f.refunds_paid],
      ['Operating expenses', f.operating_expenses], ['TOTAL EXPENSES (excluding land payments)', f.total_expenses],
      ['Cost of booked area', f.cost_of_booked_area], ['Expected gross profit on booked sales', f.expected_gross_profit],
      ['Realised gross profit (installment method)', f.realized_gross_profit], ['REALISED NET PROFIT', f.realized_net_profit],
      ['Cash in (all time)', f.cash_in], ['Cash out (all time)', f.cash_out], ['NET CASH POSITION', f.net_cash],
    ].map(([item, value, type]) => ({ item, value, type: type || 'money' }));
    return {
      title: 'Financial Summary', subtitle: `As of ${today()}`,
      columns: [C('item', 'Item', 'text', 60), C('value', 'Amount', 'mixed', 22)], rows, raw: f,
      notes: [
        'Realised gross profit = expected gross profit × (collected ÷ booked sales). Profit is recognised only as cash is collected.',
        'Realised net profit = realised gross profit + other income + forfeited amounts − operating expenses.',
        'Cost per Marla = (land investment + development expenses) ÷ saleable Marla (the larger of plotted Marla and the expected saleable area entered on land records).',
      ],
    };
  },

  async collections(q) {
    const { from, to } = range(q);
    const p = [from, to]; let extra = '';
    if (q.method) { p.push(q.method); extra = ` AND pm.method = $${p.length}`; }
    const rows = (await pool.query(`SELECT pm.receipt_no, pm.payment_date, c.full_name AS customer, pl.plot_no, bl.name AS block, b.booking_no,
        CASE WHEN pm.purpose='CHARGE' THEN ch.description ELSE 'Installment' END AS purpose, pm.method, pm.reference_no, pm.amount, u.full_name AS received_by
      FROM payments pm JOIN customers c ON c.id=pm.customer_id JOIN plots pl ON pl.id=pm.plot_id JOIN blocks bl ON bl.id=pl.block_id
      JOIN bookings b ON b.id=pm.booking_id LEFT JOIN charges ch ON ch.id=pm.charge_id LEFT JOIN users u ON u.id=pm.created_by
      WHERE pm.status='VALID' AND pm.payment_date BETWEEN $1 AND $2 ${extra} ORDER BY pm.payment_date, pm.id`, p)).rows;
    const byMethod = {};
    for (const r of rows) byMethod[r.method] = (byMethod[r.method] || 0) + P(r.amount);
    return {
      title: 'Payment Collection Report', subtitle: `${from} to ${to}${q.method ? ` · ${q.method}` : ''}`,
      columns: [C('receipt_no', 'Receipt'), C('payment_date', 'Date', 'date'), C('customer', 'Customer'), C('plot_no', 'Plot'), C('block', 'Block'),
        C('purpose', 'For'), C('method', 'Method'), C('reference_no', 'Reference'), C('amount', 'Amount', 'money'), C('received_by', 'Received by')],
      rows, totals: totalsOf(rows, ['amount']),
      summary: Object.entries(byMethod).map(([k, v]) => ({ label: k.replace('_', ' '), value: R(v) })),
    };
  },

  async 'daily-cash'(q) {
    const d = isDate(q.date) ? q.date : today();
    const rows = (await pool.query(`SELECT l.created_at, l.entry_type, l.direction, l.method, l.reference, l.description,
        CASE WHEN l.direction='IN' THEN l.amount ELSE 0 END AS cash_in, CASE WHEN l.direction='OUT' THEN l.amount ELSE 0 END AS cash_out
      FROM ledger_entries l WHERE l.entry_date = $1 ORDER BY l.id`, [d])).rows;
    const opening = (await pool.query(`SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0) AS s FROM ledger_entries WHERE entry_date < $1`, [d])).rows[0].s;
    const t = totalsOf(rows, ['cash_in', 'cash_out']);
    const methods = (await pool.query(`SELECT method, SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END) AS net FROM ledger_entries WHERE entry_date=$1 GROUP BY method`, [d])).rows;
    return {
      title: 'Daily Cash Report', subtitle: d,
      columns: [C('entry_type', 'Type'), C('reference', 'Reference'), C('description', 'Description'), C('method', 'Method'), C('cash_in', 'Cash In', 'money'), C('cash_out', 'Cash Out', 'money')],
      rows, totals: t,
      summary: [
        { label: 'Opening balance (all methods)', value: Number(opening) }, { label: 'Total in', value: t.cash_in }, { label: 'Total out', value: t.cash_out },
        { label: 'Net for the day', value: R(P(t.cash_in) - P(t.cash_out)) }, { label: 'Closing balance', value: R(P(opening) + P(t.cash_in) - P(t.cash_out)) },
        ...methods.map((m) => ({ label: `Net ${m.method || 'OTHER'}`, value: Number(m.net) })),
      ],
    };
  },

  async 'monthly-cash'(q) {
    const m = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : today().slice(0, 7);
    const from = `${m}-01`; const to = monthEnd(from);
    const rows = (await pool.query(`
      SELECT d::date AS day,
        COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type='PAYMENT_RECEIVED'),0) AS received,
        COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type='CAPITAL_CONTRIBUTION'),0) AS capital_in,
        COALESCE(SUM(l.amount) FILTER (WHERE l.direction='IN' AND l.entry_type NOT IN ('PAYMENT_RECEIVED','CAPITAL_CONTRIBUTION')),0) AS other_in,
        COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type='LAND_PAYMENT'),0) AS land_payments,
        COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type='EXPENSE_PAID'),0) AS expenses,
        COALESCE(SUM(l.amount) FILTER (WHERE l.direction='OUT' AND l.entry_type NOT IN ('EXPENSE_PAID','LAND_PAYMENT')),0) AS refunds_reversals,
        COALESCE(SUM(CASE WHEN l.direction='IN' THEN l.amount WHEN l.direction='OUT' THEN -l.amount ELSE 0 END),0) AS net
      FROM generate_series($1::date, $2::date, interval '1 day') d LEFT JOIN ledger_entries l ON l.entry_date = d::date
      GROUP BY d ORDER BY d`, [from, to])).rows
      .filter((r) => P(r.received) || P(r.capital_in) || P(r.other_in) || P(r.land_payments) || P(r.expenses) || P(r.refunds_reversals));
    return {
      title: 'Monthly Cash Report', subtitle: m,
      columns: [C('day', 'Date', 'date'), C('received', 'Customer Payments', 'money'), C('capital_in', 'Personal Investment', 'money'), C('other_in', 'Other In', 'money'),
        C('land_payments', 'Land Payments', 'money'), C('expenses', 'Expenses', 'money'), C('refunds_reversals', 'Refunds / Reversals', 'money'), C('net', 'Net', 'money')],
      rows, totals: totalsOf(rows, ['received', 'capital_in', 'other_in', 'land_payments', 'expenses', 'refunds_reversals', 'net']),
    };
  },

  async overdue(q) {
    const asOf = isDate(q.as_of) ? q.as_of : today();
    const rows = (await pool.query(`
      SELECT b.id AS booking_id, b.booking_no, c.full_name AS customer, c.mobile, c.whatsapp, pl.plot_no, bl.name AS block, s.name AS society,
        COUNT(i.id)::int AS overdue_count, SUM(i.amount - i.paid_amount) AS overdue_amount, MIN(i.due_date) AS oldest_due, f.balance
      FROM installments i JOIN bookings b ON b.id = i.booking_id JOIN customers c ON c.id = b.customer_id JOIN plots pl ON pl.id = b.plot_id
      JOIN blocks bl ON bl.id = pl.block_id JOIN societies s ON s.id = pl.society_id JOIN v_booking_finance f ON f.booking_id = b.id
      WHERE b.status='ACTIVE' AND i.paid_amount < i.amount AND i.due_date < $1
      GROUP BY b.id, c.id, pl.id, bl.name, s.name, f.balance ORDER BY MIN(i.due_date)`, [asOf])).rows
      .map((r) => ({ ...r, days_overdue: daysBetween(r.oldest_due, asOf) }));
    // Suggested late fee (only when an admin has enabled late fees in Settings).
    const inst = (await pool.query(`SELECT i.booking_id, i.amount, i.paid_amount, i.due_date FROM installments i JOIN bookings b ON b.id=i.booking_id
      WHERE b.status='ACTIVE' AND i.paid_amount < i.amount AND i.due_date < $1`, [asOf])).rows;
    const fee = {};
    for (const i of inst) fee[i.booking_id] = (fee[i.booking_id] || 0) + P(await lateFeeFor(i, asOf));
    rows.forEach((r) => { r.suggested_late_fee = R(fee[r.booking_id] || 0); });
    return {
      title: 'Overdue Installments Report', subtitle: `As of ${asOf}`,
      columns: [C('booking_no', 'Booking'), C('customer', 'Customer'), C('mobile', 'Mobile'), C('society', 'Society'), C('block', 'Block'), C('plot_no', 'Plot'),
        C('overdue_count', 'Overdue #', 'number'), C('oldest_due', 'Oldest Due', 'date'), C('days_overdue', 'Days', 'number'),
        C('overdue_amount', 'Overdue Amount', 'money'), C('balance', 'Total Balance', 'money'), C('suggested_late_fee', 'Late Fee*', 'money')],
      rows, totals: totalsOf(rows, ['overdue_amount', 'balance', 'suggested_late_fee']),
      notes: ['* Late fee is only a suggestion based on Settings. It is never charged unless an administrator posts it on the booking.'],
    };
  },

  async upcoming(q) {
    const days = Math.min(Math.max(Number(q.days) || 30, 1), 366);
    const from = today(); const to = addDays(from, days);
    const rows = (await pool.query(`SELECT i.due_date, i.label, (i.amount - i.paid_amount) AS due, b.booking_no, c.full_name AS customer, c.mobile, pl.plot_no, bl.name AS block
      FROM installments i JOIN bookings b ON b.id = i.booking_id JOIN customers c ON c.id = b.customer_id JOIN plots pl ON pl.id = b.plot_id JOIN blocks bl ON bl.id = pl.block_id
      WHERE b.status='ACTIVE' AND i.paid_amount < i.amount AND i.due_date BETWEEN $1 AND $2 ORDER BY i.due_date, c.full_name`, [from, to])).rows;
    return {
      title: 'Upcoming Installments', subtitle: `${from} to ${to}`,
      columns: [C('due_date', 'Due Date', 'date'), C('customer', 'Customer'), C('mobile', 'Mobile'), C('block', 'Block'), C('plot_no', 'Plot'), C('booking_no', 'Booking'),
        C('label', 'Installment'), C('due', 'Amount Due', 'money')],
      rows, totals: totalsOf(rows, ['due']),
    };
  },

  async sales(q) {
    const { from, to } = range(q, `${today().slice(0, 4)}-01-01`);
    const rows = (await pool.query(`SELECT b.booking_no, b.booking_date, c.full_name AS customer, s.name AS society, bl.name AS block, pl.plot_no, b.size_marla,
        b.rate_per_marla, b.total_price, b.discount, b.final_price, f.paid, f.balance, b.plan_type, b.status
      FROM bookings b JOIN customers c ON c.id = b.original_customer_id JOIN plots pl ON pl.id = b.plot_id JOIN blocks bl ON bl.id = pl.block_id
      JOIN societies s ON s.id = pl.society_id JOIN v_booking_finance f ON f.booking_id = b.id
      WHERE b.booking_date BETWEEN $1 AND $2 ORDER BY b.booking_date, b.id`, [from, to])).rows;
    const active = rows.filter((r) => r.status === 'ACTIVE');
    return {
      title: 'Sales Report', subtitle: `${from} to ${to}`,
      columns: [C('booking_no', 'Booking'), C('booking_date', 'Date', 'date'), C('customer', 'Buyer'), C('block', 'Block'), C('plot_no', 'Plot'),
        C('size_marla', 'Marla', 'number'), C('rate_per_marla', 'Rate/Marla', 'money'), C('total_price', 'Total', 'money'), C('discount', 'Discount', 'money'),
        C('final_price', 'Final Price', 'money'), C('paid', 'Paid', 'money'), C('balance', 'Balance', 'money'), C('plan_type', 'Plan'), C('status', 'Status')],
      rows, totals: totalsOf(active, ['total_price', 'discount', 'final_price', 'paid', 'balance']),
      notes: ['Totals include active bookings only. Cancelled bookings are listed for reference.'],
    };
  },

  async receivables() {
    const rows = (await pool.query(`SELECT b.booking_no, c.full_name AS customer, c.mobile, bl.name AS block, pl.plot_no, b.final_price, f.paid, f.balance,
        f.overdue_amount, f.next_due_date, f.next_due_amount, f.charges_due
      FROM bookings b JOIN v_booking_finance f ON f.booking_id = b.id JOIN customers c ON c.id = b.customer_id JOIN plots pl ON pl.id = b.plot_id
      JOIN blocks bl ON bl.id = pl.block_id WHERE b.status='ACTIVE' AND (f.balance > 0 OR f.charges_due > 0) ORDER BY f.balance DESC`)).rows;
    return {
      title: 'Outstanding Receivables', subtitle: `As of ${today()}`,
      columns: [C('booking_no', 'Booking'), C('customer', 'Customer'), C('mobile', 'Mobile'), C('block', 'Block'), C('plot_no', 'Plot'),
        C('final_price', 'Price', 'money'), C('paid', 'Paid', 'money'), C('balance', 'Balance', 'money'), C('overdue_amount', 'Overdue', 'money'),
        C('next_due_date', 'Next Due', 'date'), C('next_due_amount', 'Next Amount', 'money'), C('charges_due', 'Charges Due', 'money')],
      rows, totals: totalsOf(rows, ['final_price', 'paid', 'balance', 'overdue_amount', 'charges_due']),
    };
  },

  async expenses(q) {
    const { from, to } = range(q, `${today().slice(0, 4)}-01-01`);
    const group = ['daily', 'monthly', 'yearly'].includes(q.group) ? q.group : 'monthly';
    const fmt = { daily: 'YYYY-MM-DD', monthly: 'YYYY-MM', yearly: 'YYYY' }[group];
    const rows = (await pool.query(`SELECT to_char(e.expense_date, '${fmt}') AS period, c.name AS category, c.cost_type, COUNT(*)::int AS entries, SUM(e.amount) AS amount
      FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.status='ACTIVE' AND e.expense_date BETWEEN $1 AND $2
      GROUP BY 1, c.name, c.cost_type, c.sort_order ORDER BY 1, c.sort_order`, [from, to])).rows;
    const byCat = {};
    for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + P(r.amount);
    return {
      title: `Expense Report (${group})`, subtitle: `${from} to ${to}`,
      columns: [C('period', group === 'daily' ? 'Date' : group === 'monthly' ? 'Month' : 'Year'), C('category', 'Category'), C('cost_type', 'Type'),
        C('entries', 'Entries', 'number'), C('amount', 'Amount', 'money')],
      rows, totals: totalsOf(rows, ['amount']),
      summary: Object.entries(byCat).map(([label, v]) => ({ label, value: R(v) })),
    };
  },

  async 'expense-list'(q) {
    const { from, to } = range(q, `${today().slice(0, 4)}-01-01`);
    const rows = (await pool.query(`SELECT e.expense_no, e.expense_date, c.name AS category, e.description, e.paid_to, e.method, e.reference_no, e.amount, e.status, u.full_name AS entered_by
      FROM expenses e JOIN expense_categories c ON c.id=e.category_id LEFT JOIN users u ON u.id=e.created_by
      WHERE e.expense_date BETWEEN $1 AND $2 ORDER BY e.expense_date, e.id`, [from, to])).rows;
    return {
      title: 'Expense List', subtitle: `${from} to ${to}`,
      columns: [C('expense_no', 'No'), C('expense_date', 'Date', 'date'), C('category', 'Category'), C('description', 'Description'), C('paid_to', 'Paid To'),
        C('method', 'Method'), C('amount', 'Amount', 'money'), C('status', 'Status'), C('entered_by', 'Entered By')],
      rows, totals: totalsOf(rows.filter((r) => r.status === 'ACTIVE'), ['amount']),
      notes: ['Total excludes cancelled expenses.'],
    };
  },

  async inventory(q) {
    const p = []; let where = '';
    if (q.society_id) { p.push(Number(q.society_id)); where = 'WHERE p.society_id = $1'; }
    const rows = (await pool.query(`SELECT s.name AS society, bl.name AS block, p.plot_no, p.street_no, p.size_marla, p.category,
        concat_ws(', ', CASE WHEN p.is_corner THEN 'Corner' END, CASE WHEN p.is_main_road THEN 'Main Road' END, CASE WHEN p.is_park_facing THEN 'Park' END) AS features,
        p.price_per_marla, p.list_price, p.discount, p.status, c.full_name AS owner, f.balance
      FROM plots p JOIN blocks bl ON bl.id = p.block_id JOIN societies s ON s.id = p.society_id LEFT JOIN bookings b ON b.id = p.current_booking_id
      LEFT JOIN customers c ON c.id = b.customer_id LEFT JOIN v_booking_finance f ON f.booking_id = b.id ${where}
      ORDER BY s.name, bl.sort_order, bl.name, NULLIF(regexp_replace(p.plot_no, '\\D', '', 'g'), '')::numeric NULLS LAST, p.plot_no`, p)).rows;
    return {
      title: 'Plot Inventory', subtitle: today(),
      columns: [C('society', 'Society'), C('block', 'Block'), C('plot_no', 'Plot'), C('street_no', 'Street'), C('size_marla', 'Marla', 'number'), C('category', 'Category'),
        C('features', 'Features'), C('price_per_marla', 'Rate/Marla', 'money'), C('list_price', 'List Price', 'money'), C('status', 'Status'), C('owner', 'Owner'), C('balance', 'Balance', 'money')],
      rows,
    };
  },

  async 'customer-ledger'(q) {
    const id = Number(q.customer_id);
    if (!id) throw badRequest('Select a customer');
    const cu = (await pool.query('SELECT * FROM customers WHERE id=$1', [id])).rows[0];
    if (!cu) throw notFound('Customer');
    const ev = (await pool.query(`
      SELECT * FROM (
        SELECT b.booking_date AS date, 1 AS ord, b.id AS sid, 'Booking ' || b.booking_no || ' - Plot ' || pl.plot_no AS particulars, b.booking_no AS ref,
               b.final_price AS debit, 0::numeric AS credit FROM bookings b JOIN plots pl ON pl.id=b.plot_id WHERE b.original_customer_id = $1
        UNION ALL
        SELECT t.transfer_date, 1, t.id, 'Plot ' || pl.plot_no || ' transferred IN (' || t.transfer_no || ')', t.transfer_no, t.balance_at_transfer, 0
          FROM transfers t JOIN plots pl ON pl.id=t.plot_id WHERE t.to_customer_id = $1
        UNION ALL
        SELECT t.transfer_date, 2, t.id, 'Plot ' || pl.plot_no || ' transferred OUT (' || t.transfer_no || ')', t.transfer_no, 0, t.balance_at_transfer
          FROM transfers t JOIN plots pl ON pl.id=t.plot_id WHERE t.from_customer_id = $1
        UNION ALL
        SELECT ch.charge_date, 3, ch.id, ch.description || CASE WHEN ch.status='WAIVED' THEN ' (balance waived)' ELSE '' END, ch.charge_type,
          CASE WHEN ch.status='ACTIVE' THEN ch.amount ELSE ch.paid END, 0
          FROM v_charge_finance ch LEFT JOIN transfers t ON t.id = ch.transfer_id
          WHERE (ch.status='ACTIVE' OR ch.paid > 0) AND $1 = (CASE
            WHEN ch.charge_type='TRANSFER_FEE' AND t.id IS NOT NULL THEN (CASE WHEN t.fee_paid_by='TO' THEN t.to_customer_id ELSE t.from_customer_id END)
            ELSE (SELECT o.customer_id FROM ownership_history o WHERE o.booking_id = ch.booking_id AND o.start_date <= ch.charge_date
                  ORDER BY o.start_date DESC, o.id DESC LIMIT 1) END)
        UNION ALL
        SELECT pm.payment_date, 4, pm.id, 'Payment received (' || pm.method || ')' || CASE WHEN pm.status='REVERSED' THEN ' - REVERSED' ELSE '' END, pm.receipt_no,
          0, pm.amount FROM payments pm WHERE pm.customer_id = $1
        UNION ALL
        SELECT (pm.reversed_at AT TIME ZONE 'Asia/Karachi')::date, 5, pm.id, 'Reversal of ' || pm.receipt_no || ': ' || pm.reversal_reason, pm.receipt_no, pm.amount, 0
          FROM payments pm WHERE pm.customer_id = $1 AND pm.status='REVERSED'
        UNION ALL
        SELECT (b.cancelled_at AT TIME ZONE 'Asia/Karachi')::date, 6, b.id, 'Booking ' || b.booking_no || ' cancelled (price reversed)', b.booking_no, 0,
          b.final_price - COALESCE((SELECT SUM(amount) FROM payments WHERE booking_id=b.id AND purpose='INSTALLMENT' AND status='VALID'),0)
          FROM bookings b WHERE b.customer_id = $1 AND b.status='CANCELLED'
        UNION ALL
        SELECT r.refund_date, 7, r.id, 'Refund of Rs ' || to_char(r.amount, 'FM999,999,999,990.00') || ' paid to customer (' || r.method || ') - for reference', r.refund_no, 0, 0
          FROM refunds r WHERE r.customer_id = $1
      ) x ORDER BY date, ord, sid`, [id])).rows;
    let bal = 0;
    const rows = ev.map((e) => { bal += P(e.debit) - P(e.credit); return { ...e, balance: R(bal) }; });
    return {
      title: 'Customer Ledger', subtitle: `${cu.customer_code} · ${cu.full_name}${cu.father_name ? ` s/o ${cu.father_name}` : ''} · CNIC ${cu.cnic}`,
      columns: [C('date', 'Date', 'date'), C('particulars', 'Particulars'), C('ref', 'Reference'), C('debit', 'Debit (Due)', 'money'), C('credit', 'Credit (Paid)', 'money'), C('balance', 'Balance', 'money')],
      rows, totals: totalsOf(rows, ['debit', 'credit']),
      notes: ['Debit = amounts payable by the customer; Credit = payments received. Balance = amount still payable (including charges).',
        'Refunds are shown for reference: the cancelled amount already removes what the customer owes.'],
      customer: cu,
    };
  },

  async 'plot-ledger'(q) {
    const id = Number(q.plot_id);
    if (!id) throw badRequest('Select a plot');
    const pl = (await pool.query(`SELECT p.*, bl.name AS block_name, s.name AS society_name FROM plots p JOIN blocks bl ON bl.id=p.block_id
      JOIN societies s ON s.id=p.society_id WHERE p.id=$1`, [id])).rows[0];
    if (!pl) throw notFound('Plot');
    const rows = (await pool.query(`
      SELECT * FROM (
        SELECT b.booking_date AS date, 1 AS ord, 'Booked by ' || c.full_name || ' (' || b.booking_no || ')' AS particulars, b.booking_no AS ref, b.final_price AS debit, 0::numeric AS credit, b.status AS note
          FROM bookings b JOIN customers c ON c.id=b.original_customer_id WHERE b.plot_id=$1
        UNION ALL
        SELECT pm.payment_date, 2, 'Payment from ' || c.full_name || CASE WHEN pm.status='REVERSED' THEN ' (REVERSED)' ELSE '' END, pm.receipt_no, 0,
          CASE WHEN pm.status='VALID' AND pm.purpose='INSTALLMENT' THEN pm.amount ELSE 0 END, pm.purpose
          FROM payments pm JOIN customers c ON c.id=pm.customer_id WHERE pm.plot_id=$1
        UNION ALL
        SELECT t.transfer_date, 3, 'Transferred ' || fc.full_name || ' → ' || tc.full_name, t.transfer_no, 0, 0, 'Fee ' || t.transfer_fee
          FROM transfers t JOIN customers fc ON fc.id=t.from_customer_id JOIN customers tc ON tc.id=t.to_customer_id WHERE t.plot_id=$1
        UNION ALL
        SELECT (b.cancelled_at AT TIME ZONE 'Asia/Karachi')::date, 4, 'Booking cancelled: ' || b.cancel_reason, b.booking_no, 0,
          b.final_price - COALESCE((SELECT SUM(amount) FROM payments WHERE booking_id=b.id AND purpose='INSTALLMENT' AND status='VALID'),0), 'Refund ' || b.refund_amount
          FROM bookings b WHERE b.plot_id=$1 AND b.status='CANCELLED'
      ) x ORDER BY date, ord`, [id])).rows;
    let bal = 0;
    rows.forEach((r) => { bal += P(r.debit) - P(r.credit); r.balance = R(bal); });
    return {
      title: 'Plot Ledger', subtitle: `${pl.society_name} · Block ${pl.block_name} · Plot ${pl.plot_no} · ${Number(pl.size_marla)} Marla · ${pl.status}`,
      columns: [C('date', 'Date', 'date'), C('particulars', 'Particulars'), C('ref', 'Reference'), C('debit', 'Price', 'money'), C('credit', 'Paid', 'money'), C('balance', 'Balance', 'money'), C('note', 'Note')],
      rows, totals: totalsOf(rows, ['debit', 'credit']),
    };
  },
};

Object.assign(reports, require('./landReports'));

async function runReport(name, q) {
  const fn = reports[name];
  if (!fn) throw notFound('Report');
  return fn(q || {});
}

module.exports = { financialSummary, dashboard, runReport, REPORT_NAMES: Object.keys(reports) };
