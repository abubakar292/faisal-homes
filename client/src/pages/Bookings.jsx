import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Printer, Wallet, CalendarCog, Ban, ArrowLeftRight, Plus, Trash2, Receipt as ReceiptIcon, BadgePercent } from 'lucide-react';
import { api, openPdf, qs } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, dateTime, installmentStatus, METHODS, methodLabel, num, pkr, planLabel, toPaisa, todayStr } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import { Card, Checkbox, ConfirmDialog, ErrorBox, Input, Loading, Modal, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea, useToast, Empty } from '../components/ui.jsx';

export function BookingsPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState('ACTIVE');
  const [overdue, setOverdue] = useState(false);
  const { data, isLoading, error } = useApi(`/bookings${qs({ status, overdue: overdue ? '1' : '' })}`);
  const cols = [
    { key: 'booking_no', header: 'Booking', render: (r) => <div className="font-semibold text-navy-900">{r.booking_no}<div className="text-xs font-normal text-slate-500">{date(r.booking_date)}</div></div> },
    { key: 'customer_name', header: 'Customer', render: (r) => <div>{r.customer_name}<div className="text-xs text-slate-500">{r.mobile}</div></div> },
    { key: 'plot_no', header: 'Plot', render: (r) => <div>{r.plot_no}<div className="text-xs text-slate-500">Block {r.block_name} · {num(r.size_marla)} M</div></div> },
    { key: 'plan_type', header: 'Plan', render: (r) => planLabel(r.plan_type) },
    { key: 'final_price', header: 'Price', align: 'right', render: (r) => pkr(r.final_price) },
    { key: 'paid', header: 'Paid', align: 'right', render: (r) => pkr(r.paid) },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => pkr(r.balance) },
    { key: 'overdue_amount', header: 'Overdue', align: 'right', render: (r) => (Number(r.overdue_amount) > 0 && r.status === 'ACTIVE' ? <span className="font-semibold text-red-700">{pkr(r.overdue_amount)}</span> : '—') },
    { key: 'next_due_date', header: 'Next due', render: (r) => (r.status === 'ACTIVE' && r.next_due_date ? date(r.next_due_date) : '—') },
    { key: 'status', header: 'Status', render: (r) => <div className="flex flex-col items-start gap-1"><StatusBadge status={r.status} />{r.transfer_count > 0 && <StatusBadge status="TRANSFERRED" label="Transferred" />}</div> },
  ];
  return (
    <>
      <PageHeader title="Bookings & Sales" subtitle="Every plot sale with its payment position"
        actions={can('booking.create') && <Link to="/bookings/new" className="btn-gold"><Plus className="h-4 w-4" />New booking</Link>} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} onRowClick={(r) => nav(`/bookings/${r.id}`)} searchPlaceholder="Booking no, customer, plot, CNIC, mobile…"
        toolbar={<><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[['ACTIVE', 'Active'], ['CANCELLED', 'Cancelled'], ['', 'All']]} /><Checkbox label="Overdue only" checked={overdue} onChange={setOverdue} /></>} />}
    </>
  );
}

function ScheduleEditor({ open, onClose, booking }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  useEffect(() => { if (open) { setRows(booking.schedule.map((s) => ({ kind: s.kind, label: s.label, due_date: s.due_date, amount: String(Number(s.amount)), paid: Number(s.paid_amount) }))); setReason(''); setErr(null); } }, [open, booking]);
  const total = rows.reduce((s, r) => s + toPaisa(r.amount), 0);
  const target = toPaisa(booking.final_price);
  const upd = (i, k, v) => setRows((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    setErr(null);
    try { await api.put(`/bookings/${booking.id}/schedule`, { rows, reason }); toast('Schedule updated'); refresh(); onClose(); } catch (ex) { setErr(ex); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Edit schedule — ${booking.booking_no}`} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={total !== target || !reason.trim()}>Save schedule</button></>}>
      <Notice tone="info" className="mb-3">Change dates, split or merge installments. The total must stay equal to the final price ({pkr(booking.final_price)}). Payments already received are re-applied automatically, oldest due first. The old schedule is kept in history.</Notice>
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[28px_1fr_1.6fr_1fr_auto] items-center gap-2">
            <span className="text-xs text-slate-500">{i + 1}</span>
            <input className="input py-1.5" type="date" value={r.due_date} onChange={(e) => upd(i, 'due_date', e.target.value)} />
            <input className="input py-1.5" value={r.label} onChange={(e) => upd(i, 'label', e.target.value)} />
            <input className="input py-1.5 text-right" inputMode="decimal" value={r.amount} onChange={(e) => upd(i, 'amount', e.target.value)} />
            <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} title="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setRows((x) => [...x, { kind: 'CUSTOM', label: `Installment ${x.length + 1}`, due_date: x.at(-1)?.due_date || todayStr(), amount: '0' }])}><Plus className="h-4 w-4" />Add row</button>
        <div className={`text-sm font-semibold ${total === target ? 'text-emerald-700' : 'text-red-700'}`}>Total {pkr(total / 100)} · {total === target ? 'matches final price' : `difference ${pkr((target - total) / 100)}`}</div>
      </div>
      <Textarea label="Reason for change" required className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <ErrorBox error={err} className="mt-3" />
    </Modal>
  );
}

function CancelDialog({ open, onClose, booking }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => { if (open) { setF({ reason: '', refund_amount: '0', refund_method: 'CASH', refund_reference: '', refund_date: todayStr() }); setErr(null); } }, [open]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const retained = Number(booking.paid) - (Number(f.refund_amount) || 0);
  const go = async () => {
    setErr(null);
    try { await api.post(`/bookings/${booking.id}/cancel`, f); toast('Booking cancelled'); refresh(); onClose(); } catch (ex) { setErr(ex); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Cancel booking ${booking.booking_no}`}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Back</button><button type="button" className="btn-danger" onClick={go}>Cancel booking</button></>}>
      <Notice tone="warn" className="mb-3">The plot will return to inventory as AVAILABLE. Payments stay on record. Unpaid charges are waived. This cannot be undone — to sell again, create a new booking.</Notice>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm"><div>Amount paid: <b>{pkr(booking.paid)}</b></div><div>Retained (forfeited): <b>{pkr(retained)}</b></div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea label="Reason for cancellation" required className="sm:col-span-2" value={f.reason} onChange={set('reason')} rows={2} />
        <Input label="Refund amount (Rs)" inputMode="decimal" value={f.refund_amount} onChange={set('refund_amount')} hint={`Maximum ${pkr(booking.paid)}`} />
        <Input label="Refund date" type="date" value={f.refund_date} onChange={set('refund_date')} />
        <Select label="Refund method" value={f.refund_method} onChange={set('refund_method')} options={METHODS} />
        <Input label="Cheque / reference no." value={f.refund_reference} onChange={set('refund_reference')} />
      </div>
      <ErrorBox error={err} className="mt-3" />
    </Modal>
  );
}

function ChargeDialog({ open, onClose, booking, installment }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setF(installment ? { charge_type: 'LATE_FEE', amount: String(installment.suggested_late_fee || ''), description: `Late fee — ${installment.label} (due ${date(installment.due_date)})`, installment_id: installment.id, charge_date: todayStr() }
        : { charge_type: 'OTHER', amount: '', description: '', installment_id: '', charge_date: todayStr() });
      setErr(null);
    }
  }, [open, installment]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async () => { setErr(null); try { await api.post(`/bookings/${booking.id}/charges`, f); toast('Charge posted'); refresh(); onClose(); } catch (ex) { setErr(ex); } };
  return (
    <Modal open={open} onClose={onClose} title={installment ? 'Post late fee' : 'Add charge'} size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={go}>Post charge</button></>}>
      <div className="space-y-3">
        {!installment && <Select label="Type" value={f.charge_type} onChange={set('charge_type')} options={[['OTHER', 'Other charge'], ['LATE_FEE', 'Late fee']]} />}
        <Input label="Amount (Rs)" required inputMode="decimal" value={f.amount} onChange={set('amount')} />
        <Input label="Description" required value={f.description} onChange={set('description')} />
        <Input label="Date" type="date" value={f.charge_date} onChange={set('charge_date')} />
        <p className="text-xs text-slate-500">The charge is added to what the customer owes. It is collected separately (Collect Payment → Charges) and does not change the plot balance.</p>
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { can } = useAuth();
  const toast = useToast(); const refresh = useRefreshAll();
  const nav = useNavigate();
  const { data: b, isLoading, error } = useApi(`/bookings/${id}`);
  const [tab, setTab] = useState('schedule');
  const [dlg, setDlg] = useState(null);
  const [inst, setInst] = useState(null);
  const [waive, setWaive] = useState(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const active = b.status === 'ACTIVE';
  const today = todayStr();
  const created = sp.get('created');
  const receiptId = sp.get('receipt');
  return (
    <>
      <PageHeader back={{ to: '/bookings', label: 'Bookings' }}
        title={<span className="flex flex-wrap items-center gap-3">{b.booking_no}<StatusBadge status={b.status} /><StatusBadge status={b.plot_status} /></span>}
        subtitle={`Plot ${b.plot_no} · Block ${b.block_name} · ${b.society_name} · ${num(b.size_marla)} Marla · ${planLabel(b.plan_type)}`}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => openPdf(`/bookings/${b.id}/confirmation.pdf`)}><Printer className="h-4 w-4" />Booking confirmation</button>
          {active && can('payment.create') && Number(b.balance) + Number(b.charges_due) > 0 && <Link to={`/collect?booking_id=${b.id}`} className="btn-gold"><Wallet className="h-4 w-4" />Collect payment</Link>}
          {active && can('schedule.edit') && <button type="button" className="btn-secondary" onClick={() => setDlg('schedule')}><CalendarCog className="h-4 w-4" />Edit schedule</button>}
          {active && can('charge.manage') && <button type="button" className="btn-secondary" onClick={() => { setInst(null); setDlg('charge'); }}><BadgePercent className="h-4 w-4" />Add charge</button>}
          {active && can('transfer.create') && <Link to={`/transfers/new?booking_id=${b.id}`} className="btn-secondary"><ArrowLeftRight className="h-4 w-4" />Transfer</Link>}
          {active && can('booking.cancel') && <button type="button" className="btn-ghost text-red-600" onClick={() => setDlg('cancel')}><Ban className="h-4 w-4" />Cancel booking</button>}
        </>} />
      {created && (
        <Notice tone="ok" className="mb-4">
          <div className="font-semibold">Booking confirmed.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {receiptId && <button type="button" className="btn-primary btn-sm" onClick={() => openPdf(`/payments/${receiptId}/receipt.pdf`)}><ReceiptIcon className="h-4 w-4" />Print booking receipt</button>}
            <button type="button" className="btn-secondary btn-sm" onClick={() => openPdf(`/bookings/${b.id}/confirmation.pdf`)}><Printer className="h-4 w-4" />Print booking confirmation</button>
          </div>
        </Notice>
      )}
      {!active && <Notice tone="warn" className="mb-4">Cancelled on {dateTime(b.cancelled_at)} by {b.cancelled_by_name}: {b.cancel_reason}. Refunded {pkr(b.refund_amount)}.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Final price" value={pkr(b.final_price)} sub={Number(b.discount) ? `Discount ${pkr(b.discount)}` : `${pkr(b.rate_per_marla)} / Marla`} />
        <StatCard label="Paid" value={pkr(b.paid)} tone="green" sub={`${b.paid_count} of ${b.total_count} installments`} />
        <StatCard label="Balance" value={pkr(b.balance)} />
        <StatCard label="Overdue" value={pkr(active ? b.overdue_amount : 0)} tone={active && Number(b.overdue_amount) > 0 ? 'red' : 'slate'} sub={active ? `${b.overdue_count} installment(s)` : ''} />
        <StatCard label="Next due" value={active && b.next_due_date ? date(b.next_due_date) : '—'} sub={active && b.next_due_amount ? pkr(b.next_due_amount) : ''} />
        <StatCard label="Charges due" value={pkr(b.charges_due)} tone={Number(b.charges_due) > 0 ? 'gold' : 'slate'} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Owner">
          <Link to={`/customers/${b.customer_id}`} className="text-lg font-semibold text-navy-800 hover:underline">{b.customer_name}</Link>
          <div className="mt-1 text-sm text-slate-600">{b.customer_code} · CNIC {b.customer_cnic}<br />{b.customer_mobile}</div>
          {b.transfer_count > 0 && <div className="mt-2 text-xs text-slate-500">Originally booked by {b.original_customer_name}</div>}
          <div className="mt-4 space-y-1 border-t pt-3 text-sm">
            {[['Booking date', date(b.booking_date)], ['Total price', pkr(b.total_price)], ['Discount', pkr(b.discount)], ['Booking amount', pkr(b.booking_amount)], ['Down payment', pkr(b.down_payment)], ['Sales person', b.sales_person || '—'], ['Entered by', b.created_by_name]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-medium">{v}</span></div>)}
          </div>
          {b.notes && <p className="mt-3 text-sm text-slate-600">{b.notes}</p>}
        </Card>
        <div className="lg:col-span-2">
          <Tabs active={tab} onChange={setTab} tabs={[['schedule', 'Installment schedule', b.schedule.length], ['payments', 'Payments', b.payments.length], ['charges', 'Charges', b.charges.length], ['owners', 'Ownership', b.owners.length], ['history', 'Schedule changes', b.revisions.length], ['docs', 'Documents']]} />
          {tab === 'schedule' && (
            <div className="card overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr><th className="th">#</th><th className="th">Due date</th><th className="th">Description</th><th className="th text-right">Amount</th><th className="th text-right">Paid</th><th className="th text-right">Due</th><th className="th">Status</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {b.schedule.map((s) => {
                    const st = installmentStatus(s, today);
                    return (
                      <tr key={s.id} className={st === 'OVERDUE' && active ? 'bg-red-50/60' : s.kind === 'BALLOON' ? 'bg-gold-50/50' : ''}>
                        <td className="td text-xs text-slate-500">{s.seq_no}</td><td className="td whitespace-nowrap">{date(s.due_date)}</td><td className="td">{s.label}</td>
                        <td className="td num">{pkr(s.amount)}</td><td className="td num text-emerald-700">{Number(s.paid_amount) ? pkr(s.paid_amount) : '—'}</td><td className="td num">{pkr(Number(s.amount) - Number(s.paid_amount))}</td>
                        <td className="td"><StatusBadge status={active ? st : 'WAIVED'} label={active ? undefined : 'Closed'} /></td>
                        <td className="td text-right">{active && st === 'OVERDUE' && can('charge.manage') && s.suggested_late_fee > 0 && !s.late_fee_posted && <button type="button" className="btn-ghost btn-sm text-amber-700" onClick={() => { setInst(s); setDlg('charge'); }}>Late fee {pkr(s.suggested_late_fee)}</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'payments' && <DataTable rows={b.payments} searchable={false} onRowClick={(r) => nav(`/receipts/${r.id}`)} columns={[
            { key: 'receipt_no', header: 'Receipt' }, { key: 'payment_date', header: 'Date', render: (r) => date(r.payment_date) }, { key: 'payer_name', header: 'Paid by' },
            { key: 'purpose', header: 'For', render: (r) => (r.purpose === 'CHARGE' ? 'Charge' : 'Installment') }, { key: 'method', header: 'Method', render: (r) => `${methodLabel(r.method)}${r.reference_no ? ` · ${r.reference_no}` : ''}` },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => pkr(r.amount) }, { key: 'status', header: '', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'print', header: '', sortable: false, render: (r) => <button type="button" className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openPdf(`/payments/${r.id}/receipt.pdf`); }}><Printer className="h-4 w-4" /></button> }]} empty="No payments yet." />}
          {tab === 'charges' && <DataTable rows={b.charges} searchable={false} columns={[
            { key: 'charge_date', header: 'Date', render: (r) => date(r.charge_date) }, { key: 'description', header: 'Description' }, { key: 'charge_type', header: 'Type' },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => pkr(r.amount) }, { key: 'paid', header: 'Paid', align: 'right', render: (r) => pkr(r.paid) }, { key: 'due', header: 'Due', align: 'right', render: (r) => pkr(r.due) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'act', header: '', sortable: false, render: (r) => r.status === 'ACTIVE' && Number(r.due) > 0 && <div className="flex gap-1">
              {can('payment.create') && <Link className="btn-ghost btn-sm" to={`/collect?booking_id=${b.id}&charge_id=${r.id}`}>Collect</Link>}
              {can('charge.manage') && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setWaive(r)}>Waive</button>}</div> }]} empty="No charges. Late fees are never added automatically." />}
          {tab === 'owners' && <Card bodyClass="p-0"><table className="min-w-full divide-y divide-slate-100 text-sm"><tbody className="divide-y divide-slate-100">
            {b.owners.map((o) => <tr key={o.id}><td className="td"><Link className="font-medium text-navy-800 hover:underline" to={`/customers/${o.customer_id}`}>{o.customer_name}</Link></td><td className="td">{date(o.start_date)} → {o.end_date ? date(o.end_date) : 'present'}</td><td className="td">{o.acquired_via}{o.ended_via ? ` → ${o.ended_via}` : ''}</td></tr>)}
            {b.transfers.map((t) => <tr key={`t${t.id}`} className="bg-violet-50/40"><td className="td" colSpan={3}><Link to={`/transfers/${t.id}`} className="font-medium text-violet-800 hover:underline">{t.transfer_no}</Link>: {t.from_name} → {t.to_name} on {date(t.transfer_date)} · fee {pkr(t.transfer_fee)}{t.dues_override ? ' · approved with pending dues' : ''}</td></tr>)}
          </tbody></table></Card>}
          {tab === 'history' && (b.revisions.length ? <Card bodyClass="p-0"><table className="min-w-full divide-y divide-slate-100 text-sm"><tbody className="divide-y divide-slate-100">
            {b.revisions.map((r) => <tr key={r.id}><td className="td whitespace-nowrap">{dateTime(r.created_at)}</td><td className="td">{r.created_by_name}</td><td className="td">{r.old_rows} → {r.new_rows} rows</td><td className="td">{r.reason}</td></tr>)}
          </tbody></table></Card> : <Card><Empty text="The schedule has not been changed." /></Card>)}
          {tab === 'docs' && <DocumentsPanel entityType="BOOKING" entityId={b.id} types={['BOOKING_FORM', 'SALE_AGREEMENT', 'PAYMENT_RECEIPT', 'LEGAL_DOCUMENT', 'OTHER']} title="Booking documents" />}
        </div>
      </div>
      {active && <ScheduleEditor open={dlg === 'schedule'} onClose={() => setDlg(null)} booking={b} />}
      {active && <CancelDialog open={dlg === 'cancel'} onClose={() => setDlg(null)} booking={b} />}
      {active && <ChargeDialog open={dlg === 'charge'} onClose={() => { setDlg(null); setInst(null); }} booking={b} installment={inst} />}
      <ConfirmDialog open={!!waive} onClose={() => setWaive(null)} title="Waive charge" requireReason danger confirmText="Waive" message={waive ? `Waive the remaining ${pkr(waive.due)} of "${waive.description}"?` : ''}
        onConfirm={async (reason) => { await api.post(`/bookings/charges/${waive.id}/waive`, { reason }); toast('Charge waived'); refresh(); }} />
    </>
  );
}
