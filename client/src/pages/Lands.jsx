import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Pencil, Archive, RotateCcw, BookOpen, HandCoins, Receipt, Landmark, Ruler, Banknote, CheckCircle2, Scale, PiggyBank, Users, Trash2, Undo2, Printer, Lock,
} from 'lucide-react';
import { api, openPdf } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { area, date, dateTime, methodLabel, METHODS, num, pkr, shortPkr, sqft, todayStr, toPaisa } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import FundingSources, { newSource, sourcesCheck, sourcesPayload } from '../components/FundingSources.jsx';
import {
  Card, Checkbox, ConfirmDialog, ErrorBox, Input, KV, Loading, Modal, Notice, PageHeader, Select, StatCard, StatusBadge, Textarea, useToast,
} from '../components/ui.jsx';

const TEXT = ['name', 'location', 'seller_name', 'seller_father_name', 'seller_mobile', 'seller_cnic', 'seller_address', 'area_kanal', 'area_marla', 'area_sqft',
  'marla_sqft', 'kanal_marla', 'saleable_marla', 'purchase_date', 'rate_per_marla', 'purchase_price', 'price_adjust_reason', 'purchased_by', 'agreement_details',
  'registry_details', 'owner_name', 'ownership_details', 'registry_no', 'registry_date', 'mutation_no', 'mutation_date', 'khasra_no', 'khewat_no', 'notes'];
const EMPTY = Object.fromEntries(TEXT.map((k) => [k, '']));
const newExpense = () => ({ key: Math.random(), description: '', amount: '', expense_date: '', method: 'CASH', paid_to: '', investor_name: '' });

function Section({ letter, title, icon: Icon, children, note }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-gold-400">{letter}</span>
        <Icon className="h-4 w-4 text-navy-700" /><h3 className="text-sm font-bold uppercase tracking-wide text-navy-900">{title}</h3>
        {note && <span className="ml-auto text-xs text-slate-500">{note}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Calc({ label, value, sub, strong }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${strong ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-900'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${strong ? 'text-gold-300' : 'text-slate-500'}`}>{label}</div>
      <div className="text-lg font-bold tabular-nums" data-testid={`calc-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{value}</div>
      {sub && <div className={`text-xs ${strong ? 'text-navy-100' : 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}

/** ADD / EDIT LAND — owner, measurement and purchase information. */
export function LandForm({ open, onClose, land, onSaved }) {
  const { settings, can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshAll();
  const [f, setF] = useState(EMPTY);
  const [manual, setManual] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [showRecords, setShowRecords] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const canOverride = can('land.price_override');
  useEffect(() => {
    if (!open) return;
    const m = settings.measurement || {};
    if (land) {
      setF(Object.fromEntries(TEXT.map((k) => [k, land[k] === null || land[k] === undefined ? '' : String(land[k])])));
      setManual(!!land.price_is_manual);
      setShowRecords(!!(land.registry_no || land.mutation_no || land.khasra_no || land.khewat_no || land.owner_name || land.ownership_details));
    } else {
      setF({ ...EMPTY, marla_sqft: String(m.marla_sqft || 272.25), kanal_marla: String(m.kanal_marla || 20), purchase_date: todayStr() });
      setManual(false); setShowRecords(false);
    }
    setExpenses([]); setErr(null);
  }, [open, land, settings.measurement]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const c = useMemo(() => {
    const ms = Number(f.marla_sqft) || 272.25; const km = Number(f.kanal_marla) || 20;
    const n = (v) => Number(String(v || '').replace(/,/g, '')) || 0;
    const totalSqft = Math.round((n(f.area_kanal) * km * ms + n(f.area_marla) * ms + n(f.area_sqft)) * 100) / 100;
    const totalMarla = Math.round((totalSqft / ms) * 10000) / 10000;
    const autoP = Math.round(totalMarla * n(f.rate_per_marla) * 100);
    return { ms, km, totalSqft, totalMarla, autoP };
  }, [f]);
  const priceP = manual ? toPaisa(f.purchase_price) : c.autoP;
  const extraP = expenses.reduce((s, x) => s + toPaisa(x.amount), 0);
  const setExp = (key, patch) => setExpenses((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { ...f, manual_price: manual, purchase_price: manual ? f.purchase_price : undefined, price_adjust_reason: manual ? f.price_adjust_reason : undefined };
      if (!land && expenses.length) {
        body.expenses = expenses.map((x) => ({ description: x.description, amount: x.amount, expense_date: x.expense_date || f.purchase_date, method: x.method, paid_to: x.paid_to || undefined, investor_name: x.investor_name }));
      }
      const saved = land ? await api.put(`/lands/${land.id}`, body) : await api.post('/lands', body);
      toast(land ? `Land ${saved.land_code} updated` : `Land ${saved.land_code} added`); refresh(); onClose(); onSaved?.(saved);
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={land ? `Edit land ${land.land_code}` : 'Add land'} size="xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="land-form" className="btn-primary" disabled={busy}>{land ? 'Save changes' : 'Save land'}</button></>}>
      <form id="land-form" onSubmit={save} className="space-y-4">
        <Section letter="A" title="Original land owner" icon={Users}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Owner name" required value={f.seller_name} onChange={set('seller_name')} placeholder="Person you bought the land from" />
            <Input label="Contact number" required value={f.seller_mobile} onChange={set('seller_mobile')} placeholder="0300-1234567" inputMode="tel" />
            <Input label="CNIC (optional)" value={f.seller_cnic} onChange={set('seller_cnic')} placeholder="17301-1234567-1" />
            <Input label="Father name (optional)" value={f.seller_father_name} onChange={set('seller_father_name')} />
            <Input label="Address (optional)" className="sm:col-span-2" value={f.seller_address} onChange={set('seller_address')} />
            <Input label="Land location / Mauza" className="sm:col-span-2" value={f.location} onChange={set('location')} placeholder="e.g. Mauza Kot, Tehsil Peshawar" />
          </div>
        </Section>

        <Section letter="B" title="Measurement" icon={Ruler} note={`1 Kanal = ${num(c.km)} Marla · 1 Marla = ${num(c.ms)} sq ft`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Kanal" inputMode="decimal" value={f.area_kanal} onChange={set('area_kanal')} placeholder="0" />
            <Input label="Marla" inputMode="decimal" value={f.area_marla} onChange={set('area_marla')} placeholder="0" />
            <Input label="Additional square feet" inputMode="decimal" value={f.area_sqft} onChange={set('area_sqft')} placeholder="0" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Calc label="Total area in Marla" value={`${num(c.totalMarla)} Marla`} sub={area(c.totalMarla)} />
            <Calc label="Total area in sq ft" value={sqft(c.totalSqft)} />
            <Input label="Expected saleable area (Marla, optional)" inputMode="decimal" value={f.saleable_marla} onChange={set('saleable_marla')} hint="After roads, parks and common areas" />
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-navy-700">Change the conversion for this land (local measure)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Input label="1 Marla = square feet" inputMode="decimal" value={f.marla_sqft} onChange={set('marla_sqft')} hint="Default comes from Settings" />
              <Input label="1 Kanal = Marla" inputMode="decimal" value={f.kanal_marla} onChange={set('kanal_marla')} />
            </div>
          </details>
        </Section>

        <Section letter="C" title="Purchase" icon={Banknote}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Purchase date" type="date" required max={todayStr()} value={f.purchase_date} onChange={set('purchase_date')} />
            <Input label="Purchase rate per Marla (Rs)" required inputMode="decimal" value={f.rate_per_marla} onChange={set('rate_per_marla')} placeholder="e.g. 400000" />
            <Input label="Purchased by / responsible person" required value={f.purchased_by} onChange={set('purchased_by')} placeholder="Who made the deal" />
            <Input label="Land name (optional)" value={f.name} onChange={set('name')} placeholder="Made automatically if empty" />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Calc strong label="Total purchase price" value={pkr(priceP / 100)} sub={manual ? `Set manually — automatic price is ${pkr(c.autoP / 100)}` : `${num(c.totalMarla)} Marla × ${pkr(f.rate_per_marla || 0)}`} />
            <div className="lg:col-span-2">
              {canOverride ? (
                <Checkbox label="Change the total price manually (administrator)" checked={manual} onChange={(v) => { setManual(v); if (v && !f.purchase_price) setF((s) => ({ ...s, purchase_price: String(c.autoP / 100) })); }}
                  hint="Only if the agreed total differs from Marla × rate. The reason is saved in the audit log." />
              ) : <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />The total price is calculated automatically. Only an administrator can change it manually.</p>}
              {manual && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Input label="Agreed total price (Rs)" required inputMode="decimal" value={f.purchase_price} onChange={set('purchase_price')} />
                  <Input label="Reason for manual price" required value={f.price_adjust_reason} onChange={set('price_adjust_reason')} placeholder="e.g. owner gave discount" />
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Textarea label="Agreement details" rows={2} value={f.agreement_details} onChange={set('agreement_details')} placeholder="Bayana / stamp paper, witnesses, payment terms…" />
            <Textarea label="Registry / mutation details" rows={2} value={f.registry_details} onChange={set('registry_details')} placeholder="Registry, Intiqal, Fard status…" />
          </div>
          <button type="button" className="mt-2 text-sm font-medium text-navy-700 hover:underline" onClick={() => setShowRecords((v) => !v)}>{showRecords ? 'Hide' : 'Show'} revenue record numbers (registry no, Intiqal no, Khasra, Khewat)</button>
          {showRecords && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Registry no" value={f.registry_no} onChange={set('registry_no')} />
              <Input label="Registry date" type="date" value={f.registry_date} onChange={set('registry_date')} />
              <Input label="Mutation (Intiqal) no" value={f.mutation_no} onChange={set('mutation_no')} />
              <Input label="Mutation date" type="date" value={f.mutation_date} onChange={set('mutation_date')} />
              <Input label="Khasra no" value={f.khasra_no} onChange={set('khasra_no')} />
              <Input label="Khewat no" value={f.khewat_no} onChange={set('khewat_no')} />
              <Input label="Owner in revenue records" value={f.owner_name} onChange={set('owner_name')} />
              <Input label="Ownership details" value={f.ownership_details} onChange={set('ownership_details')} />
            </div>
          )}
          <Textarea label="Notes" className="mt-3" rows={2} value={f.notes} onChange={set('notes')} />

          {!land && (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-sm font-semibold text-navy-900">Additional purchase expenses (optional)</div>
                  <div className="text-xs text-slate-500">Stamp duty, registry fee, dealer commission… paid now from personal investment. Later expenses are added from the land page.</div></div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setExpenses((x) => [...x, newExpense()])}><Plus className="h-4 w-4" />Add expense</button>
              </div>
              {expenses.map((x) => (
                <div key={x.key} className="mt-3 grid gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-6" data-testid="land-expense-row">
                  <Input label="Description" required className="sm:col-span-2" value={x.description} onChange={(e) => setExp(x.key, { description: e.target.value })} />
                  <Input label="Amount (Rs)" required inputMode="decimal" value={x.amount} onChange={(e) => setExp(x.key, { amount: e.target.value })} />
                  <Select label="Method" value={x.method} onChange={(e) => setExp(x.key, { method: e.target.value })} options={METHODS} />
                  <Input label="Paid from investment of" required value={x.investor_name} onChange={(e) => setExp(x.key, { investor_name: e.target.value })} placeholder="Investor name" />
                  <div className="flex items-end"><button type="button" className="btn-ghost btn-sm text-red-700" onClick={() => setExpenses((xs) => xs.filter((y) => y.key !== x.key))}><Trash2 className="h-4 w-4" />Remove</button></div>
                </div>
              ))}
              {expenses.length > 0 && <div className="mt-2 text-right text-sm">Total additional expenses: <b>{pkr(extraP / 100)}</b> · Total land investment: <b>{pkr((priceP + extraP) / 100)}</b></div>}
            </div>
          )}
        </Section>
        <ErrorBox error={err} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ list
export function LandsPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [archived, setArchived] = useState(false);
  const [show, setShow] = useState('all');
  const { data, isLoading, error } = useApi(`/lands${archived ? '?include_archived=1' : ''}`);
  const { data: s } = useApi('/lands/summary');
  const [form, setForm] = useState(false);
  const rows = useMemo(() => (data || []).filter((r) => show === 'all' || (show === 'due' ? Number(r.remaining_payable) > 0 : Number(r.remaining_payable) <= 0)), [data, show]);
  const cols = [
    { key: 'land_code', header: 'Land ID', render: (r) => <span className="whitespace-nowrap font-mono text-xs font-semibold text-navy-800">{r.land_code}</span> },
    { key: 'seller_name', header: 'Owner / location', value: (r) => `${r.seller_name} ${r.location || ''} ${r.name}`,
      render: (r) => <div><div className="font-semibold text-navy-900">{r.seller_name}</div><div className="text-xs text-slate-500">{r.location || r.name}</div></div> },
    { key: 'total_marla', header: 'Area', render: (r) => <div>{area(r.total_marla)}<div className="text-xs text-slate-500">{num(r.total_marla)} Marla</div></div> },
    { key: 'rate_per_marla', header: 'Rate / Marla', align: 'right', render: (r) => pkr(r.rate_per_marla) },
    { key: 'purchase_price', header: 'Purchase price', align: 'right', render: (r) => <b>{pkr(r.purchase_price)}</b> },
    { key: 'total_paid', header: 'Paid', align: 'right', render: (r) => <span className="text-emerald-700">{pkr(r.total_paid)}</span> },
    { key: 'remaining_payable', header: 'Remaining payable', align: 'right', render: (r) => <span className={Number(r.remaining_payable) > 0 ? 'font-semibold text-red-700' : 'text-slate-500'}>{pkr(r.remaining_payable)}</span> },
    { key: 'purchase_date', header: 'Purchased', render: (r) => date(r.purchase_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];
  return (
    <>
      <PageHeader title="Land Management" subtitle="Land purchased for plotting — owner, measurement, purchase price, payments and funding"
        actions={<>
          {can('investment.view') && <Link to="/investments" className="btn-secondary"><PiggyBank className="h-4 w-4" />Personal investment</Link>}
          {can('land.edit') && <button type="button" className="btn-primary" onClick={() => setForm(true)}><Plus className="h-4 w-4" />Add land</button>}
        </>} />
      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7" data-testid="land-summary">
          <StatCard icon={Landmark} label="Total lands" value={num(s.total_lands)} />
          <StatCard icon={Ruler} tone="blue" label="Total area" value={`${num(s.total_marla)} Marla`} sub={area(s.total_marla)} />
          <StatCard icon={Banknote} tone="gold" label="Purchase value" value={shortPkr(s.total_purchase_value)} sub={pkr(s.total_purchase_value)} />
          <StatCard icon={CheckCircle2} tone="green" label="Total paid" value={shortPkr(s.total_paid)} sub={pkr(s.total_paid)} />
          <StatCard icon={Scale} tone="red" label="Remaining payable" value={shortPkr(s.total_remaining)} sub={pkr(s.total_remaining)} />
          <StatCard icon={PiggyBank} tone="violet" label="Personal investment" value={shortPkr(s.total_personal_investment)} sub={`${shortPkr(s.personal_available)} not used yet`} to={can('investment.view') ? '/investments' : undefined} />
          <StatCard icon={Users} tone="slate" label="Customer money used" value={shortPkr(s.total_customer_money_used)} sub="for land purchase & expenses" />
        </div>
      )}
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={rows} onRowClick={(r) => nav(`/lands/${r.id}`)} empty="No land added yet." searchPlaceholder="Search by land ID, owner or location…"
        toolbar={<>
          <Select value={show} onChange={(e) => setShow(e.target.value)} options={[['all', 'All lands'], ['due', 'Payment remaining'], ['paid', 'Fully paid']]} />
          <Checkbox label="Show archived" checked={archived} onChange={setArchived} />
          <ExportButtons report="land-outstanding" />
        </>} />}
      <LandForm open={form} onClose={() => setForm(false)} onSaved={(l) => nav(`/lands/${l.id}`)} />
    </>
  );
}

// ------------------------------------------------------------------ detail
function Funding({ text, detail }) {
  if (!detail || detail.length <= 2) return <span>{text}</span>;
  return (
    <details>
      <summary className="cursor-pointer">{text} <span className="font-semibold text-navy-700">— show {detail.length} parts</span></summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">{detail.map((d) => <li key={d}>{d}</li>)}</ul>
    </details>
  );
}

function Money({ rows }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.filter(Boolean).map(([k, v, cls = '']) => (
        <div key={k} className={`flex justify-between gap-3 ${cls}`}><dt>{k}</dt><dd className="whitespace-nowrap tabular-nums">{pkr(v)}</dd></div>
      ))}
    </dl>
  );
}

export function LandDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshAll();
  const { data: l, isLoading, error } = useApi(`/lands/${id}`);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [exp, setExp] = useState(false);
  const [rev, setRev] = useState(null);
  const [revInv, setRevInv] = useState(true);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const toggle = async () => { await api.post(`/lands/${id}/status`, { status: l.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' }); toast('Updated'); refresh(); };
  const due = Number(l.remaining_payable);
  return (
    <>
      <PageHeader title={`${l.land_code} — ${l.seller_name || l.name}`} subtitle={[l.location, area(l.total_marla)].filter(Boolean).join(' · ')} back={{ to: '/lands', label: 'All land' }}
        actions={<>
          <Link to={`/lands/${id}/ledger`} className="btn-secondary"><BookOpen className="h-4 w-4" />VIEW LAND LEDGER</Link>
          {can('land.pay') && <button type="button" className="btn-secondary" onClick={() => setExp(true)}><Receipt className="h-4 w-4" />Add expense</button>}
          {can('land.pay') && <button type="button" className="btn-gold" onClick={() => setPay(true)}><HandCoins className="h-4 w-4" />PAY LAND OWNER</button>}
          {can('land.edit') && <>
            <button type="button" className="btn-secondary" onClick={toggle}>{l.status === 'ACTIVE' ? <><Archive className="h-4 w-4" />Archive</> : <><RotateCcw className="h-4 w-4" />Restore</>}</button>
            <button type="button" className="btn-primary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button>
          </>}
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="land-finance">
        <StatCard icon={Banknote} tone="gold" label="Total purchase price" value={pkr(l.purchase_price)} sub={`${num(l.total_marla)} Marla × ${pkr(l.rate_per_marla)}${l.price_is_manual ? ' (manual)' : ''}`} />
        <StatCard icon={CheckCircle2} tone="green" label="Paid to owner" value={pkr(l.total_paid)} sub={`${l.payment_count} payment(s)${Number(l.paid_legacy) ? ' incl. older entries' : ''}`} />
        <StatCard icon={Scale} tone={due > 0 ? 'red' : 'green'} label="Remaining payable" value={pkr(l.remaining_payable)} sub={due > 0 ? 'Still to pay to the owner' : 'Fully paid'} />
        <StatCard icon={Landmark} label="Total land investment" value={pkr(l.total_investment)} sub="Price + expenses + additional payments" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Money summary">
          <Money rows={[
            ['Total purchase price', l.purchase_price],
            ['Paid to owner', l.total_paid, 'text-emerald-700'],
            ['Remaining payable', l.remaining_payable, 'border-b border-slate-200 pb-1.5 font-bold text-red-700'],
            ['Additional purchase expenses', l.extra_cost],
            Number(l.additional_paid) ? ['Additional payments (authorized)', l.additional_paid] : null,
            ['Total land investment', l.total_investment, 'border-y border-slate-200 py-1.5 font-bold text-navy-900'],
            ['Funded by personal investment', l.personal_funded],
            ['Funded by customer money', l.customer_funded],
            Number(l.paid_legacy) ? ['Older payments (source not recorded)', l.paid_legacy, 'text-slate-500'] : null,
          ]} />
        </Card>
        <Card title="Land details" className="lg:col-span-2">
          <KV cols={3} items={[
            ['Owner', [l.seller_name, l.seller_father_name && `s/o ${l.seller_father_name}`].filter(Boolean).join(' ')],
            ['Contact', l.seller_mobile], ['CNIC', l.seller_cnic], ['Owner address', l.seller_address], ['Location', l.location],
            ['Area', `${area(l.total_marla)} · ${num(l.total_marla)} Marla · ${sqft(l.total_sqft)}`],
            ['Entered as', `${num(l.area_kanal) || 0} Kanal, ${num(l.area_marla) || 0} Marla, ${num(l.area_sqft) || 0} sq ft`],
            ['Conversion', `1 Kanal = ${num(l.kanal_marla)} Marla · 1 Marla = ${num(l.marla_sqft)} sq ft`],
            ['Plotted / saleable', `${num(l.plotted_marla)} / ${l.saleable_marla ? num(l.saleable_marla) : '—'} Marla`],
            ['Purchase date', date(l.purchase_date)], ['Rate per Marla', pkr(l.rate_per_marla)], ['Purchased by', l.purchased_by],
            l.price_is_manual ? ['Manual price reason', l.price_adjust_reason] : null,
            ['Agreement', l.agreement_details], ['Registry / mutation', l.registry_details],
            (l.registry_no || l.mutation_no) ? ['Registry / Intiqal no', [l.registry_no && `Registry ${l.registry_no} ${l.registry_date ? date(l.registry_date) : ''}`, l.mutation_no && `Intiqal ${l.mutation_no} ${l.mutation_date ? date(l.mutation_date) : ''}`].filter(Boolean).join(' · ')] : null,
            (l.khasra_no || l.khewat_no) ? ['Khasra / Khewat', [l.khasra_no, l.khewat_no].filter(Boolean).join(' / ')] : null,
            ['Status', <StatusBadge key="s" status={l.status} />], l.notes ? ['Notes', l.notes] : null,
          ]} />
          {l.societies.length > 0 && <div className="mt-4 text-sm">Societies on this land: {l.societies.map((so) => <Link key={so.id} to={`/societies/${so.id}`} className="mr-2 font-semibold text-navy-700 hover:underline">{so.name}</Link>)}</div>}
        </Card>
      </div>

      <Card title="Payments to the land owner" className="mt-5" bodyClass="p-0"
        actions={can('land.pay') && <button type="button" className="btn-gold btn-sm" onClick={() => setPay(true)}><HandCoins className="h-4 w-4" />Pay land owner</button>}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50"><tr>{['Date', 'Payment ID', 'Description', 'Amount', 'Payment source', 'Method / ref', 'Entered by', ''].map((h) => <th key={h} className={`th ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {l.payments.map((p) => (
                <tr key={p.id} className={p.status === 'REVERSED' ? 'bg-red-50/40 text-slate-400' : ''}>
                  <td className="td whitespace-nowrap">{date(p.payment_date)}</td>
                  <td className="td whitespace-nowrap font-mono text-xs">{p.payment_no}{p.kind === 'ADDITIONAL' && <div className="text-[10px] font-semibold text-violet-700">ADDITIONAL</div>}</td>
                  <td className="td">{p.description}{p.kind === 'ADDITIONAL' && <div className="text-xs text-violet-700">Authorized: {p.authorization_note}</div>}
                    {p.status === 'REVERSED' && <div className="text-xs text-red-700">Reversed {dateTime(p.reversed_at)}: {p.reversal_reason}</div>}</td>
                  <td className={`td num font-semibold ${p.status === 'REVERSED' ? 'line-through' : ''}`}>{pkr(p.amount)}</td>
                  <td className="td min-w-[14rem] text-xs"><Funding text={p.funding} detail={p.funding_detail} /></td>
                  <td className="td whitespace-nowrap text-xs">{methodLabel(p.method)}{p.reference_no && <div className="text-slate-500">{p.reference_no}</div>}</td>
                  <td className="td text-xs">{p.entered_by_name}</td>
                  <td className="td">{p.status === 'VALID' && can('land.reverse') && <button type="button" className="btn-ghost btn-sm text-red-700" onClick={() => { setRevInv(true); setRev(p); }}><Undo2 className="h-4 w-4" />Reverse</button>}</td>
                </tr>
              ))}
              {l.expenses.filter((e) => e.cost_type === 'LAND_PAYMENT').map((e) => (
                <tr key={`e${e.id}`} className={e.status !== 'ACTIVE' ? 'text-slate-400 line-through' : 'text-slate-600'}>
                  <td className="td whitespace-nowrap">{date(e.expense_date)}</td><td className="td font-mono text-xs">{e.expense_no}</td>
                  <td className="td">{e.description}<div className="text-xs text-slate-500">Recorded in Expenses before the upgrade</div></td>
                  <td className="td num">{pkr(e.amount)}</td><td className="td text-xs">{e.funding}</td><td className="td text-xs">{methodLabel(e.method)}</td><td className="td text-xs">{e.entered_by_name}</td><td className="td" />
                </tr>
              ))}
              {!l.payments.length && !l.expenses.some((e) => e.cost_type === 'LAND_PAYMENT') && <tr><td colSpan={8} className="td py-6 text-center text-slate-500">No payment made to the owner yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Additional purchase expenses" bodyClass="p-0" actions={can('land.pay') && <button type="button" className="btn-secondary btn-sm" onClick={() => setExp(true)}><Plus className="h-4 w-4" />Add</button>}>
          <table className="min-w-full divide-y divide-slate-100 text-sm"><tbody className="divide-y divide-slate-100">
            {l.expenses.filter((e) => e.cost_type !== 'LAND_PAYMENT').map((e) => (
              <tr key={e.id} className={e.status !== 'ACTIVE' ? 'text-slate-400 line-through' : ''}>
                <td className="td whitespace-nowrap">{date(e.expense_date)}<div className="font-mono text-[10px] text-slate-500">{e.expense_no}</div></td>
                <td className="td">{e.category}<div className="text-xs text-slate-500">{e.description}</div><div className="text-xs text-slate-500">Source: <Funding text={e.funding} detail={e.funding_detail} /></div></td>
                <td className="td num">{pkr(e.amount)}</td>
              </tr>
            ))}
            {!l.expenses.some((e) => e.cost_type !== 'LAND_PAYMENT') && <tr><td className="td py-6 text-center text-slate-500">No additional expenses.</td></tr>}
          </tbody></table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">To cancel a land expense, open Expenses and cancel it there with a reason — its funding is released automatically.</p>
        </Card>
        <DocumentsPanel entityType="LAND" entityId={l.id} types={['REGISTRY', 'MUTATION', 'OWNERSHIP_DOCUMENT', 'SALE_AGREEMENT', 'LEGAL_DOCUMENT', 'OTHER']} title="Land documents" />
      </div>

      {l.adjustments.length > 0 && (
        <Card title="Purchase price changes (audit)" className="mt-5" bodyClass="p-0">
          <table className="min-w-full divide-y divide-slate-100 text-sm"><tbody className="divide-y divide-slate-100">
            {l.adjustments.map((a) => (
              <tr key={a.id}><td className="td whitespace-nowrap">{dateTime(a.created_at)}</td><td className="td"><StatusBadge status={a.change_type} label={a.change_type === 'MANUAL' ? 'Manual' : 'Recalculated'} /></td>
                <td className="td whitespace-nowrap tabular-nums">{pkr(a.old_price)} → <b>{pkr(a.new_price)}</b></td><td className="td">{a.reason}</td><td className="td text-xs">{a.by_name}</td></tr>
            ))}
          </tbody></table>
        </Card>
      )}

      <LandForm open={edit} onClose={() => setEdit(false)} land={l} />
      <PayOwnerModal open={pay} onClose={() => setPay(false)} land={l} />
      <LandExpenseModal open={exp} onClose={() => setExp(false)} land={l} />
      <ConfirmDialog open={!!rev} onClose={() => setRev(null)} danger requireReason confirmText="Reverse payment" title={`Reverse ${rev?.payment_no || ''}`}
        message={rev && `The payment of ${pkr(rev.amount)} stays on record marked as reversed. The amount is added back to the remaining payable, and the customer money / investment it used is released.`}
        onConfirm={async (reason) => { const r = await api.post(`/lands/payments/${rev.id}/reverse`, { reason, reverse_new_investments: revInv }); toast(`Payment reversed${r.reversed_investments?.length ? ` (with ${r.reversed_investments.length} investment entry)` : ''}`); refresh(); }}>
        <Checkbox label="Also reverse the new personal investment entered with this payment" hint="Choose this if the money did not really come in. Investments already used elsewhere are kept." checked={revInv} onChange={setRevInv} />
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------ pay land owner
export function PayOwnerModal({ open, onClose, land }) {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [rows, setRows] = useState([newSource()]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ amount: '', payment_date: todayStr(), method: 'CASH', reference_no: '', description: '', additional: false, authorization_note: '' });
    setRows([newSource()]); setErr(null);
  }, [open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const dueP = toPaisa(land.remaining_payable);
  const amtP = toPaisa(f.amount);
  const check = sourcesCheck(rows, f.amount);
  const over = !f.additional && amtP > dueP;
  const save = async () => {
    setErr(null);
    if (!(amtP > 0)) { setErr(new Error('Enter the payment amount')); return; }
    if (over) { setErr(new Error(`The payment is more than the remaining payable (${pkr(dueP / 100)}).`)); return; }
    if (!check.ok) { setErr(new Error(check.diffP > 0 ? `Assign ${pkr(check.diffP / 100)} more to a payment source.` : `The sources are ${pkr(-check.diffP / 100)} more than the payment.`)); return; }
    setBusy(true);
    try {
      const r = await api.post(`/lands/${land.id}/payments`, {
        ...f, authorization_note: f.additional ? f.authorization_note : undefined, sources: sourcesPayload(rows, { useDate: f.payment_date, method: f.method }),
      });
      toast(`Payment ${r.payment.payment_no} of ${pkr(r.payment.amount)} saved`); refresh(); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Pay land owner — ${land.seller_name} (${land.land_code})`} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-gold" onClick={save} disabled={busy}>Save payment</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Purchase price</div><b className="tabular-nums">{pkr(land.purchase_price)}</b></div>
          <div className="rounded-lg bg-emerald-50 p-2"><div className="text-xs text-slate-500">Already paid</div><b className="tabular-nums text-emerald-700">{pkr(land.total_paid)}</b></div>
          <div className="rounded-lg bg-red-50 p-2"><div className="text-xs text-slate-500">Remaining payable</div><b className="tabular-nums text-red-700">{pkr(land.remaining_payable)}</b></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Amount paid to owner (Rs)" required inputMode="decimal" value={f.amount} onChange={set('amount')} error={over ? 'More than the remaining payable' : undefined}
            hint={dueP > 0 && <button type="button" className="font-semibold text-navy-700 hover:underline" onClick={() => setF((s) => ({ ...s, amount: String(dueP / 100) }))}>Pay full remaining</button>} />
          <Input label="Payment date" type="date" required max={todayStr()} value={f.payment_date} onChange={set('payment_date')} />
          <Select label="Payment method" value={f.method} onChange={set('method')} options={METHODS} />
          <Input label={f.method === 'CHEQUE' ? 'Cheque number' : 'Reference (optional)'} required={f.method === 'CHEQUE'} value={f.reference_no} onChange={set('reference_no')} />
          <Input label="Description (optional)" className="sm:col-span-2 lg:col-span-4" value={f.description} onChange={set('description')} placeholder={`Payment to ${land.seller_name}`} />
        </div>
        {can('land.price_override') && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
            <Checkbox label="This is an additional payment beyond the agreed price (authorized)" checked={f.additional} onChange={set('additional')}
              hint="It does not reduce the remaining payable; it is added to the total land investment." />
            {f.additional && <Input label="Authorization note" required className="mt-2" value={f.authorization_note} onChange={set('authorization_note')} placeholder="Why the extra payment was agreed, and who approved it" />}
          </div>
        )}
        {dueP <= 0 && !f.additional && <Notice tone="ok">This land is fully paid. {can('land.price_override') ? 'Tick "additional payment" above only if an extra amount was agreed.' : 'An administrator can record an authorized additional payment.'}</Notice>}
        <FundingSources rows={rows} onChange={setRows} total={f.amount} useDate={f.payment_date} />
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ land expense
export function LandExpenseModal({ open, onClose, land }) {
  const toast = useToast();
  const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [rows, setRows] = useState([newSource()]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: cats } = useApi(open ? '/expenses/categories' : null);
  useEffect(() => {
    if (!open) return;
    setF({ description: '', amount: '', expense_date: todayStr(), method: 'CASH', reference_no: '', paid_to: '', category_id: '' });
    setRows([newSource()]); setErr(null);
  }, [open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const usable = (cats || []).filter((c) => c.is_active && c.cost_type !== 'LAND_PAYMENT');
  const save = async () => {
    setErr(null);
    const check = sourcesCheck(rows, f.amount);
    if (!check.ok) { setErr(new Error(check.totalP <= 0 ? 'Enter the expense amount' : 'The payment sources must add up exactly to the expense amount.')); return; }
    setBusy(true);
    try {
      const r = await api.post(`/lands/${land.id}/expenses`, { ...f, category_id: f.category_id ? Number(f.category_id) : undefined, sources: sourcesPayload(rows, { useDate: f.expense_date, method: f.method }) });
      toast(`Expense ${r.expense.expense_no} saved`); refresh(); onClose();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Additional purchase expense — ${land.land_code}`} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={busy}>Save expense</button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Description" required className="lg:col-span-2" value={f.description} onChange={set('description')} placeholder="e.g. Registry fee, stamp duty, dealer commission" />
          <Select label="Category" value={f.category_id} onChange={set('category_id')} placeholder="Land Purchase Expenses" options={usable.map((c) => [c.id, c.name])} />
          <Input label="Amount (Rs)" required inputMode="decimal" value={f.amount} onChange={set('amount')} />
          <Input label="Date" type="date" required max={todayStr()} value={f.expense_date} onChange={set('expense_date')} />
          <Select label="Method" value={f.method} onChange={set('method')} options={METHODS} />
          <Input label="Paid to (optional)" value={f.paid_to} onChange={set('paid_to')} />
          <Input label={f.method === 'CHEQUE' ? 'Cheque number' : 'Reference (optional)'} required={f.method === 'CHEQUE'} value={f.reference_no} onChange={set('reference_no')} />
        </div>
        <Notice>Payments to the land owner are not expenses — use <b>Pay Land Owner</b> for those.</Notice>
        <FundingSources rows={rows} onChange={setRows} total={f.amount} useDate={f.expense_date} />
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ ledger
const TYPE = {
  PURCHASE: ['Purchase', 'bg-navy-100 text-navy-800 ring-navy-600/20'], PRICE_CHANGE: ['Price change', 'bg-amber-100 text-amber-800 ring-amber-600/20'],
  PAYMENT: ['Payment', 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'], ADDITIONAL: ['Additional', 'bg-violet-100 text-violet-800 ring-violet-600/20'],
  REVERSAL: ['Reversal', 'bg-red-100 text-red-800 ring-red-600/20'], EXPENSE: ['Expense', 'bg-slate-100 text-slate-700 ring-slate-500/20'],
};
export function LandLedgerPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, isLoading, error } = useApi(`/lands/${id}/ledger`);
  const [pay, setPay] = useState(false);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { land: l, rows } = data;
  return (
    <>
      <PageHeader title={`Land ledger — ${l.land_code}`} subtitle={`${l.seller_name}${l.location ? ` · ${l.location}` : ''}`} back={{ to: `/lands/${id}`, label: 'Back to land' }}
        actions={<>
          <ExportButtons report="land-statement" params={{ land_id: id }} />
          {can('report.view') && <button type="button" className="btn-secondary" onClick={() => openPdf(`/reports/land-statement?land_id=${id}&format=pdf`)}><Printer className="h-4 w-4" />Print</button>}
          {can('land.pay') && <button type="button" className="btn-gold" onClick={() => setPay(true)}><HandCoins className="h-4 w-4" />PAY LAND OWNER</button>}
        </>} />
      <Card className="mb-5">
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 2xl:grid-cols-4" data-testid="ledger-header">
          <KV cols={1} items={[['Original land owner', l.seller_name], ['Contact', l.seller_mobile]]} />
          <KV cols={1} items={[['Total area', `${area(l.total_marla)} · ${num(l.total_marla)} Marla`], ['Purchase rate', `${pkr(l.rate_per_marla)} per Marla`]]} />
          <Money rows={[['Total purchase price', l.purchase_price, 'font-semibold'], ['Total amount paid', l.total_paid, 'text-emerald-700'], ['Remaining payable', l.remaining_payable, 'font-bold text-red-700']]} />
          <Money rows={[['Additional expenses', l.extra_cost], Number(l.additional_paid) ? ['Additional payments', l.additional_paid] : null,
            ['Total land investment', l.total_investment, 'font-bold text-navy-900']]} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
          <span>Funded by personal investment: <b>{pkr(l.personal_funded)}</b></span>
          <span>Funded by customer money: <b>{pkr(l.customer_funded)}</b></span>
          {Number(l.paid_legacy) > 0 && <span>Older payments, source not recorded: <b>{pkr(l.paid_legacy)}</b></span>}
        </div>
      </Card>
      <Card title="Full payment history" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm [&_td]:px-2 [&_th]:px-2" data-testid="ledger-table">
            <thead className="bg-slate-50"><tr>{['Date', 'Transaction ID', 'Description', 'Amount', 'Payment source', 'Method', 'Reference', 'Entered by', 'Remaining payable'].map((h) => (
              <th key={h} className={`th ${['Amount', 'Remaining payable'].includes(h) ? 'text-right' : ''}`}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const [label, cls] = TYPE[r.type] || [r.type, ''];
                const dead = ['REVERSED', 'CANCELLED'].includes(r.status);
                return (
                  <tr key={`${r.txn_id}-${r.type}`} className={dead ? 'text-slate-400' : ''}>
                    <td className="td whitespace-nowrap">{date(r.date)}</td>
                    <td className="td whitespace-nowrap font-mono text-xs">{r.txn_id}</td>
                    <td className="td min-w-[11rem] text-xs"><span className={`mr-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cls}`}>{label}</span>{r.description}
                      {dead && <span className="ml-1 text-xs font-semibold text-red-700">({r.status === 'REVERSED' ? 'reversed' : 'cancelled'})</span>}</td>
                    <td className={`td num whitespace-nowrap ${dead ? 'line-through' : ''} ${r.amount < 0 ? 'text-red-700' : ''}`}>{pkr(r.amount)}</td>
                    <td className="td min-w-[10rem] text-xs leading-snug">{r.source}</td>
                    <td className="td whitespace-nowrap text-xs">{r.method === '-' ? '—' : methodLabel(r.method)}</td>
                    <td className="td text-xs">{r.reference === '-' ? '—' : r.reference}</td>
                    <td className="td text-xs">{r.entered_by || '—'}</td>
                    <td className="td num whitespace-nowrap font-semibold">{pkr(r.remaining_payable)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-navy-50 font-bold text-navy-900"><tr><td className="td" colSpan={8}>Remaining payable to the owner</td><td className="td num" data-testid="ledger-balance">{pkr(rows.at(-1)?.remaining_payable ?? 0)}</td></tr></tfoot>
          </table>
        </div>
      </Card>
      {pay && <PayOwnerModal open={pay} onClose={() => setPay(false)} land={l} />}
    </>
  );
}
