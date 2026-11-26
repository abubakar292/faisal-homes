import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Wallet, Users, PiggyBank, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { date, METHODS, pkr, toPaisa } from '../lib/format.js';
import { Input, Select } from './ui.jsx';

/**
 * Where did the money come from? Used by "Pay Land Owner" and "Add land expense".
 * Every payment must name its source(s); split sources must add up exactly to the payment amount.
 */
export const SOURCE_TYPES = [
  ['PERSONAL_NEW', "Owner's personal investment (new money put in now)"],
  ['PERSONAL_EXISTING', 'Balance of an earlier personal investment'],
  ['CUSTOMER', 'Customer advance / recovery (money already collected)'],
];
const ICON = { PERSONAL_NEW: PiggyBank, PERSONAL_EXISTING: Wallet, CUSTOMER: Users };
let seq = 0;
export const newSource = (over = {}) => ({ key: ++seq, type: 'PERSONAL_NEW', amount: '', investor_id: '', investment_date: '', method: '', reference_no: '', notes: '', capital_id: '', payment_id: '', filter: '', ...over });

/** Convert the rows to what the server expects. */
export function sourcesPayload(rows, { useDate, method } = {}) {
  return rows.map((r) => {
    const base = { type: r.type, amount: r.amount, notes: r.notes || undefined };
    if (r.type === 'PERSONAL_NEW') {
      return { ...base, investor_id: r.investor_id ? Number(r.investor_id) : undefined, investment_date: r.investment_date || useDate, method: r.method || method || 'CASH', reference_no: r.reference_no || undefined };
    }
    if (r.type === 'PERSONAL_EXISTING') return { ...base, capital_id: r.capital_id ? Number(r.capital_id) : undefined };
    return { ...base, payment_id: r.payment_id ? Number(r.payment_id) : undefined, customer_id: r.customer_id || undefined, booking_id: r.booking_id || undefined };
  });
}

export function sourcesCheck(rows, total) {
  const totalP = toPaisa(total);
  const sumP = rows.reduce((s, r) => s + toPaisa(r.amount), 0);
  return { totalP, sumP, diffP: totalP - sumP, ok: totalP > 0 && sumP === totalP };
}

export default function FundingSources({ rows, onChange, total, useDate }) {
  const { data: capital } = useApi('/investments');
  const { data: receipts } = useApi('/investments/customer-funds');
  const { data: investors } = useApi('/investments/investors');
  const investorOptions = (investors || []).filter((x) => x.is_active).map((x) => [x.id, x.name]);
  const set = (key, patch) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const { sumP, diffP, totalP } = sourcesCheck(rows, total);

  // Balance left on each investment / receipt after what the OTHER rows of this form already take.
  const usedBy = (field, id, exceptKey) => rows.filter((r) => r.key !== exceptKey && String(r[field]) === String(id)).reduce((s, r) => s + toPaisa(r.amount), 0);
  const capList = useMemo(() => (capital || []).filter((c) => c.status === 'VALID' && toPaisa(c.available) > 0 && (!useDate || c.contribution_date <= useDate)), [capital, useDate]);
  const recList = useMemo(() => (receipts || []).filter((r) => !useDate || r.payment_date <= useDate), [receipts, useDate]);

  return (
    <fieldset className="rounded-xl border-2 border-gold-200 bg-gold-50/40 p-3 sm:p-4">
      <legend className="px-1 text-sm font-bold text-navy-900">Payment source <span className="text-red-600">*</span></legend>
      <p className="mb-3 text-xs text-slate-600">Tell the system where this money came from. You can split one payment between personal investment and customer money — the parts must add up exactly to the payment amount.</p>
      <div className="space-y-3">
        {rows.map((r, i) => {
          const Icon = ICON[r.type];
          const cap = (capital || []).find((c) => String(c.id) === String(r.capital_id));
          const rec = (receipts || []).find((x) => String(x.payment_id) === String(r.payment_id));
          const capLeft = cap ? toPaisa(cap.available) - usedBy('capital_id', cap.id, r.key) : 0;
          const recLeft = rec ? toPaisa(rec.available) - usedBy('payment_id', rec.payment_id, r.key) : 0;
          const f = r.filter.trim().toLowerCase();
          const recShown = recList.filter((x) => !f || `${x.customer_name} ${x.customer_code} ${x.receipt_no} ${x.plot_no} ${x.booking_no} ${x.block_name}`.toLowerCase().includes(f));
          const fill = () => set(r.key, { amount: String(Math.max(0, (diffP + toPaisa(r.amount))) / 100) });
          return (
            <div key={r.key} className="rounded-lg border border-slate-200 bg-white p-3" data-testid="funding-row">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-gold-600" />
                <span className="text-sm font-semibold text-navy-900">Source {i + 1}</span>
                {rows.length > 1 && <button type="button" className="btn-ghost btn-sm ml-auto text-red-700" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" />Remove</button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Source of money" className="sm:col-span-2" value={r.type} onChange={(e) => set(r.key, { type: e.target.value, capital_id: '', payment_id: '', investor_id: '' })} options={SOURCE_TYPES} />
                {r.type === 'PERSONAL_NEW' && <>
                  <Select label="Investor" required value={r.investor_id} onChange={(e) => set(r.key, { investor_id: e.target.value })}
                    placeholder={investorOptions.length ? 'Select the investor…' : 'No investor yet: add one on the Personal Investment page'} options={investorOptions}
                    hint={<Link to="/investments" className="font-semibold text-navy-700 hover:underline">Add or see investors</Link>} />
                  <Input label="Investment date" type="date" value={r.investment_date || useDate || ''} max={useDate} onChange={(e) => set(r.key, { investment_date: e.target.value })} />
                  <Select label="How the money came in" value={r.method} onChange={(e) => set(r.key, { method: e.target.value })} placeholder="Same as payment" options={METHODS} />
                  <Input label="Reference (optional)" value={r.reference_no} onChange={(e) => set(r.key, { reference_no: e.target.value })} />
                </>}
                {r.type === 'PERSONAL_EXISTING' && (
                  <Select label="Investment" required className="sm:col-span-2" value={r.capital_id} onChange={(e) => set(r.key, { capital_id: e.target.value })}
                    placeholder={capList.length ? 'Select an investment with balance…' : 'No unused personal investment available'}
                    options={capList.map((c) => [c.id, `${c.contribution_no} · ${c.investor_name} · ${date(c.contribution_date)} · available ${pkr(c.available)}`])}
                    hint={cap ? `Still available for this payment: ${pkr(capLeft / 100)}` : 'Investments are added on the Personal Investment page, or as "new money" here.'} />
                )}
                {r.type === 'CUSTOMER' && <>
                  <Input label="Find customer receipt" className="sm:col-span-2" value={r.filter} onChange={(e) => set(r.key, { filter: e.target.value })} placeholder="Customer name, receipt no, plot no or booking no…" />
                  <Select label="Original collection (receipt)" required className="sm:col-span-2" value={r.payment_id}
                    onChange={(e) => { const x = (receipts || []).find((y) => String(y.payment_id) === e.target.value); set(r.key, { payment_id: e.target.value, customer_id: x?.customer_id || '', booking_id: x?.booking_id || '' }); }}
                    placeholder={recShown.length ? 'Select the receipt whose money is used…' : 'No customer money available'}
                    options={recShown.map((x) => [x.payment_id, `${x.receipt_no} · ${x.customer_name} · Plot ${x.plot_no} (${x.block_name}) · ${date(x.payment_date)} · available ${pkr(x.available)}`])} />
                  {rec && (
                    <div className="sm:col-span-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      Customer <b>{rec.customer_name}</b> ({rec.customer_code}) · Booking <b>{rec.booking_no}</b> · Plot <b>{rec.plot_no}</b>, Block {rec.block_name} · Receipt <b>{rec.receipt_no}</b> of {date(rec.payment_date)} for {pkr(rec.amount)} ·
                      {' '}still available: <b>{pkr(recLeft / 100)}</b>. The customer's own account is not changed.
                    </div>
                  )}
                </>}
                <Input label="Amount from this source (Rs)" required inputMode="decimal" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })}
                  hint={<button type="button" className="font-semibold text-navy-700 hover:underline" onClick={fill}>Use the amount still to assign</button>} />
                <Input label="Notes (optional)" value={r.notes} onChange={(e) => set(r.key, { notes: e.target.value })} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...rows, newSource({ type: rows.some((x) => x.type === 'CUSTOMER') ? 'PERSONAL_NEW' : 'CUSTOMER' })])}><Plus className="h-4 w-4" />Add another source (split payment)</button>
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${diffP === 0 && totalP > 0 ? 'text-emerald-700' : 'text-amber-700'}`} data-testid="funding-check">
          {diffP === 0 && totalP > 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          Sources: {pkr(sumP / 100)} of {pkr(totalP / 100)}
          {diffP > 0 && ` — ${pkr(diffP / 100)} still to assign`}
          {diffP < 0 && ` — ${pkr(-diffP / 100)} too much`}
        </div>
      </div>
    </fieldset>
  );
}
