import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { num, pkr, STATUS } from '../lib/format.js';
import { Card, Empty, ErrorBox, Loading, Modal, PageHeader, Select, StatusBadge, KV } from '../components/ui.jsx';

export default function PlotMapPage() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const { data: socs } = useApi('/societies');
  const sid = sp.get('society_id') || '';
  useEffect(() => { if (!sid && socs?.length) setSp({ society_id: String(socs[0].id) }, { replace: true }); }, [sid, socs, setSp]);
  const { data, isLoading, error } = useApi(sid ? `/plots/map?society_id=${sid}` : null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('');
  const [sel, setSel] = useState(null);
  const grouped = useMemo(() => {
    if (!data) return [];
    return data.blocks.map((b) => {
      const plots = data.plots.filter((p) => p.block_id === b.id);
      const streets = {};
      plots.forEach((p) => { const k = p.street_no || '—'; (streets[k] = streets[k] || []).push(p); });
      return { ...b, plots, streets: Object.entries(streets).sort((a, c) => a[0].localeCompare(c[0], undefined, { numeric: true })) };
    });
  }, [data]);
  const counts = useMemo(() => { const c = {}; (data?.plots || []).forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; }); return c; }, [data]);
  const match = (p) => (!q || p.plot_no.toLowerCase().includes(q.toLowerCase()) || (p.customer_name || '').toLowerCase().includes(q.toLowerCase())) && (!only || p.status === only);
  return (
    <>
      <PageHeader title="Plot Map" subtitle="Every plot by block and street, coloured by status. Tap a plot for details." />
      <Card className="mb-4" bodyClass="p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_2fr] md:items-end">
          <Select label="Society" value={sid} onChange={(e) => setSp({ society_id: e.target.value })} options={(socs || []).map((s) => [s.id, s.name])} />
          <label className="block"><span className="label">Find plot or owner</span>
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. A-12 or Ahmed" /></div></label>
          <div className="flex flex-wrap gap-1.5">
            {['AVAILABLE', 'RESERVED', 'BOOKED', 'TRANSFERRED', 'SOLD', 'CANCELLED'].map((s) => (
              <button type="button" key={s} onClick={() => setOnly(only === s ? '' : s)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${only === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                <span className={`h-2.5 w-2.5 rounded-sm ${STATUS[s].dot}`} />{STATUS[s].label} <span className="opacity-70">{counts[s] || 0}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>
      <ErrorBox error={error} />
      {!socs?.length ? <Card><Empty text="Create a society and add plots first." /></Card> : isLoading ? <Loading /> : (
        <div className="space-y-5">
          {grouped.map((b) => (
            <Card key={b.id} title={`Block ${b.name}`} actions={<span className="text-sm text-slate-500">{b.plots.length} plots</span>}>
              {!b.plots.length && <Empty text="No plots in this block." />}
              {b.streets.map(([street, plots]) => (
                <div key={street} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><span>Street {street}</span><span className="h-px flex-1 bg-slate-200" /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {plots.map((p) => {
                      const w = Math.min(140, Math.max(58, 30 + Number(p.size_marla) * 7));
                      const dim = !match(p);
                      return (
                        <button type="button" key={p.id} onClick={() => setSel(p)} style={{ width: w }}
                          className={`relative h-16 rounded-md px-1.5 py-1 text-left text-white shadow-sm transition ${STATUS[p.status].tile} ${dim ? 'opacity-20' : ''} ${p.category === 'COMMERCIAL' ? 'ring-2 ring-gold-400 ring-offset-1' : ''}`}
                          title={`${p.plot_no} · ${num(p.size_marla)} Marla · ${STATUS[p.status].label}${p.customer_name ? ` · ${p.customer_name}` : ''}`}>
                          <div className="truncate text-[13px] font-bold leading-tight">{p.plot_no}</div>
                          <div className="text-[11px] opacity-90">{num(p.size_marla)} M</div>
                          <div className="truncate text-[10px] opacity-80">{p.customer_name || (p.is_corner ? 'Corner' : '')}</div>
                          {p.is_corner && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Card>
          ))}
          <p className="text-xs text-slate-500">Tile width follows plot size. Gold outline = commercial. White dot = corner plot.</p>
        </div>
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Plot ${sel.plot_no}` : ''} size="sm"
        footer={sel && <>
          <Link to={`/plots/${sel.id}`} className="btn-secondary">Open plot</Link>
          {['AVAILABLE', 'RESERVED'].includes(sel.status) && can('booking.create') && <Link to={`/bookings/new?plot_id=${sel.id}`} className="btn-gold">Book now</Link>}
        </>}>
        {sel && <KV items={[['Status', <StatusBadge key="s" status={sel.status} />], ['Size', `${num(sel.size_marla)} Marla`], ['Street', sel.street_no], ['Category', sel.category],
          ['Price', pkr(sel.list_price - sel.discount)], ['Rate / Marla', pkr(sel.price_per_marla)], sel.customer_name && ['Owner', sel.customer_name], sel.booking_no && ['Booking', sel.booking_no],
          sel.balance !== null && sel.balance !== undefined && ['Balance', pkr(sel.balance)]]} />}
      </Modal>
    </>
  );
}
