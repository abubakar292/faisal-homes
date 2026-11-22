import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Map, Grid3x3 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { num } from '../lib/format.js';
import { Card, ConfirmDialog, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Textarea, useToast, Empty } from '../components/ui.jsx';

function SocietyForm({ open, onClose, society }) {
  const { settings } = useAuth();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data: lands } = useApi(open ? '/lands' : null);
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) setF(society ? { ...society, land_id: society.land_id || '' } : { name: '', code: '', land_id: '', location: '', description: '', marla_sqft: settings.measurement?.marla_sqft || 272.25, status: 'ACTIVE' });
    setErr(null);
  }, [open, society, settings.measurement]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try { if (society) await api.put(`/societies/${society.id}`, f); else await api.post('/societies', f); toast('Saved'); refresh(); onClose(); } catch (ex) { setErr(ex); }
  };
  return (
    <Modal open={open} onClose={onClose} title={society ? 'Edit society' : 'New society / project'}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button form="soc-form" className="btn-primary">Save</button></>}>
      <form id="soc-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Input label="Society name" required value={f.name} onChange={set('name')} />
        <Input label="Short code" value={f.code} onChange={set('code')} />
        <Select label="Land" value={f.land_id} onChange={set('land_id')} placeholder="— Not linked —" options={(lands || []).map((l) => [l.id, l.name])} />
        <Input label="1 Marla = sq ft (this society)" inputMode="decimal" value={f.marla_sqft} onChange={set('marla_sqft')} />
        <Input label="Location" className="sm:col-span-2" value={f.location} onChange={set('location')} />
        <Textarea label="Description" className="sm:col-span-2" value={f.description} onChange={set('description')} rows={2} />
        {society && <Select label="Status" value={f.status} onChange={set('status')} options={[['ACTIVE', 'Active'], ['ARCHIVED', 'Archived']]} />}
        <ErrorBox error={err} className="sm:col-span-2" />
      </form>
    </Modal>
  );
}

export function SocietiesPage() {
  const { can } = useAuth();
  const { data, isLoading, error } = useApi('/societies');
  const [form, setForm] = useState(false);
  return (
    <>
      <PageHeader title="Societies & Blocks" subtitle="Projects, their blocks and plot counts"
        actions={can('society.edit') && <button type="button" className="btn-primary" onClick={() => setForm(true)}><Plus className="h-4 w-4" />New society</button>} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : !data.length ? <Card><Empty text="No society created yet. Create your first society/project to start adding blocks and plots." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <Link key={s.id} to={`/societies/${s.id}`} className="card block p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between"><div><h3 className="text-lg font-bold text-navy-900">{s.name}</h3><p className="text-sm text-slate-500">{s.location || s.land_name || '—'}</p></div>{s.code && <span className="rounded bg-gold-50 px-2 py-0.5 text-xs font-bold text-gold-600">{s.code}</span>}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[['Plots', s.plot_count], ['Blocks', s.block_count], ['Marla', num(s.plotted_marla)]].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 py-2"><div className="text-lg font-bold tabular-nums">{v}</div><div className="text-xs text-slate-500">{k}</div></div>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <StatusBadge status="AVAILABLE" label={`${s.available} available`} /><StatusBadge status="RESERVED" label={`${s.reserved} reserved`} />
                <StatusBadge status="BOOKED" label={`${s.booked} booked`} /><StatusBadge status="SOLD" label={`${s.sold} sold`} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <SocietyForm open={form} onClose={() => setForm(false)} />
    </>
  );
}

export function SocietyDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data: s, isLoading, error } = useApi(`/societies/${id}`);
  const [edit, setEdit] = useState(false);
  const [blockForm, setBlockForm] = useState(null);
  const [blockName, setBlockName] = useState('');
  const [blockErr, setBlockErr] = useState(null);
  const [del, setDel] = useState(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const saveBlock = async (e) => {
    e.preventDefault(); setBlockErr(null);
    try {
      if (blockForm.id) await api.put(`/societies/blocks/${blockForm.id}`, { name: blockName }); else await api.post(`/societies/${id}/blocks`, { name: blockName });
      toast('Block saved'); refresh(); setBlockForm(null);
    } catch (ex) { setBlockErr(ex); }
  };
  return (
    <>
      <PageHeader title={s.name} subtitle={[s.location, s.land_name && `Land: ${s.land_name}`, `1 Marla = ${num(s.marla_sqft)} sq ft`].filter(Boolean).join(' · ')} back={{ to: '/societies', label: 'All societies' }}
        actions={<>
          <Link to={`/plots?society_id=${s.id}`} className="btn-secondary"><Grid3x3 className="h-4 w-4" />Plots</Link>
          <Link to={`/plot-map?society_id=${s.id}`} className="btn-secondary"><Map className="h-4 w-4" />Map</Link>
          {can('society.edit') && <button type="button" className="btn-primary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button>}
        </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Blocks" className="lg:col-span-2" bodyClass="p-0"
          actions={can('society.edit') && <button type="button" className="btn-primary btn-sm" onClick={() => { setBlockForm({}); setBlockName(''); setBlockErr(null); }}><Plus className="h-4 w-4" />Add block</button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr><th className="th">Block</th><th className="th text-right">Plots</th><th className="th text-right">Available</th><th className="th text-right">Booked</th><th className="th text-right">Sold</th><th className="th text-right">Marla</th><th className="th">Streets</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="td font-semibold"><Link className="text-navy-800 hover:underline" to={`/plots?society_id=${s.id}&block_id=${b.id}`}>Block {b.name}</Link></td>
                    <td className="td num">{b.plot_count}</td><td className="td num">{b.available}</td><td className="td num">{b.booked}</td><td className="td num">{b.sold}</td><td className="td num">{num(b.plotted_marla)}</td>
                    <td className="td text-xs text-slate-500">{(b.streets || []).join(', ') || '—'}</td>
                    <td className="td whitespace-nowrap text-right">{can('society.edit') && <>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => { setBlockForm(b); setBlockName(b.name); setBlockErr(null); }}><Pencil className="h-4 w-4" /></button>
                      {b.plot_count === 0 && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setDel(b)}><Trash2 className="h-4 w-4" /></button>}
                    </>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!s.blocks.length && <Empty text="No blocks yet. Add a block, then add plots to it." />}
          </div>
        </Card>
        <Card title="Plot sizes">
          {s.sizes.length ? s.sizes.map((z) => <div key={z.size_marla} className="flex justify-between border-b border-slate-100 py-1.5 text-sm"><span>{num(z.size_marla)} Marla</span><b>{z.n} plots</b></div>) : <Empty text="No plots yet." />}
          {s.description && <p className="mt-4 text-sm text-slate-600">{s.description}</p>}
        </Card>
      </div>
      <Modal open={!!blockForm} onClose={() => setBlockForm(null)} title={blockForm?.id ? 'Rename block' : 'Add block'} size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setBlockForm(null)}>Cancel</button><button form="blk" className="btn-primary">Save</button></>}>
        <form id="blk" onSubmit={saveBlock}><Input label="Block name" required autoFocus value={blockName} onChange={(e) => setBlockName(e.target.value)} placeholder="e.g. A, B, Commercial" /><ErrorBox error={blockErr} className="mt-3" /></form>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete empty block" danger confirmText="Delete" message={`Delete block ${del?.name}? It has no plots.`}
        onConfirm={async () => { await api.del(`/societies/blocks/${del.id}`); toast('Block deleted'); refresh(); }} />
      <SocietyForm open={edit} onClose={() => setEdit(false)} society={s} />
    </>
  );
}
