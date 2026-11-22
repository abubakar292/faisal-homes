import { useEffect, useState } from 'react';
import { Plus, KeyRound, Pencil } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { dateTime, ROLES, roleLabel } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import { Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, useToast, Notice } from '../components/ui.jsx';

const ROLE_HELP = { ADMIN: 'Full access to everything', ACCOUNTANT: 'Payments, receipts, expenses and reports', SALES: 'Customers, bookings, plot reservations', VIEWER: 'Read-only, CNIC numbers masked' };

export default function UsersPage() {
  const toast = useToast(); const refresh = useRefreshAll();
  const { data, isLoading, error } = useApi('/users');
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => setErr(null), [form, pw]);
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try { if (form.id) await api.put(`/users/${form.id}`, form); else await api.post('/users', form); toast('User saved'); refresh(); setForm(null); } catch (ex) { setErr(ex); }
  };
  const reset = async (e) => {
    e.preventDefault(); setErr(null);
    try { await api.post(`/users/${pw.id}/reset-password`, { password: pw.password, must_change_password: pw.must_change_password }); toast('Password reset'); setPw(null); } catch (ex) { setErr(ex); }
  };
  const cols = [
    { key: 'full_name', header: 'Name', render: (r) => <b>{r.full_name}</b> }, { key: 'username', header: 'Username' },
    { key: 'role', header: 'Role', render: (r) => <div>{roleLabel(r.role)}<div className="text-xs text-slate-500">{ROLE_HELP[r.role]}</div></div> },
    { key: 'is_active', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'ACTIVE' : 'ARCHIVED'} label={r.is_active ? 'Active' : 'Disabled'} /> },
    { key: 'last_login_at', header: 'Last login', render: (r) => dateTime(r.last_login_at) },
    { key: 'act', header: '', sortable: false, render: (r) => <div className="flex justify-end gap-1"><button type="button" className="btn-ghost btn-sm" onClick={() => setForm({ ...r })}><Pencil className="h-4 w-4" /></button><button type="button" className="btn-ghost btn-sm" onClick={() => setPw({ id: r.id, name: r.full_name, password: '', must_change_password: true })}><KeyRound className="h-4 w-4" />Reset password</button></div> },
  ];
  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Office staff accounts" actions={<button type="button" className="btn-primary" onClick={() => setForm({ username: '', full_name: '', role: 'SALES', password: '', must_change_password: true, is_active: true })}><Plus className="h-4 w-4" />Add user</button>} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} searchable={false} />}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.full_name}` : 'Add user'} size="sm" footer={<><button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><button form="uf" className="btn-primary">Save</button></>}>
        {form && <form id="uf" onSubmit={save} className="space-y-3">
          <Input label="Full name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          {!form.id && <Input label="Username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />}
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={ROLES} hint={ROLE_HELP[form.role]} />
          {!form.id && <Input label="Password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="At least 8 characters" autoComplete="new-password" />}
          {!form.id && <Checkbox label="Ask user to change password at first login" checked={form.must_change_password} onChange={(v) => setForm({ ...form, must_change_password: v })} />}
          {form.id && <Checkbox label="Account active" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />}
          <ErrorBox error={err} />
        </form>}
      </Modal>
      <Modal open={!!pw} onClose={() => setPw(null)} title={`Reset password — ${pw?.name}`} size="sm" footer={<><button type="button" className="btn-secondary" onClick={() => setPw(null)}>Cancel</button><button form="pw" className="btn-primary">Reset</button></>}>
        {pw && <form id="pw" onSubmit={reset} className="space-y-3">
          <Input label="New password" type="password" required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" />
          <Checkbox label="User must change it at next login" checked={pw.must_change_password} onChange={(v) => setPw({ ...pw, must_change_password: v })} />
          <Notice>The user will be logged out of all devices.</Notice>
          <ErrorBox error={err} />
        </form>}
      </Modal>
    </>
  );
}
