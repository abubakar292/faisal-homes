import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, PiggyBank, Landmark, Hammer, Wallet, Users, HandCoins, Scale, Undo2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, METHODS, methodLabel, pkr, shortPkr, todayStr } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import { Card, ConfirmDialog, ErrorBox, Input, Loading, Modal, Notice, PageHeader, Select, StatCard, StatusBadge, Textarea, useToast } from '../components/ui.jsx';

function AddInvestment({ open, onClose }) {
  const toast = useToast();
  const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ investor_name: '', contribution_date: todayStr(), amount: '', method: 'CASH', reference_no: '', notes: '' }); setErr(null); } }, [open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.post('/investments', f); toast(`Investment ${r.contribution_no} of ${pkr(r.amount)} saved`); refresh(); onClose(); } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add personal investment"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="inv-form" className="btn-primary" disabled={busy}>Save investment</button></>}>
      <form id="inv-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Notice className="sm:col-span-2">Use this when the owner puts his own money into the business before deciding what it is for. It can then be used for land payments. (Money put in while paying a land owner can also be entered directly in Pay Land Owner.)</Notice>
        <Input label="Investor name" required value={f.investor_name} onChange={set('investor_name')} />
        <Input label="Investment date" type="date" required max={todayStr()} value={f.contribution_date} onChange={set('contribution_date')} />
        <Input label="Amount (Rs)" required inputMode="decimal" value={f.amount} onChange={set('amount')} />
        <Select label="How the money came in" value={f.method} onChange={set('method')} options={METHODS} />
        <Input label="Reference (optional)" value={f.reference_no} onChange={set('reference_no')} />
        <Textarea label="Notes" className="sm:col-span-2" rows={2} value={f.notes} onChange={set('notes')} />
        <ErrorBox error={err} className="sm:col-span-2" />
      </form>
    </Modal>
  );
}

export default function InvestmentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshAll();
  const { data: s } = useApi('/investments/summary');
  const { data, isLoading, error } = useApi('/investments');
  const [add, setAdd] = useState(false);
  const [rev, setRev] = useState(null);
  const cols = [
    { key: 'contribution_date', header: 'Date / ID', value: (r) => `${r.contribution_date} ${r.contribution_no}`,
      render: (r) => <div className="whitespace-nowrap">{date(r.contribution_date)}<div className="font-mono text-[11px] font-semibold text-navy-800">{r.contribution_no}</div></div> },
    { key: 'investor_name', header: 'Investor', render: (r) => <div><div className="font-semibold text-navy-900">{r.investor_name}</div>{r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}</div> },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <b className={r.status === 'REVERSED' ? 'line-through' : ''}>{pkr(r.amount)}</b> },
    { key: 'used', header: 'Used', align: 'right', render: (r) => pkr(r.used) },
    { key: 'available', header: 'Not used yet', align: 'right', render: (r) => <span className={Number(r.available) > 0 ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{pkr(r.available)}</span> },
    { key: 'used_for', header: 'Used for', value: (r) => `${r.used_for || ''} ${r.made_with_payment || ''}`,
      render: (r) => <div className="min-w-[9rem] text-xs">{r.used_for || (r.status === 'VALID' ? 'Not used yet' : '—')}</div> },
    { key: 'method', header: 'Method / by', value: (r) => `${methodLabel(r.method)} ${r.entered_by_name || ''}`,
      render: (r) => <div className="text-xs">{methodLabel(r.method)}{r.reference_no ? ` · ${r.reference_no}` : ''}<div className="text-slate-500">{r.entered_by_name}</div></div> },
    { key: 'status', header: 'Status', render: (r) => <div className="min-w-[7rem]"><StatusBadge status={r.status} />{r.status === 'REVERSED' && <div className="text-xs text-red-700">{r.reversal_reason}</div>}</div> },
    { key: 'x', header: '', sortable: false, render: (r) => r.status === 'VALID' && can('land.reverse') && Number(r.used) === 0 && (
      <button type="button" className="btn-ghost btn-sm text-red-700" onClick={(e) => { e.stopPropagation(); setRev(r); }}><Undo2 className="h-4 w-4" />Reverse</button>) },
  ];
  return (
    <>
      <PageHeader title="Personal Investment" subtitle="Owner's own money put into the business, and how customer money was used for land" back={{ to: '/lands', label: 'Land Management' }}
        actions={<>
          <ExportButtons report="investment" />
          {can('investment.manage') && <button type="button" className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Add investment</button>}
        </>} />
      {s && <>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-600">Personal investment</h2>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="investment-summary">
          <StatCard icon={PiggyBank} tone="violet" label="Total personal investment" value={shortPkr(s.personal_investment_total)} sub={pkr(s.personal_investment_total)} />
          <StatCard icon={Landmark} tone="gold" label="Used for land purchase" value={shortPkr(s.personal_used_land_purchase)} sub={pkr(s.personal_used_land_purchase)} />
          <StatCard icon={Hammer} tone="slate" label="Used for land expenses" value={shortPkr(s.personal_used_land_expenses)} sub={pkr(s.personal_used_land_expenses)} />
          <StatCard icon={Wallet} tone="green" label="Remaining (not used)" value={shortPkr(s.personal_available)} sub={pkr(s.personal_available)} />
          <StatCard icon={Hammer} tone="blue" label="Development expenses paid" value={shortPkr(s.development_expenses_paid)} sub="From the Expenses module" to="/expenses" />
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gold-600">Customer money</h2>
          <div className="flex gap-2"><ExportButtons report="customer-money" /></div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={Users} tone="blue" label="Received from customers" value={shortPkr(s.customer_money_received)} sub={pkr(s.customer_money_received)} to="/receipts" />
          <StatCard icon={HandCoins} tone="gold" label="Customer money used for land" value={shortPkr(s.customer_used_land_purchase + s.customer_used_land_expenses)}
            sub={`${shortPkr(s.customer_used_land_purchase)} purchase · ${shortPkr(s.customer_used_land_expenses)} expenses`} />
          <StatCard icon={Wallet} tone="green" label="Customer money not used for land" value={shortPkr(s.customer_money_unallocated)} sub={pkr(s.customer_money_unallocated)} />
          <StatCard icon={Scale} tone="slate" label="Cash in business (all sources)" value={shortPkr(s.cash_in_business)} sub={pkr(s.cash_in_business)} />
        </div>
        {(s.land_payments_unreconciled !== 0 || s.legacy_land_payments_no_source > 0) && (
          <Notice tone="warn" className="mb-5">
            {s.legacy_land_payments_no_source > 0 && <>Land payments of <b>{pkr(s.legacy_land_payments_no_source)}</b> were entered before this upgrade, so their source (personal or customer money) is not recorded. They are shown separately and are not counted as personal investment. </>}
            {s.land_payments_unreconciled !== 0 && <>Land payments without a matching source: <b>{pkr(s.land_payments_unreconciled)}</b>.</>}
          </Notice>
        )}
      </>}
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-600">Every investment entry</h2>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} empty="No personal investment recorded yet." searchPlaceholder="Search investor, ID, land…"
        rowClass={(r) => (r.status === 'REVERSED' ? 'text-slate-400' : '')} />}
      <p className="mt-3 text-xs text-slate-500">Customer money is never counted as personal investment. Land payments are listed on each <Link to="/lands" className="text-navy-700 underline">land's ledger</Link>.</p>
      <AddInvestment open={add} onClose={() => setAdd(false)} />
      <ConfirmDialog open={!!rev} onClose={() => setRev(null)} danger requireReason title={`Reverse investment ${rev?.contribution_no || ''}`} confirmText="Reverse"
        message="The entry stays on record marked as reversed, and a cash-out entry is added to the cash book."
        onConfirm={async (reason) => { await api.post(`/investments/${rev.id}/reverse`, { reason }); toast('Investment reversed'); refresh(); }} />
    </>
  );
}
