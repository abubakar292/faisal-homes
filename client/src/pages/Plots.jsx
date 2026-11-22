import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Layers, Pencil, Lock, Unlock, Ban, RotateCcw, Trash2, FileSignature } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, num, pkr, STATUS, todayStr } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import { CustomerPicker } from '../components/Pickers.jsx';
import { Card, Checkbox, ConfirmDialog, ErrorBox, Input, KV, Loading, Modal, PageHeader, Select, StatusBadge, Textarea, useToast, Empty } from '../components/ui.jsx';

const SIZES = [3, 5, 7, 10, 15, 20];
const blank = (sid, bid) => ({ society_id: sid || '', block_id: bid || '', plot_no: '', street_no: '', size_marla: '5', front_ft: '', depth_ft: '', category: 'RESIDENTIAL',
  is_corner: false, is_main_road: false, is_park_facing: false, location_note: '', price_per_marla: '', discount: '0', notes: '' });

function useSocieties() { return useApi('/societies'); }
function useBlocks(societyId) { return useApi(societyId ? `/societies/${societyId}` : null); }

function SizeInput({ value, onChange }) {
  const custom = !SIZES.includes(Number(value));
  return (
    <div>
      <span className="label">Plot size (Marla) <span className="text-red-600">*</span></span>
      <div className="flex flex-wrap gap-1.5">
        {SIZES.map((s) => <button type="button" key={s} onClick={() => onChange(String(s))} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${Number(value) === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{s}</button>)}
        <input className={`input w-28 ${custom ? 'border-navy-500' : ''}`} inputMode="decimal" placeholder="Custom" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <span className="mt-1 block text-xs text-slate-500">Decimal sizes allowed, e.g. 4.5 or 7.25</span>
    </div>
  );
}

export function PlotForm({ open, onClose, plot, defaults }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [f, setF] = useState(blank());
  const [err, setErr] = useState(null);
  const { data: socs } = useSocieties();
  const { data: soc } = useBlocks(f.society_id);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(plot ? { ...blank(), ...Object.fromEntries(Object.entries(plot).map(([k, v]) => [k, v === null ? '' : typeof v === 'boolean' ? v : String(v)])) } : blank(defaults?.society_id, defaults?.block_id));
  }, [open, plot, defaults]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const list = Math.round((Number(f.size_marla) || 0) * (Number(f.price_per_marla) || 0));
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try { if (plot) await api.put(`/plots/${plot.id}`, f); else await api.post('/plots', f); toast(plot ? 'Plot updated' : `Plot ${f.plot_no} added`); refresh(); onClose(); } catch (ex) { setErr(ex); }
  };
  return (
    <Modal open={open} onClose={onClose} title={plot ? `Edit plot ${plot.plot_no}` : 'Add plot'} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button form="plot-form" className="btn-primary">Save plot</button></>}>
      <form id="plot-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Society" required value={f.society_id} onChange={(e) => setF({ ...f, society_id: e.target.value, block_id: '' })} placeholder="Select…" options={(socs || []).map((s) => [s.id, s.name])} />
          <Select label="Block" required value={f.block_id} onChange={set('block_id')} placeholder="Select…" options={(soc?.blocks || []).map((b) => [b.id, `Block ${b.name}`])} />
          <Input label="Plot number" required value={f.plot_no} onChange={set('plot_no')} placeholder="e.g. A-25" />
          <Input label="Street" value={f.street_no} onChange={set('street_no')} />
        </div>
        <SizeInput value={f.size_marla} onChange={set('size_marla')} />
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Front (ft)" inputMode="decimal" value={f.front_ft} onChange={set('front_ft')} />
          <Input label="Depth (ft)" inputMode="decimal" value={f.depth_ft} onChange={set('depth_ft')} />
          <Select label="Category" value={f.category} onChange={set('category')} options={[['RESIDENTIAL', 'Residential'], ['COMMERCIAL', 'Commercial']]} />
          <Input label="Location note" value={f.location_note} onChange={set('location_note')} />
        </div>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox label="Corner plot" checked={f.is_corner} onChange={set('is_corner')} />
          <Checkbox label="Main road facing" checked={f.is_main_road} onChange={set('is_main_road')} />
          <Checkbox label="Park facing" checked={f.is_park_facing} onChange={set('is_park_facing')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Price per Marla (Rs)" inputMode="decimal" value={f.price_per_marla} onChange={set('price_per_marla')} />
          <Input label="Offer discount (Rs)" inputMode="decimal" value={f.discount} onChange={set('discount')} />
          <div className="rounded-lg bg-navy-50 p-3 text-sm"><div className="text-xs text-slate-500">Total plot price</div><div className="font-bold text-navy-900">{pkr(list)}</div><div className="text-xs text-slate-500">Net {pkr(list - (Number(f.discount) || 0))}</div></div>
        </div>
        <Textarea label="Notes" value={f.notes} onChange={set('notes')} rows={2} />
        <ErrorBox error={err} />
      </form>
    </Modal>
  );
}

function BulkForm({ open, onClose, defaults }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: socs } = useSocieties();
  const { data: soc } = useBlocks(f.society_id);
  useEffect(() => { if (open) { setF({ society_id: defaults?.society_id || '', block_id: defaults?.block_id || '', prefix: '', suffix: '', start_no: '1', count: '10', street_no: '', size_marla: '5', front_ft: '', depth_ft: '', category: 'RESIDENTIAL', price_per_marla: '', is_corner: false, is_main_road: false, is_park_facing: false }); setErr(null); } }, [open, defaults]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const n = Number(f.count) || 0; const st = Number(f.start_no) || 0;
  const save = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await api.post('/plots/bulk', f); toast(`${r.created} plots created (${r.first} to ${r.last})`); refresh(); onClose(); } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add plots in bulk" size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button form="bulk-form" className="btn-primary" disabled={busy}>Create {n || ''} plots</button></>}>
      <form id="bulk-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Society" required value={f.society_id} onChange={(e) => setF({ ...f, society_id: e.target.value, block_id: '' })} placeholder="Select…" options={(socs || []).map((s) => [s.id, s.name])} />
          <Select label="Block" required value={f.block_id} onChange={set('block_id')} placeholder="Select…" options={(soc?.blocks || []).map((b) => [b.id, `Block ${b.name}`])} />
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <Input label="Prefix" value={f.prefix} onChange={set('prefix')} placeholder="A-" />
          <Input label="Start number" required inputMode="numeric" value={f.start_no} onChange={set('start_no')} />
          <Input label="How many" required inputMode="numeric" value={f.count} onChange={set('count')} />
          <Input label="Suffix" value={f.suffix} onChange={set('suffix')} />
          <Input label="Street" value={f.street_no} onChange={set('street_no')} />
        </div>
        {n > 0 && <div className="rounded-md bg-navy-50 px-3 py-2 text-sm text-navy-900">Will create: <b>{f.prefix}{st}{f.suffix}</b>{n > 1 && <> , {f.prefix}{st + 1}{f.suffix} … <b>{f.prefix}{st + n - 1}{f.suffix}</b></>} ({n} plots)</div>}
        <SizeInput value={f.size_marla} onChange={set('size_marla')} />
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Front (ft)" inputMode="decimal" value={f.front_ft} onChange={set('front_ft')} />
          <Input label="Depth (ft)" inputMode="decimal" value={f.depth_ft} onChange={set('depth_ft')} />
          <Select label="Category" value={f.category} onChange={set('category')} options={[['RESIDENTIAL', 'Residential'], ['COMMERCIAL', 'Commercial']]} />
          <Input label="Price per Marla (Rs)" inputMode="decimal" value={f.price_per_marla} onChange={set('price_per_marla')} />
        </div>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox label="Corner" checked={f.is_corner} onChange={set('is_corner')} /><Checkbox label="Main road" checked={f.is_main_road} onChange={set('is_main_road')} /><Checkbox label="Park facing" checked={f.is_park_facing} onChange={set('is_park_facing')} />
        </div>
        <ErrorBox error={err} />
      </form>
    </Modal>
  );
}

export function PlotsPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const filters = Object.fromEntries(['society_id', 'block_id', 'status', 'size', 'category', 'min_price', 'max_price', 'corner', 'main_road', 'park'].map((k) => [k, sp.get(k) || '']));
  const setFilter = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === 'society_id') n.delete('block_id'); setSp(n, { replace: true }); };
  const { data: socs } = useSocieties();
  const { data: soc } = useBlocks(filters.society_id);
  const { data: sizes } = useApi('/plots/sizes');
  const { data, isLoading, error } = useApi(`/plots${qs(filters)}`);
  const [form, setForm] = useState(false);
  const [bulk, setBulk] = useState(false);
  const totals = useMemo(() => ({ n: (data || []).length, marla: (data || []).reduce((s, r) => s + Number(r.size_marla), 0) }), [data]);
  const cols = [
    { key: 'plot_no', header: 'Plot', render: (r) => <div className="font-semibold text-navy-900">{r.plot_no}<div className="text-xs font-normal text-slate-500">{r.society_name}</div></div> },
    { key: 'block_name', header: 'Block' },
    { key: 'street_no', header: 'Street', render: (r) => r.street_no || '—' },
    { key: 'size_marla', header: 'Size', align: 'right', render: (r) => `${num(r.size_marla)} M` },
    { key: 'features', header: 'Type', value: (r) => [r.category, r.is_corner && 'corner', r.is_main_road && 'main road', r.is_park_facing && 'park'].filter(Boolean).join(' '), sortable: false,
      render: (r) => <div className="flex flex-wrap gap-1 text-[11px]">{r.category === 'COMMERCIAL' && <span className="rounded bg-gold-50 px-1.5 py-0.5 font-semibold text-gold-600">Commercial</span>}{r.is_corner && <span className="rounded bg-slate-100 px-1.5 py-0.5">Corner</span>}{r.is_main_road && <span className="rounded bg-slate-100 px-1.5 py-0.5">Main road</span>}{r.is_park_facing && <span className="rounded bg-slate-100 px-1.5 py-0.5">Park</span>}</div> },
    { key: 'price_per_marla', header: 'Rate / Marla', align: 'right', render: (r) => pkr(r.price_per_marla) },
    { key: 'list_price', header: 'Price', align: 'right', render: (r) => pkr(r.list_price - r.discount) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'customer_name', header: 'Owner / Reserved for', render: (r) => r.customer_name ? <div>{r.customer_name}<div className="text-xs text-slate-500">Balance {pkr(r.balance)}</div></div> : r.reserved_for || '—' },
  ];
  return (
    <>
      <PageHeader title="Plot Inventory" subtitle={`${totals.n} plots · ${num(totals.marla)} Marla`}
        actions={<>
          <ExportButtons report="inventory" params={{ society_id: filters.society_id }} />
          {can('plot.edit') && <><button type="button" className="btn-secondary" onClick={() => setBulk(true)}><Layers className="h-4 w-4" />Bulk add</button>
            <button type="button" className="btn-primary" onClick={() => setForm(true)}><Plus className="h-4 w-4" />Add plot</button></>}
        </>} />
      <Card className="mb-4" bodyClass="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Select label="Society" value={filters.society_id} onChange={(e) => setFilter('society_id', e.target.value)} placeholder="All" options={(socs || []).map((s) => [s.id, s.name])} />
          <Select label="Block" value={filters.block_id} onChange={(e) => setFilter('block_id', e.target.value)} placeholder="All" options={(soc?.blocks || []).map((b) => [b.id, b.name])} />
          <Select label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} placeholder="All" options={[...Object.keys(STATUS).slice(0, 6).map((k) => [k, STATUS[k].label]), ['BOOKED,TRANSFERRED', 'Booked + Transferred']]} />
          <Select label="Size" value={filters.size} onChange={(e) => setFilter('size', e.target.value)} placeholder="All" options={(sizes || []).map((s) => [s, `${num(s)} Marla`])} />
          <Select label="Category" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} placeholder="All" options={[['RESIDENTIAL', 'Residential'], ['COMMERCIAL', 'Commercial']]} />
          <Input label="Min price" inputMode="numeric" value={filters.min_price} onChange={(e) => setFilter('min_price', e.target.value)} />
          <Input label="Max price" inputMode="numeric" value={filters.max_price} onChange={(e) => setFilter('max_price', e.target.value)} />
          <div className="flex flex-col justify-end text-sm">
            <Checkbox label="Corner" checked={filters.corner === '1'} onChange={(v) => setFilter('corner', v ? '1' : '')} />
            <Checkbox label="Main road" checked={filters.main_road === '1'} onChange={(v) => setFilter('main_road', v ? '1' : '')} />
          </div>
        </div>
      </Card>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} onRowClick={(r) => nav(`/plots/${r.id}`)} pageSize={50} searchPlaceholder="Search plot number, owner, street…" empty="No plots match these filters." />}
      <PlotForm open={form} onClose={() => setForm(false)} defaults={filters} />
      <BulkForm open={bulk} onClose={() => setBulk(false)} defaults={filters} />
    </>
  );
}

export function PlotDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data: p, isLoading, error } = useApi(`/plots/${id}`);
  const [edit, setEdit] = useState(false);
  const [reserve, setReserve] = useState(false);
  const [rv, setRv] = useState({ reserved_for: '', customer: null, reserved_until: '', note: '' });
  const [rErr, setRErr] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const act = async (path, body, msg) => { await api.post(`/plots/${id}/${path}`, body); toast(msg); refresh(); };
  const doReserve = async (e) => {
    e.preventDefault(); setRErr(null);
    try { await act('reserve', { reserved_for: rv.reserved_for, customer_id: rv.customer?.id, reserved_until: rv.reserved_until, note: rv.note }, 'Plot reserved'); setReserve(false); } catch (ex) { setRErr(ex); }
  };
  const feats = [p.category === 'COMMERCIAL' ? 'Commercial' : 'Residential', p.is_corner && 'Corner', p.is_main_road && 'Main road facing', p.is_park_facing && 'Park facing'].filter(Boolean).join(' · ');
  const canBook = ['AVAILABLE', 'RESERVED'].includes(p.status);
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3">Plot {p.plot_no} <StatusBadge status={p.status} /></span>} subtitle={`${p.society_name} · Block ${p.block_name}${p.street_no ? ` · Street ${p.street_no}` : ''}`} back={{ to: '/plots', label: 'Plot inventory' }}
        actions={<>
          {canBook && can('booking.create') && <Link to={`/bookings/new?plot_id=${p.id}`} className="btn-gold"><FileSignature className="h-4 w-4" />Book this plot</Link>}
          {p.status === 'AVAILABLE' && can('plot.reserve') && <button type="button" className="btn-secondary" onClick={() => { setRv({ reserved_for: '', customer: null, reserved_until: '', note: '' }); setRErr(null); setReserve(true); }}><Lock className="h-4 w-4" />Reserve</button>}
          {p.status === 'RESERVED' && can('plot.reserve') && <button type="button" className="btn-secondary" onClick={() => setDlg('release')}><Unlock className="h-4 w-4" />Release reservation</button>}
          {['AVAILABLE', 'RESERVED'].includes(p.status) && can('plot.edit') && <button type="button" className="btn-secondary" onClick={() => setDlg('withdraw')}><Ban className="h-4 w-4" />Withdraw</button>}
          {p.status === 'CANCELLED' && can('plot.edit') && <button type="button" className="btn-secondary" onClick={() => setDlg('restore')}><RotateCcw className="h-4 w-4" />Return to sale</button>}
          {can('plot.edit') && !p.bookings.length && <button type="button" className="btn-ghost text-red-600" onClick={() => setDlg('delete')}><Trash2 className="h-4 w-4" />Delete</button>}
          {can('plot.edit') && <button type="button" className="btn-primary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button>}
        </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Plot details" className="lg:col-span-2">
          <KV cols={3} items={[
            ['Size', `${num(p.size_marla)} Marla`], ['Dimensions', p.front_ft && p.depth_ft ? `${num(p.front_ft)} × ${num(p.depth_ft)} ft` : '—'], ['Type', feats],
            ['Rate per Marla', pkr(p.price_per_marla)], ['Total price', pkr(p.list_price)], ['Offer discount', pkr(p.discount)],
            ['Net price', <b key="n">{pkr(p.list_price - p.discount)}</b>], ['Location', p.location_note], ['Notes', p.notes],
            p.status === 'RESERVED' && ['Reserved for', `${p.reserved_for}${p.reserved_until ? ` until ${date(p.reserved_until)}` : ''}${p.reserved_until && p.reserved_until < todayStr() ? ' (expired)' : ''}`],
            p.status_note && ['Status note', p.status_note],
          ]} />
        </Card>
        <Card title="Current owner">
          {p.current_booking_id ? (
            <div className="space-y-2 text-sm">
              <Link to={`/customers/${p.customer_id}`} className="block text-lg font-semibold text-navy-800 hover:underline">{p.customer_name}</Link>
              <div className="text-slate-500">{p.customer_code} · Booking <Link className="text-navy-700 hover:underline" to={`/bookings/${p.current_booking_id}`}>{p.booking_no}</Link></div>
              <div className="flex justify-between border-t pt-2"><span>Final price</span><b>{pkr(p.final_price)}</b></div>
              <div className="flex justify-between"><span>Paid</span><b className="text-emerald-700">{pkr(p.paid)}</b></div>
              <div className="flex justify-between"><span>Balance</span><b>{pkr(p.balance)}</b></div>
              {Number(p.overdue_amount) > 0 && <div className="flex justify-between text-red-700"><span>Overdue</span><b>{pkr(p.overdue_amount)}</b></div>}
            </div>
          ) : <Empty text="Not sold." />}
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Ownership history" bodyClass="p-0">
          {p.owners.length ? <table className="min-w-full divide-y divide-slate-100 text-sm"><tbody className="divide-y divide-slate-100">
            {p.owners.map((o) => <tr key={o.id}><td className="td"><Link className="font-medium text-navy-800 hover:underline" to={`/customers/${o.customer_id}`}>{o.customer_name}</Link><div className="text-xs text-slate-500">{o.cnic}</div></td>
              <td className="td text-xs">{date(o.start_date)} → {o.end_date ? date(o.end_date) : 'present'}<div className="text-slate-500">{o.acquired_via === 'TRANSFER' ? `Transfer ${o.transfer_no}` : `Booking ${o.booking_no}`}{o.ended_via ? ` · ended by ${o.ended_via.toLowerCase()}` : ''}</div></td></tr>)}
          </tbody></table> : <Empty text="No owners yet." />}
        </Card>
        <Card title="Booking history" bodyClass="p-0">
          {p.bookings.length ? <table className="min-w-full divide-y divide-slate-100 text-sm"><tbody className="divide-y divide-slate-100">
            {p.bookings.map((b) => <tr key={b.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/bookings/${b.id}`)}><td className="td font-medium">{b.booking_no}<div className="text-xs text-slate-500">{date(b.booking_date)}</div></td><td className="td">{b.customer_name}</td><td className="td num">{pkr(b.final_price)}</td><td className="td"><StatusBadge status={b.status} /></td></tr>)}
          </tbody></table> : <Empty text="No bookings yet." />}
        </Card>
      </div>
      <div className="mt-5"><DocumentsPanel entityType="PLOT" entityId={p.id} types={['SALE_AGREEMENT', 'REGISTRY', 'MUTATION', 'OWNERSHIP_DOCUMENT', 'LEGAL_DOCUMENT', 'OTHER']} title="Plot documents" /></div>
      <PlotForm open={edit} onClose={() => setEdit(false)} plot={p} />
      <Modal open={reserve} onClose={() => setReserve(false)} title={`Reserve plot ${p.plot_no}`} footer={<><button type="button" className="btn-secondary" onClick={() => setReserve(false)}>Cancel</button><button form="rsv" className="btn-primary">Reserve</button></>}>
        <form id="rsv" onSubmit={doReserve} className="space-y-3">
          <CustomerPicker label="Existing customer (optional)" value={rv.customer} onChange={(c) => setRv({ ...rv, customer: c })} />
          <Input label="Or reserved for (name)" value={rv.reserved_for} onChange={(e) => setRv({ ...rv, reserved_for: e.target.value })} />
          <Input label="Reserved until" type="date" value={rv.reserved_until} onChange={(e) => setRv({ ...rv, reserved_until: e.target.value })} />
          <Textarea label="Note" value={rv.note} onChange={(e) => setRv({ ...rv, note: e.target.value })} rows={2} />
          <ErrorBox error={rErr} />
        </form>
      </Modal>
      <ConfirmDialog open={dlg === 'release'} onClose={() => setDlg(null)} title="Release reservation" message={`Make plot ${p.plot_no} available again?`} onConfirm={() => act('release', {}, 'Reservation released')} />
      <ConfirmDialog open={dlg === 'withdraw'} onClose={() => setDlg(null)} title="Withdraw from sale" danger requireReason confirmText="Withdraw" message="The plot will be marked as withdrawn and cannot be booked until returned to sale." onConfirm={(reason) => act('withdraw', { reason }, 'Plot withdrawn')} />
      <ConfirmDialog open={dlg === 'restore'} onClose={() => setDlg(null)} title="Return to sale" message="Mark this plot as available again?" onConfirm={() => act('restore', {}, 'Plot available again')} />
      <ConfirmDialog open={dlg === 'delete'} onClose={() => setDlg(null)} title="Delete plot" danger confirmText="Delete" message="This plot has never been booked, so it can be deleted (for example a typing mistake). This is recorded in the audit log."
        onConfirm={async () => { await api.del(`/plots/${id}`); toast('Plot deleted'); refresh(); nav('/plots'); }} />
    </>
  );
}
