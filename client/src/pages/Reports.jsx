import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Banknote, CalendarDays, CalendarRange, AlertTriangle, CalendarClock, TrendingUp, Scale, ShoppingCart, ListChecks, Grid3x3, User, Map, Landmark, BookOpen, HandCoins, PiggyBank, Users } from 'lucide-react';
import { qs } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { date, METHODS, num, pkr, todayStr } from '../lib/format.js';
import { addMonthsStr } from '../lib/dates.js';
import ExportButtons from '../components/ExportButtons.jsx';
import { CustomerPicker } from '../components/Pickers.jsx';
import { Card, ErrorBox, Input, Loading, Notice, PageHeader, Select, Empty } from '../components/ui.jsx';

const today = todayStr();
const REPORTS = [
  { key: 'summary', label: 'Financial Summary', icon: BarChart3, desc: 'Land investment, sales, collections, receivables, expenses and realised profit' },
  { key: 'collections', label: 'Payment Collections', icon: Banknote, desc: 'All receipts in a period, by method', params: ['from', 'to', 'method'] },
  { key: 'daily-cash', label: 'Daily Cash Report', icon: CalendarDays, desc: 'Cash book for one day with opening and closing balance', params: ['date'] },
  { key: 'monthly-cash', label: 'Monthly Cash Report', icon: CalendarRange, desc: 'Day-by-day money in and out for a month', params: ['month'] },
  { key: 'overdue', label: 'Overdue Installments', icon: AlertTriangle, desc: 'Customers with unpaid installments past due', params: ['as_of'] },
  { key: 'upcoming', label: 'Upcoming Installments', icon: CalendarClock, desc: 'Installments due soon', params: ['days'] },
  { key: 'sales', label: 'Sales Report', icon: TrendingUp, desc: 'Bookings made in a period', params: ['from', 'to'] },
  { key: 'receivables', label: 'Outstanding Receivables', icon: Scale, desc: 'Balance due on every active booking' },
  { key: 'expenses', label: 'Expense Summary', icon: ShoppingCart, desc: 'Expenses by day, month or year and category', params: ['from', 'to', 'group'] },
  { key: 'expense-list', label: 'Expense List', icon: ListChecks, desc: 'Every expense entry', params: ['from', 'to'] },
  { key: 'inventory', label: 'Plot Inventory', icon: Grid3x3, desc: 'All plots with status and owner', params: ['society_id'] },
  { key: 'customer-ledger', label: 'Customer Ledger', icon: User, desc: 'Statement of account for one customer', params: ['customer'] },
  { key: 'plot-ledger', label: 'Plot Ledger', icon: Map, desc: 'Full history of one plot', params: ['plot'] },
  { key: 'land-statement', label: 'Land Statement', icon: BookOpen, desc: 'Ledger of one land: price, every payment, source and balance', params: ['land'], group: 'Land purchase' },
  { key: 'land-owners', label: 'Owner-wise Land Payments', icon: Users, desc: 'Purchase price, paid and remaining for each land owner', group: 'Land purchase' },
  { key: 'land-payments', label: 'Land Payment History', icon: HandCoins, desc: 'Every payment to land owners in a period', params: ['from', 'to', 'land_opt'], group: 'Land purchase' },
  { key: 'land-outstanding', label: 'Outstanding Land Payments', icon: Landmark, desc: 'Lands with money still payable to the owner', group: 'Land purchase' },
  { key: 'investment', label: 'Personal Investment', icon: PiggyBank, desc: 'Owner investment entries, how they were used, balance', group: 'Land purchase' },
  { key: 'customer-money', label: 'Customer Money Used for Land', icon: Users, desc: 'Which customer receipts paid for land, with plot and booking', group: 'Land purchase' },
];

const head = (s) => s.split('(')[0].trim();
const isStrong = (s) => head(s) === head(s).toUpperCase();
function nice(s) {
  const h = head(s);
  if (h !== h.toUpperCase()) return s;
  return h.charAt(0) + h.slice(1).toLowerCase() + s.slice(s.split('(')[0].length).replace(/^\s*/, ' ').trimEnd();
}
function cell(c, v, r) {
  if (v === null || v === undefined || v === '') return '—';
  const type = c.type === 'mixed' ? (r.type === 'money' ? 'money' : 'number') : c.type;
  if (type === 'money') return pkr(v);
  if (type === 'date') return date(v);
  if (type === 'number') return num(v);
  return String(v);
}

export default function ReportsPage() {
  const [sp, setSp] = useSearchParams();
  const key = sp.get('r') || 'summary';
  const def = REPORTS.find((r) => r.key === key) || REPORTS[0];
  const [p, setP] = useState({ from: addMonthsStr(today, -1), to: today, method: '', date: today, month: today.slice(0, 7), as_of: today, days: '30', group: 'monthly', society_id: '', customer: null, plot_id: '', land_id: '' });
  const { data: socs } = useApi('/societies');
  const { data: plots } = useApi(def.key === 'plot-ledger' ? '/plots' : null);
  const { data: lands } = useApi((def.params || []).some((k) => k.startsWith('land')) ? '/lands?include_archived=1' : null);
  const params = useMemo(() => {
    const o = {};
    (def.params || []).forEach((k) => {
      if (k === 'customer') o.customer_id = p.customer?.id;
      else if (k === 'plot') o.plot_id = p.plot_id;
      else if (k === 'land' || k === 'land_opt') o.land_id = p.land_id;
      else o[k] = p[k];
    });
    return o;
  }, [def, p]);
  const ready = !(def.params || []).includes('customer') || p.customer;
  const readyPlot = (!(def.params || []).includes('plot') || p.plot_id) && (!(def.params || []).includes('land') || p.land_id);
  const { data: rep, isLoading, error } = useApi(ready && readyPlot ? `/reports/${def.key}${qs(params)}` : null);
  const set = (k) => (e) => setP({ ...p, [k]: e?.target ? e.target.value : e });
  const has = (k) => (def.params || []).includes(k);
  return (
    <>
      <PageHeader title="Reports" subtitle="View on screen, or export to Excel / PDF" actions={rep && <ExportButtons report={def.key} params={params} />} />
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <nav className="card h-fit p-2">
          {REPORTS.map((r, i) => (
            <div key={r.key}>
            {r.group && REPORTS[i - 1]?.group !== r.group && <div className="mt-2 border-t border-slate-100 px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-gold-600">{r.group}</div>}
            <button type="button" key={r.key} onClick={() => setSp({ r: r.key })} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${r.key === def.key ? 'bg-navy-900 text-white' : 'hover:bg-slate-50'}`}>
              <r.icon className={`mt-0.5 h-4 w-4 shrink-0 ${r.key === def.key ? 'text-gold-400' : 'text-slate-500'}`} />
              <span><span className="block text-sm font-semibold">{r.label}</span><span className={`block text-xs ${r.key === def.key ? 'text-navy-100' : 'text-slate-500'}`}>{r.desc}</span></span>
            </button>
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          {(def.params || []).length > 0 && (
            <Card bodyClass="p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {has('from') && <Input label="From" type="date" value={p.from} onChange={set('from')} />}
                {has('to') && <Input label="To" type="date" value={p.to} onChange={set('to')} />}
                {has('method') && <Select label="Method" value={p.method} onChange={set('method')} placeholder="All" options={METHODS} />}
                {has('date') && <Input label="Date" type="date" value={p.date} onChange={set('date')} />}
                {has('month') && <Input label="Month" type="month" value={p.month} onChange={set('month')} />}
                {has('as_of') && <Input label="As of" type="date" value={p.as_of} onChange={set('as_of')} />}
                {has('days') && <Select label="Next" value={p.days} onChange={set('days')} options={[['7', '7 days'], ['15', '15 days'], ['30', '30 days'], ['60', '60 days'], ['90', '90 days']]} />}
                {has('group') && <Select label="Group by" value={p.group} onChange={set('group')} options={[['daily', 'Day'], ['monthly', 'Month'], ['yearly', 'Year']]} />}
                {has('society_id') && <Select label="Society" value={p.society_id} onChange={set('society_id')} placeholder="All" options={(socs || []).map((s) => [s.id, s.name])} />}
                {has('customer') && <div className="sm:col-span-2"><CustomerPicker value={p.customer} onChange={set('customer')} /></div>}
                {(has('land') || has('land_opt')) && <Select label="Land" className="sm:col-span-2" value={p.land_id} onChange={set('land_id')} placeholder={has('land') ? 'Select land…' : 'All lands'} options={(lands || []).map((x) => [x.id, `${x.land_code} · ${x.seller_name}${x.location ? ` · ${x.location}` : ''}`])} />}
                {has('plot') && <Select label="Plot" className="sm:col-span-2" value={p.plot_id} onChange={set('plot_id')} placeholder="Select plot…" options={(plots || []).map((x) => [x.id, `${x.plot_no} · Block ${x.block_name} · ${x.society_name}`])} />}
              </div>
            </Card>
          )}
          <ErrorBox error={error} />
          {!ready && <Card><Empty text="Select a customer to view the ledger." /></Card>}
          {!readyPlot && <Card><Empty text={has('land') ? 'Select a land to view its statement.' : 'Select a plot to view its ledger.'} /></Card>}
          {isLoading && <Loading />}
          {rep && (
            <Card title={rep.title} actions={<span className="text-sm text-slate-500">{rep.subtitle}</span>} bodyClass="p-0">
              {def.key === 'summary' ? (
                <div className="grid gap-0 md:grid-cols-2">
                  {[['Land & cost', 0, 10], ['Sales & collections', 10, 23], ['Expenses & profit', 23, 29], ['Cash', 29, 32]].map(([t, a, z]) => (
                    <div key={t} className="border-b border-slate-100 p-4 md:odd:border-r">
                      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-600">{t}</h3>
                      {rep.rows.slice(a, z).map((r) => <div key={r.item} className={`flex justify-between gap-3 py-1 text-sm ${isStrong(r.item) ? 'border-t border-slate-200 pt-2 font-bold text-navy-900' : ''}`}><span>{nice(r.item)}</span><span className="whitespace-nowrap tabular-nums">{r.type === 'money' ? pkr(r.value) : num(r.value)}</span></div>)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50"><tr>{rep.columns.map((c) => <th key={c.key} className={`th whitespace-nowrap ${['money', 'number'].includes(c.type) ? 'text-right' : ''}`}>{c.header}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {rep.rows.map((r, i) => <tr key={i} className="hover:bg-slate-50">{rep.columns.map((c) => <td key={c.key} className={`td whitespace-nowrap ${['money', 'number'].includes(c.type) ? 'num' : ''}`}>{cell(c, r[c.key], r)}</td>)}</tr>)}
                    </tbody>
                    {rep.totals && Object.keys(rep.totals).length > 0 && (
                      <tfoot className="bg-slate-50 font-semibold"><tr>{rep.columns.map((c, i) => <td key={c.key} className={`td ${['money', 'number'].includes(c.type) ? 'num' : ''}`}>{i === 0 ? 'TOTAL' : rep.totals[c.key] !== undefined ? pkr(rep.totals[c.key]) : ''}</td>)}</tr></tfoot>
                    )}
                  </table>
                  {!rep.rows.length && <Empty text="No records for this selection." />}
                </div>
              )}
              {rep.summary?.length > 0 && <div className="grid gap-x-6 border-t border-slate-100 p-4 text-sm sm:grid-cols-2">{rep.summary.map((s) => <div key={s.label} className="flex justify-between py-1"><span className="text-slate-600">{s.label}</span><b>{pkr(s.value)}</b></div>)}</div>}
              {rep.notes?.length > 0 && <div className="border-t border-slate-100 p-4">{rep.notes.map((n) => <Notice key={n} className="mb-2">{n}</Notice>)}</div>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
