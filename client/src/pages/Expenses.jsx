import { useEffect, useState } from 'react';
import { Plus, Paperclip, Ban, Pencil } from 'lucide-react';
import { api, qs } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, METHODS, methodLabel, pkr, todayStr, toPaisa } from '../lib/format.js';
import { addMonthsStr } from '../lib/dates.js';
import DataTable from '../components/DataTable.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import { Card, ConfirmDialog, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Tabs, useToast } from '../components/ui.jsx';

const COST_TYPE = { LAND_PAYMENT: 'Land payment', PROJECT: 'Project cost', OPERATING: 'Operating' };

function ExpenseForm({ open, onClose, expense, cats }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const { data: lands } = useApi(open ? '/lands' : null);
  const { data: socs } = useApi(open ? '/societies' : null);
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (open) {
      setF(expense ? { ...expense, land_id: expense.land_id || '', society_id: expense.society_id || '', reference_no: expense.reference_no || '', paid_to: expense.paid_to || '' }
        : { expense_date: todayStr(), category_id: '', description: '', amount: '', method: 'CASH', reference_no: '', paid_to: '', land_id: '', society_id: '' });
      setErr(null); setSaved(null);
    }
  }, [open, expense]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cat = (cats || []).find((c) => String(c.id) === String(f.category_id));
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      if (expense) { await api.put(`/expenses/${expense.id}`, f); toast('Expense updated'); refresh(); onClose(); } else { const r = await api.post('/expenses', f); toast(`Expense ${r.expense_no} saved`); refresh(); setSaved(r); }
    } catch (ex) { setErr(ex); }
  };
  return (
    <Modal open={open} onClose={onClose} title={saved ? `Expense ${saved.expense_no} saved` : expense ? `Edit ${expense.expense_no}` : 'Add expense'}
      footer={saved ? <button type="button" className="btn-primary" onClick={onClose}>Done</button> : <><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button form="exp-form" className="btn-primary">Save expense</button></>}>
      {saved ? <><p className="mb-3 text-sm text-slate-600">Attach the bill or receipt (optional):</p><DocumentsPanel entityType="EXPENSE" entityId={saved.id} types={['EXPENSE_RECEIPT', 'OTHER']} title="Attachment" compact /></> : (
        <form id="exp-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          {expense && <p className="text-xs text-slate-500 sm:col-span-2">Amount, date and method cannot be edited. To correct them, cancel this expense and enter it again.</p>}
          <Input label="Date" type="date" required value={f.expense_date} max={todayStr()} onChange={set('expense_date')} disabled={!!expense} />
          <Select label="Category" required value={f.category_id} onChange={set('category_id')} placeholder="Select…" options={(cats || []).filter((c) => c.is_active || String(c.id) === String(f.category_id)).map((c) => [c.id, c.name])} />
          <Input label="Description" required className="sm:col-span-2" value={f.description} onChange={set('description')} />
          <Input label="Amount (Rs)" required inputMode="decimal" value={f.amount} onChange={set('amount')} disabled={!!expense} />
          <Select label="Payment method" value={f.method} onChange={set('method')} options={METHODS} disabled={!!expense} />
          <Input label={f.method === 'CHEQUE' ? 'Cheque number' : 'Reference no.'} value={f.reference_no} onChange={set('reference_no')} />
          <Input label="Paid to" value={f.paid_to} onChange={set('paid_to')} />
          <Select label={`Land${cat?.cost_type === 'LAND_PAYMENT' ? ' (required)' : ' (optional)'}`} required={cat?.cost_type === 'LAND_PAYMENT'} value={f.land_id} onChange={set('land_id')} placeholder="— None —" options={(lands || []).map((l) => [l.id, l.name])} hint="Linking adds the cost to that land's investment" />
          <Select label="Society (optional)" value={f.society_id} onChange={set('society_id')} placeholder="— None —" options={(socs || []).map((s) => [s.id, s.name])} />
          <ErrorBox error={err} className="sm:col-span-2" />
        </form>
      )}
    </Modal>
  );
}

export default function ExpensesPage() {
  const { can } = useAuth();
  const toast = useToast(); const refresh = useRefreshAll();
  const today = todayStr();
  const [tab, setTab] = useState('list');
  const [f, setF] = useState({ from: addMonthsStr(today, -3), to: today, category_id: '', status: 'ACTIVE' });
  const [group, setGroup] = useState('monthly');
  const { data: cats } = useApi('/expenses/categories');
  const { data, isLoading, error } = useApi(tab === 'list' ? `/expenses${qs(f)}` : null);
  const sum = useApi(tab === 'summary' ? `/reports/expenses${qs({ from: f.from, to: f.to, group })}` : null);
  const [form, setForm] = useState(null);
  const [att, setAtt] = useState(null);
  const [cancel, setCancel] = useState(null);
  const total = (data || []).filter((r) => r.status === 'ACTIVE').reduce((s, r) => s + toPaisa(r.amount), 0) / 100;
  const cols = [
    { key: 'expense_no', header: 'No', render: (r) => <span className="font-mono text-xs">{r.expense_no}</span> },
    { key: 'expense_date', header: 'Date', render: (r) => date(r.expense_date) },
    { key: 'category_name', header: 'Category', render: (r) => <div>{r.category_name}<div className="text-xs text-slate-500">{COST_TYPE[r.cost_type]}</div></div> },
    { key: 'description', header: 'Description', render: (r) => <div>{r.description}<div className="text-xs text-slate-500">{[r.paid_to, r.land_name, r.society_name].filter(Boolean).join(' · ')}</div></div> },
    { key: 'method', header: 'Method', render: (r) => methodLabel(r.method) },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={r.status !== 'ACTIVE' ? 'line-through opacity-60' : 'font-semibold'}>{pkr(r.amount)}</span> },
    { key: 'entered_by_name', header: 'Entered by' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'ACTIVE' ? 'ACTIVE' : 'REVERSED'} label={r.status === 'ACTIVE' ? 'Active' : 'Cancelled'} /> },
    { key: 'act', header: '', sortable: false, render: (r) => <div className="flex justify-end gap-1">
      <button type="button" className="btn-ghost btn-sm" title="Attachments" onClick={() => setAtt(r)}><Paperclip className="h-4 w-4" />{r.attachment_count || ''}</button>
      {r.status === 'ACTIVE' && can('expense.edit') && <button type="button" className="btn-ghost btn-sm" onClick={() => setForm(r)}><Pencil className="h-4 w-4" /></button>}
      {r.status === 'ACTIVE' && can('expense.cancel') && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setCancel(r)}><Ban className="h-4 w-4" /></button>}</div> },
  ];
  return (
    <>
      <PageHeader title="Expenses" subtitle="Development, construction and office expenses. Payments to land owners are made with Pay Land Owner on the land page."
        actions={<><ExportButtons report={tab === 'list' ? 'expense-list' : 'expenses'} params={{ from: f.from, to: f.to, group }} />
          {can('expense.edit') && <button type="button" className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" />Add expense</button>}</>} />
      <Tabs active={tab} onChange={setTab} tabs={[['list', 'Expense list'], ['summary', 'Daily / monthly / yearly report']]} />
      <Card className="mb-4" bodyClass="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Input label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input label="To" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          {tab === 'list' ? <>
            <Select label="Category" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} placeholder="All" options={(cats || []).map((c) => [c.id, c.name])} />
            <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All" options={[['ACTIVE', 'Active'], ['CANCELLED', 'Cancelled']]} />
          </> : <Select label="Group by" value={group} onChange={(e) => setGroup(e.target.value)} options={[['daily', 'Day'], ['monthly', 'Month'], ['yearly', 'Year']]} />}
        </div>
      </Card>
      {tab === 'list' && <><ErrorBox error={error} />{isLoading ? <Loading /> : <><div className="mb-2 text-sm text-slate-600">Total (active): <b>{pkr(total)}</b></div><DataTable columns={cols} rows={data} empty="No expenses in this period." /></>}</>}
      {tab === 'summary' && (sum.isLoading ? <Loading /> : sum.data && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2"><DataTable searchable={false} pageSize={100} rows={sum.data.rows.map((r, i) => ({ id: i, ...r }))} columns={[
            { key: 'period', header: group === 'daily' ? 'Date' : group === 'monthly' ? 'Month' : 'Year', render: (r) => (group === 'daily' ? date(r.period) : r.period) },
            { key: 'category', header: 'Category' }, { key: 'entries', header: 'Entries', align: 'right' }, { key: 'amount', header: 'Amount', align: 'right', render: (r) => pkr(r.amount) }]}
            footer={<tr><td className="td" colSpan={3}>Total</td><td className="td num">{pkr(sum.data.totals.amount)}</td></tr>} /></div>
          <Card title="By category">{sum.data.summary.map((s) => <div key={s.label} className="flex justify-between border-b border-slate-100 py-1.5 text-sm"><span>{s.label}</span><b>{pkr(s.value)}</b></div>)}</Card>
        </div>
      ))}
      <ExpenseForm open={!!form} onClose={() => setForm(null)} expense={form?.id ? form : null} cats={cats} />
      <Modal open={!!att} onClose={() => setAtt(null)} title={att ? `Attachments — ${att.expense_no}` : ''}>{att && <DocumentsPanel entityType="EXPENSE" entityId={att.id} types={['EXPENSE_RECEIPT', 'OTHER']} title="Bills & receipts" compact />}</Modal>
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title="Cancel expense" danger requireReason confirmText="Cancel expense"
        message={cancel ? `Cancel ${cancel.expense_no} (${pkr(cancel.amount)})? It stays on record as cancelled and a reversing entry is added to the cash book.` : ''}
        onConfirm={async (reason) => { await api.post(`/expenses/${cancel.id}/cancel`, { reason }); toast('Expense cancelled'); refresh(); }} />
    </>
  );
}
