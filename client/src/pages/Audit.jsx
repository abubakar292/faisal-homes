import { useState } from 'react';
import { qs } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { dateTime, todayStr } from '../lib/format.js';
import { addDaysStr } from '../lib/dates.js';
import DataTable from '../components/DataTable.jsx';
import { Card, ErrorBox, Input, Loading, Modal, PageHeader, Select } from '../components/ui.jsx';

const ACTIONS = ['CREATE', 'UPDATE', 'CANCEL', 'REVERSE', 'DELETE', 'UPLOAD', 'VIEW_DOCUMENT', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'EXPORT', 'BACKUP', 'RESTORE'];
export default function AuditPage() {
  const t = todayStr();
  const [f, setF] = useState({ from: addDaysStr(t, -30), to: t, action: '', entity: '', q: '' });
  const { data, isLoading, error } = useApi(`/audit${qs(f)}`);
  const [sel, setSel] = useState(null);
  const { data: detail } = useApi(sel ? `/audit/${sel}` : null);
  const cols = [
    { key: 'created_at', header: 'When', render: (r) => <span className="whitespace-nowrap">{dateTime(r.created_at)}</span> },
    { key: 'username', header: 'User' },
    { key: 'action', header: 'Action', render: (r) => <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${['CANCEL', 'REVERSE', 'DELETE', 'LOGIN_FAILED', 'RESTORE'].includes(r.action) ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{r.action}</span> },
    { key: 'entity_type', header: 'Record', render: (r) => `${r.entity_type || ''}${r.entity_id ? ` #${r.entity_id}` : ''}` },
    { key: 'summary', header: 'Details' },
    { key: 'ip', header: 'IP', render: (r) => <span className="text-xs text-slate-500">{r.ip}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Every change, login, export, backup and restore — who did it and when. Audit entries cannot be edited or deleted from the software." />
      <Card className="mb-4" bodyClass="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input label="To" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Select label="Action" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="All" options={ACTIONS.map((a) => [a, a])} />
          <Select label="Record type" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} placeholder="All" options={['payment', 'booking', 'customer', 'plot', 'land', 'society', 'block', 'transfer', 'expense', 'charge', 'user', 'settings', 'backup'].map((a) => [a, a])} />
          <Input label="Search text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
      </Card>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} searchable={false} pageSize={50} onRowClick={(r) => r.has_data && setSel(r.id)} />}
      <Modal open={!!sel} onClose={() => setSel(null)} title="Change details" size="lg">
        {detail && <div className="grid gap-3 md:grid-cols-2">
          {[['Before', detail.before_data], ['After', detail.after_data]].map(([k, v]) => <div key={k}><div className="mb-1 text-sm font-semibold">{k}</div><pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{v ? JSON.stringify(v, null, 2) : '—'}</pre></div>)}
        </div>}
      </Modal>
    </>
  );
}
