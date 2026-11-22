import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { addMonthsStr } from '../lib/dates.js';
import { date, METHODS, num, pkr, PLANS, toPaisa, todayStr } from '../lib/format.js';
import { CustomerPicker } from '../components/Pickers.jsx';
import CustomerForm from '../components/CustomerForm.jsx';
import { Card, Checkbox, ErrorBox, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui.jsx';

const STEP = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };

function Section({ n, title, children, done }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-navy-900 text-white'}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : n}</div>
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export default function NewBookingPage() {
  const { settings } = useAuth();
  const nav = useNavigate();
  const toast = useToast(); const refresh = useRefreshAll();
  const [sp] = useSearchParams();
  const today = todayStr();
  const [customer, setCustomer] = useState(null);
  const [newCust, setNewCust] = useState(null);
  const [societyId, setSocietyId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [plot, setPlot] = useState(null);
  const [f, setF] = useState({
    booking_date: today, rate_per_marla: '', discount: '0', booking_amount: '', down_payment: '', down_payment_date: '',
    plan: { type: 'MONTHLY', installments: '36', start_date: addMonthsStr(today, 1), rounding: String(settings.installments?.default_rounding || 100), balloon: false,
      balloon_count: '6', balloon_amount: '', balloon_every: '6', balloon_start: addMonthsStr(today, 6), full_due_date: today, custom_rows: [] },
    receive_booking_amount: true, payment: { method: 'CASH', reference_no: '', bank_name: '' }, sales_person: '', notes: '',
  });
  const { data: socs } = useApi('/societies');
  const { data: soc } = useApi(societyId ? `/societies/${societyId}` : null);
  const { data: plots } = useApi(societyId ? `/plots${qs({ society_id: societyId, block_id: blockId, status: 'AVAILABLE,RESERVED' })}` : null);
  const preCustomer = useApi(sp.get('customer_id') ? `/customers/${sp.get('customer_id')}` : null);
  const prePlot = useApi(sp.get('plot_id') ? `/plots/${sp.get('plot_id')}` : null);
  useEffect(() => { if (preCustomer.data && !customer) setCustomer(preCustomer.data.customer); }, [preCustomer.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prePlot.data && !plot) choosePlot(prePlot.data); }, [prePlot.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function choosePlot(p) {
    setPlot(p);
    if (p) {
      setSocietyId(String(p.society_id)); setBlockId(String(p.block_id));
      setF((s) => ({ ...s, rate_per_marla: String(Number(p.price_per_marla) || ''), discount: String(Number(p.discount) || 0) }));
    }
  }
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const setPlan = (k) => (e) => setF((s) => ({ ...s, plan: { ...s.plan, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e } }));
  const setPay = (k) => (e) => setF((s) => ({ ...s, payment: { ...s.payment, [k]: e.target.value } }));

  const size = plot ? Number(plot.size_marla) : 0;
  const totalP = Math.round(size * (Number(f.rate_per_marla) || 0) * 100);
  const finalP = totalP - toPaisa(f.discount);
  const remainingP = finalP - toPaisa(f.booking_amount) - toPaisa(f.down_payment);
  const pct = (p) => setF((s) => ({ ...s, booking_amount: String(Math.round((finalP * p) / 10000)) }));

  const body = useMemo(() => {
    const pl = { ...f.plan };
    if (!pl.balloon) { pl.balloon_count = 0; pl.balloon_amount = 0; }
    delete pl.balloon;
    return { customer_id: customer?.id, plot_id: plot?.id, booking_date: f.booking_date, rate_per_marla: f.rate_per_marla || 0, discount: f.discount || 0,
      booking_amount: f.booking_amount || 0, down_payment: f.down_payment || 0, down_payment_date: f.down_payment_date || null, plan: pl,
      receive_booking_amount: f.receive_booking_amount, payment: f.payment, sales_person: f.sales_person, notes: f.notes };
  }, [f, customer, plot]);
  const debBody = useDebounced(body, 350);
  const [preview, setPreview] = useState(null);
  const [pErr, setPErr] = useState(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  useEffect(() => {
    if (!debBody.plot_id || !Number(debBody.rate_per_marla)) { setPreview(null); setPErr(null); return; }
    let live = true;
    setLoadingPrev(true);
    api.post('/bookings/preview', debBody).then((d) => { if (live) { setPreview(d); setPErr(null); } }).catch((e) => { if (live) { setPreview(null); setPErr(e); } }).finally(() => live && setLoadingPrev(false));
    return () => { live = false; };
  }, [debBody]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    setErr(null);
    if (!customer) { setErr(new Error('Select or register the customer')); return; }
    if (!plot) { setErr(new Error('Select the plot')); return; }
    setBusy(true);
    try {
      const r = await api.post('/bookings', body);
      toast(`Booking ${r.booking.booking_no} created`); refresh();
      nav(`/bookings/${r.booking.id}?created=1${r.payment ? `&receipt=${r.payment.id}` : ''}`);
    } catch (ex) { setErr(ex); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };
  const periodic = !!STEP[f.plan.type];
  const customSum = (f.plan.custom_rows || []).reduce((s, r) => s + toPaisa(r.amount), 0);
  const setRow = (i, k, v) => setF((s) => ({ ...s, plan: { ...s.plan, custom_rows: s.plan.custom_rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) } }));

  return (
    <>
      <PageHeader title="New Booking / Sale" subtitle="Book an available plot for a customer and generate the payment schedule" />
      <ErrorBox error={err} className="mb-4" />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Section n={1} title="Customer" done={!!customer}>
            <CustomerPicker value={customer} onChange={setCustomer} onCreateNew={(name) => setNewCust({ name })} />
          </Section>
          <Section n={2} title="Plot" done={!!plot}>
            {plot ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2">
                <div><div className="font-semibold text-navy-900">Plot {plot.plot_no} · Block {plot.block_name} · {plot.society_name}</div>
                  <div className="text-xs text-slate-600">{num(plot.size_marla)} Marla · {plot.category}{plot.is_corner ? ' · Corner' : ''}{plot.is_main_road ? ' · Main road' : ''}{plot.status === 'RESERVED' ? ` · Reserved for ${plot.reserved_for}` : ''}</div></div>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setPlot(null)}>Change</button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Select label="Society" value={societyId} onChange={(e) => { setSocietyId(e.target.value); setBlockId(''); }} placeholder="Select…" options={(socs || []).map((s) => [s.id, s.name])} />
                <Select label="Block" value={blockId} onChange={(e) => setBlockId(e.target.value)} placeholder="All blocks" options={(soc?.blocks || []).map((b) => [b.id, `Block ${b.name}`])} />
                <Select label={`Available plot${plots ? ` (${plots.length})` : ''}`} value="" onChange={(e) => choosePlot(plots.find((p) => String(p.id) === e.target.value))} placeholder={societyId ? 'Select plot…' : 'Select society first'}
                  options={(plots || []).map((p) => [p.id, `${p.plot_no} — ${num(p.size_marla)} Marla${p.status === 'RESERVED' ? ' (reserved)' : ''} — ${pkr(p.list_price - p.discount)}`])} />
              </div>
            )}
          </Section>
          <Section n={3} title="Price">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="Booking date" type="date" required value={f.booking_date} max={today} onChange={set('booking_date')} />
              <Input label="Plot size" value={plot ? `${num(plot.size_marla)} Marla` : ''} disabled />
              <Input label="Price per Marla (Rs)" required inputMode="decimal" value={f.rate_per_marla} onChange={set('rate_per_marla')} />
              <Input label="Discount (Rs)" inputMode="decimal" value={f.discount} onChange={set('discount')} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <div><div className="text-xs text-slate-500">Total price</div><div className="font-semibold">{pkr(totalP / 100)}</div></div>
              <div><div className="text-xs text-slate-500">Discount</div><div className="font-semibold">{pkr(toPaisa(f.discount) / 100)}</div></div>
              <div><div className="text-xs text-slate-500">Final selling price</div><div className="text-lg font-bold text-navy-900">{pkr(finalP / 100)}</div></div>
            </div>
          </Section>
          <Section n={4} title="Booking amount & down payment">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Input label="Booking amount (Rs)" inputMode="decimal" value={f.booking_amount} onChange={set('booking_amount')} />
                <div className="mt-1.5 flex gap-1">{[10, 20, 25, 30].map((p) => <button type="button" key={p} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100" onClick={() => pct(p)}>{p}%</button>)}</div>
              </div>
              <Input label="Down payment later (optional)" inputMode="decimal" value={f.down_payment} onChange={set('down_payment')} hint="Separate amount due on a date" />
              <Input label="Down payment due date" type="date" value={f.down_payment_date} onChange={set('down_payment_date')} disabled={!Number(f.down_payment)} />
            </div>
            <div className="mt-3 text-sm">Remaining after booking{Number(f.down_payment) ? ' & down payment' : ''}: <b className="text-navy-900">{pkr(remainingP / 100)}</b></div>
          </Section>
          <Section n={5} title="Payment plan">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PLANS.map(([k, l]) => <button type="button" key={k} onClick={() => setPlan('type')(k)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${f.plan.type === k ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>)}
            </div>
            {periodic && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Number of installments" inputMode="numeric" value={f.plan.installments} onChange={setPlan('installments')} />
                  <Input label="First installment date" type="date" value={f.plan.start_date} onChange={setPlan('start_date')} />
                  <Select label="Round installments to" value={f.plan.rounding} onChange={setPlan('rounding')} options={[['1', 'Rs 1'], ['100', 'Rs 100'], ['500', 'Rs 500'], ['1000', 'Rs 1,000'], ['5000', 'Rs 5,000']]} hint="Last installment absorbs the difference" />
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <Checkbox label="Add extra (balloon) payments — e.g. half-yearly payments along with monthly installments" checked={f.plan.balloon} onChange={setPlan('balloon')} />
                  {f.plan.balloon && (
                    <div className="mt-2 grid gap-3 sm:grid-cols-4">
                      <Input label="How many" inputMode="numeric" value={f.plan.balloon_count} onChange={setPlan('balloon_count')} />
                      <Input label="Amount each (Rs)" inputMode="decimal" value={f.plan.balloon_amount} onChange={setPlan('balloon_amount')} />
                      <Select label="Every" value={f.plan.balloon_every} onChange={setPlan('balloon_every')} options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months']]} />
                      <Input label="First extra payment" type="date" value={f.plan.balloon_start} onChange={setPlan('balloon_start')} />
                    </div>
                  )}
                </div>
              </>
            )}
            {f.plan.type === 'FULL' && <div className="grid gap-3 sm:grid-cols-3"><Input label="Balance due date" type="date" value={f.plan.full_due_date} onChange={setPlan('full_due_date')} /></div>}
            {f.plan.type === 'CUSTOM' && (
              <div>
                <div className="space-y-2">
                  {(f.plan.custom_rows || []).map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
                      <input className="input" type="date" value={r.due_date} onChange={(e) => setRow(i, 'due_date', e.target.value)} />
                      <input className="input" inputMode="decimal" placeholder="Amount" value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} />
                      <input className="input" placeholder="Label (optional)" value={r.label || ''} onChange={(e) => setRow(i, 'label', e.target.value)} />
                      <button type="button" className="btn-ghost text-red-600" onClick={() => setF((s) => ({ ...s, plan: { ...s.plan, custom_rows: s.plan.custom_rows.filter((_, j) => j !== i) } }))}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setF((s) => ({ ...s, plan: { ...s.plan, custom_rows: [...s.plan.custom_rows, { due_date: addMonthsStr(s.plan.custom_rows.at(-1)?.due_date || f.booking_date, 1), amount: '', label: '' }] } }))}><Plus className="h-4 w-4" />Add row</button>
                  <span className={`text-sm ${customSum === remainingP ? 'text-emerald-700' : 'text-amber-700'}`}>Rows total {pkr(customSum / 100)} of {pkr(remainingP / 100)} · difference {pkr((remainingP - customSum) / 100)}</span>
                </div>
              </div>
            )}
          </Section>
          <Section n={6} title="Receive booking amount now">
            <Checkbox label={`Receive the booking amount (${pkr(Number(f.booking_amount) || 0)}) now and print a receipt`} checked={f.receive_booking_amount} onChange={set('receive_booking_amount')} />
            {f.receive_booking_amount && Number(f.booking_amount) > 0 && (
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Select label="Payment method" value={f.payment.method} onChange={setPay('method')} options={METHODS} />
                <Input label={f.payment.method === 'CHEQUE' ? 'Cheque number' : 'Reference no.'} required={f.payment.method === 'CHEQUE'} value={f.payment.reference_no} onChange={setPay('reference_no')} />
                <Input label="Bank" value={f.payment.bank_name} onChange={setPay('bank_name')} />
              </div>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Sales person / dealer" value={f.sales_person} onChange={set('sales_person')} />
              <Textarea label="Notes" rows={1} value={f.notes} onChange={set('notes')} />
            </div>
          </Section>
        </div>
        <div className="xl:sticky xl:top-5 xl:self-start">
          <Card title="Summary & schedule" actions={loadingPrev && <Spinner className="h-4 w-4" />}>
            <dl className="space-y-1.5 text-sm">
              {[['Customer', customer?.full_name], ['Plot', plot ? `${plot.plot_no} (${num(plot.size_marla)} Marla)` : null], ['Final price', pkr(finalP / 100)], ['Booking amount', pkr(Number(f.booking_amount) || 0)],
                ['Remaining', pkr(remainingP / 100)], ['Plan', PLANS.find((p) => p[0] === f.plan.type)?.[1]]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-semibold">{v || '—'}</dd></div>)}
            </dl>
            <ErrorBox error={pErr} className="mt-3" />
            {preview && (
              <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">Due</th><th className="px-2 py-1.5 text-left">Description</th><th className="px-2 py-1.5 text-right">Amount</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{preview.schedule.map((r) => <tr key={r.seq_no} className={r.kind === 'BALLOON' ? 'bg-gold-50' : ''}><td className="px-2 py-1">{r.seq_no}</td><td className="whitespace-nowrap px-2 py-1">{date(r.due_date)}</td><td className="px-2 py-1">{r.label}</td><td className="px-2 py-1 text-right tabular-nums">{num(r.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {preview && <Notice tone="ok" className="mt-3">{preview.schedule.length} payments totalling {pkr(preview.final_price)} — matches the final price.</Notice>}
            <button type="button" className="btn-gold mt-4 w-full py-3 text-base" onClick={submit} disabled={busy || !preview || !customer || loadingPrev || body !== debBody}>{busy && <Spinner className="h-4 w-4" />}Confirm booking</button>
            {!customer && <p className="mt-2 text-center text-xs text-slate-500">Select a customer to confirm.</p>}
          </Card>
        </div>
      </div>
      <Modal open={!!newCust} onClose={() => setNewCust(null)} title="Register new customer" size="lg"
        footer={<><button type="button" className="btn-secondary" onClick={() => setNewCust(null)}>Cancel</button><button form="quick-cust" className="btn-primary">Save & select</button></>}>
        {newCust && <CustomerForm formId="quick-cust" compact initialName={/\d/.test(newCust.name) ? '' : newCust.name} onSaved={(c) => { setCustomer(c); setNewCust(null); }} />}
      </Modal>
    </>
  );
}
