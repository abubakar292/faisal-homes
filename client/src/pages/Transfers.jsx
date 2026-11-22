import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Printer, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api, openPdf } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, METHODS, pkr, todayStr } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import { BookingPicker, CustomerPicker } from '../components/Pickers.jsx';
import CustomerForm from '../components/CustomerForm.jsx';
import { Card, Checkbox, ErrorBox, Input, KV, Loading, Modal, Notice, PageHeader, Select, Textarea, useToast } from '../components/ui.jsx';

export function TransfersPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const { data, isLoading, error } = useApi('/transfers');
  const cols = [
    { key: 'transfer_no', header: 'Transfer', render: (r) => <b className="text-navy-900">{r.transfer_no}</b> },
    { key: 'transfer_date', header: 'Date', render: (r) => date(r.transfer_date) },
    { key: 'plot_no', header: 'Plot', render: (r) => `${r.plot_no} · Block ${r.block_name}` },
    { key: 'from_name', header: 'From (seller)' },
    { key: 'to_name', header: 'To (buyer)' },
    { key: 'balance_at_transfer', header: 'Balance taken over', align: 'right', render: (r) => pkr(r.balance_at_transfer) },
    { key: 'transfer_fee', header: 'Fee', align: 'right', render: (r) => pkr(r.transfer_fee) },
    { key: 'dues_override', header: 'Dues', render: (r) => (r.dues_override ? <span className="text-amber-700">Override</span> : <span className="text-emerald-700">Clear</span>) },
  ];
  return (
    <>
      <PageHeader title="Plot Transfers" subtitle="Ownership changes with complete history"
        actions={can('transfer.create') && <Link to="/transfers/new" className="btn-primary"><Plus className="h-4 w-4" />New transfer</Link>} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} onRowClick={(r) => nav(`/transfers/${r.id}`)} empty="No transfers yet." />}
    </>
  );
}

export function NewTransferPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast(); const refresh = useRefreshAll();
  const [picked, setPicked] = useState(null);
  const bookingId = picked?.id || sp.get('booking_id');
  const { data: b } = useApi(bookingId ? `/bookings/${bookingId}` : null);
  const { data: chk } = useApi(bookingId ? `/transfers/check/${bookingId}` : null);
  const [to, setTo] = useState(null);
  const [newCust, setNewCust] = useState(false);
  const [f, setF] = useState({ transfer_date: todayStr(), transfer_fee: '', fee_paid_by: 'FROM', fee_paid_now: true, fee_method: 'CASH', fee_reference: '', override_dues: false, override_reason: '', witness_1: '', witness_2: '', notes: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTo(null); setErr(null); }, [bookingId]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    if (!to) { setErr(new Error('Select the new owner')); return; }
    setBusy(true);
    try { const r = await api.post('/transfers', { ...f, booking_id: b.id, to_customer_id: to.id }); toast(`Transfer ${r.transfer.transfer_no} completed`); refresh(); nav(`/transfers/${r.transfer.id}?created=1${r.payment ? `&receipt=${r.payment.id}` : ''}`); }
    catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="New Plot Transfer" subtitle="Admin approval required. Pending dues are checked automatically." back={{ to: '/transfers', label: 'Transfers' }} />
      <div className="max-w-4xl space-y-5">
        <Card title="1. Plot to transfer">
          {b ? <BookingPicker value={{ ...b }} onChange={(v) => { setPicked(v); if (!v) nav('/transfers/new', { replace: true }); }} /> : <BookingPicker value={null} onChange={setPicked} />}
          {chk && (chk.clear ? <Notice tone="ok" className="mt-3"><ShieldCheck className="hidden" />No overdue installments or unpaid charges. Transfer allowed.</Notice>
            : <Notice tone="warn" className="mt-3"><b>Pending dues:</b> overdue {pkr(chk.overdue_amount)} ({chk.overdue_count} installment(s)), unpaid charges {pkr(chk.charges_due)}. Clear the dues first, or approve with an override reason below.</Notice>)}
        </Card>
        {b && (
          <form onSubmit={submit} className="space-y-5">
            <Card title="2. New owner">
              <div className="mb-3 text-sm text-slate-600">Current owner: <b>{b.customer_name}</b> ({b.customer_cnic}) · balance to be taken over: <b>{pkr(b.balance)}</b></div>
              <CustomerPicker label="Transfer to (new owner)" value={to} onChange={setTo} exclude={b.customer_id} onCreateNew={() => setNewCust(true)} />
            </Card>
            <Card title="3. Transfer details">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Transfer date" type="date" required value={f.transfer_date} max={todayStr()} onChange={set('transfer_date')} />
                <Input label="Transfer fee (Rs)" inputMode="decimal" value={f.transfer_fee} onChange={set('transfer_fee')} />
                <Select label="Fee paid by" value={f.fee_paid_by} onChange={set('fee_paid_by')} options={[['FROM', 'Seller (current owner)'], ['TO', 'Buyer (new owner)']]} />
              </div>
              {Number(f.transfer_fee) > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <Checkbox label="Fee received now (generate receipt)" checked={f.fee_paid_now} onChange={set('fee_paid_now')} />
                  {f.fee_paid_now && <div className="mt-2 grid gap-3 sm:grid-cols-2"><Select label="Method" value={f.fee_method} onChange={set('fee_method')} options={METHODS} /><Input label="Reference / cheque no." value={f.fee_reference} onChange={set('fee_reference')} /></div>}
                </div>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Witness 1" value={f.witness_1} onChange={set('witness_1')} />
                <Input label="Witness 2" value={f.witness_2} onChange={set('witness_2')} />
                <Textarea label="Notes" className="sm:col-span-2" rows={2} value={f.notes} onChange={set('notes')} />
              </div>
              {chk && !chk.clear && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <Checkbox label={<span className="font-semibold text-amber-900"><ShieldAlert className="mr-1 inline h-4 w-4" />Approve transfer with pending dues (admin override)</span>} checked={f.override_dues} onChange={set('override_dues')} />
                  {f.override_dues && <Textarea label="Reason for override" required rows={2} value={f.override_reason} onChange={set('override_reason')} />}
                </div>
              )}
              <ErrorBox error={err} className="mt-3" />
              <div className="mt-4 flex justify-end"><button type="submit" className="btn-primary" disabled={busy || (chk && !chk.clear && !f.override_dues)}>Complete transfer</button></div>
            </Card>
          </form>
        )}
      </div>
      <Modal open={newCust} onClose={() => setNewCust(false)} title="Register new owner" size="lg" footer={<><button type="button" className="btn-secondary" onClick={() => setNewCust(false)}>Cancel</button><button form="tr-cust" className="btn-primary">Save & select</button></>}>
        {newCust && <CustomerForm formId="tr-cust" compact onSaved={(c) => { setTo(c); setNewCust(false); }} />}
      </Modal>
    </>
  );
}

export function TransferDetailPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { data: t, isLoading, error } = useApi(`/transfers/${id}`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <PageHeader back={{ to: '/transfers', label: 'Transfers' }} title={`Transfer ${t.transfer_no}`} subtitle={`${date(t.transfer_date)} · Plot ${t.plot_no} · Block ${t.block_name} · ${t.society_name}`}
        actions={<>
          {sp.get('receipt') && <button type="button" className="btn-secondary" onClick={() => openPdf(`/payments/${sp.get('receipt')}/receipt.pdf`)}><Printer className="h-4 w-4" />Fee receipt</button>}
          <button type="button" className="btn-primary" onClick={() => openPdf(`/transfers/${t.id}/letter.pdf`)}><Printer className="h-4 w-4" />Print transfer letter</button>
        </>} />
      {sp.get('created') && <Notice tone="ok" className="mb-4">Transfer completed. Ownership history and the booking have been updated.</Notice>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Transferor (previous owner)"><KV items={[['Name', <Link key="n" className="text-navy-700 hover:underline" to={`/customers/${t.from_customer_id}`}>{t.from_name}</Link>], ['Father name', t.from_father_name], ['CNIC', t.from_cnic], ['Mobile', t.from_mobile]]} /></Card>
        <Card title="Transferee (new owner)"><KV items={[['Name', <Link key="n" className="text-navy-700 hover:underline" to={`/customers/${t.to_customer_id}`}>{t.to_name}</Link>], ['Father name', t.to_father_name], ['CNIC', t.to_cnic], ['Mobile', t.to_mobile]]} /></Card>
        <Card title="Financial position at transfer"><KV items={[['Total price', pkr(t.final_price)], ['Paid', pkr(t.paid_at_transfer)], ['Balance taken over', pkr(t.balance_at_transfer)], ['Overdue at transfer', pkr(t.overdue_at_transfer)],
          ['Unpaid charges', pkr(t.unpaid_charges_at_transfer)], ['Transfer fee', `${pkr(t.transfer_fee)} (paid by ${t.fee_paid_by === 'TO' ? 'buyer' : 'seller'})`], ['Booking', <Link key="b" className="text-navy-700 hover:underline" to={`/bookings/${t.booking_id}`}>{t.booking_no}</Link>]]} />
          {t.dues_override && <Notice tone="warn" className="mt-3">Approved with pending dues: {t.override_reason}</Notice>}</Card>
        <Card title="Approval"><KV items={[['Approved by', t.approved_by_name], ['Witness 1', t.witness_1], ['Witness 2', t.witness_2], ['Notes', t.notes]]} /></Card>
      </div>
      <div className="mt-5"><DocumentsPanel entityType="TRANSFER" entityId={t.id} types={['TRANSFER_DOCUMENT', 'CNIC_FRONT', 'CNIC_BACK', 'LEGAL_DOCUMENT', 'OTHER']} title="Transfer documents" /></div>
    </>
  );
}
