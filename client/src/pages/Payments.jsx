import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Printer, Download, RotateCcw, Wallet, CheckCircle2 } from 'lucide-react';
import { api, openPdf, qs } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, dateTime, METHODS, methodLabel, pkr, todayStr, toPaisa } from '../lib/format.js';
import { addDaysStr } from '../lib/dates.js';
import DataTable from '../components/DataTable.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import { BookingPicker } from '../components/Pickers.jsx';
import { Card, ConfirmDialog, ErrorBox, Input, KV, Loading, Modal, Notice, PageHeader, Select, StatusBadge, Textarea, useToast } from '../components/ui.jsx';

export function CollectPaymentPage() {
  const [sp] = useSearchParams();
  const toast = useToast(); const refresh = useRefreshAll();
  const [picked, setPicked] = useState(null);
  const bookingId = picked?.id || sp.get('booking_id');
  const { data: b, isLoading } = useApi(bookingId ? `/bookings/${bookingId}` : null);
  const custBookings = useApi(!bookingId && sp.get('customer_id') ? `/customers/${sp.get('customer_id')}` : null);
  const today = todayStr();
  const blank = { purpose: 'INSTALLMENT', charge_id: '', amount: '', payment_date: today, method: 'CASH', reference_no: '', bank_name: '', notes: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => { setF((s) => ({ ...blank, payment_date: s.payment_date, method: s.method, purpose: sp.get('charge_id') ? 'CHARGE' : 'INSTALLMENT', charge_id: sp.get('charge_id') || '' })); setErr(null); }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const charges = (b?.charges || []).filter((c) => c.status === 'ACTIVE' && Number(c.due) > 0);
  const selCharge = charges.find((c) => String(c.id) === String(f.charge_id));
  const balanceAfter = b ? (toPaisa(b.balance) - (f.purpose === 'INSTALLMENT' ? toPaisa(f.amount) : 0)) / 100 : 0;
  const save = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const p = await api.post('/payments', { ...f, booking_id: b.id, charge_id: f.purpose === 'CHARGE' ? f.charge_id : null });
      refresh(); setDone(p); toast(`Receipt ${p.receipt_no} saved`);
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  };
  const nextDue = b?.next_due_amount ? Number(b.next_due_amount) : 0;
  const owner = custBookings.data?.bookings?.filter((x) => x.status === 'ACTIVE' && x.is_current_owner) || [];
  return (
    <>
      <PageHeader title="Collect Payment" subtitle="Receive an installment, partial payment or charge and print the receipt" />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            {b ? (
              <BookingPicker value={{ ...b, plot_no: b.plot_no, block_name: b.block_name, customer_name: b.customer_name, society_name: b.society_name, booking_no: b.booking_no, balance: b.balance }} onChange={(v) => { setPicked(v); if (!v) window.history.replaceState(null, '', '/collect'); }} />
            ) : <BookingPicker value={null} onChange={setPicked} />}
            {!bookingId && owner.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium text-slate-700">{custBookings.data.customer.full_name}'s plots:</div>
                {owner.map((x) => <button type="button" key={x.id} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-navy-50" onClick={() => setPicked({ id: x.id })}>Plot {x.plot_no} · Block {x.block_name} · balance {pkr(x.balance)}</button>)}
              </div>
            )}
          </Card>
          {isLoading && <Loading />}
          {b && b.status !== 'ACTIVE' && <Notice tone="warn">This booking is cancelled. Payments cannot be received.</Notice>}
          {b && b.status === 'ACTIVE' && (
            <Card title="Payment details">
              <form onSubmit={save} className="space-y-4">
                {charges.length > 0 && (
                  <div className="flex gap-2">
                    <button type="button" className={f.purpose === 'INSTALLMENT' ? 'btn-primary' : 'btn-secondary'} onClick={() => setF({ ...f, purpose: 'INSTALLMENT', charge_id: '' })}>Plot installment</button>
                    <button type="button" className={f.purpose === 'CHARGE' ? 'btn-primary' : 'btn-secondary'} onClick={() => setF({ ...f, purpose: 'CHARGE', charge_id: charges[0].id, amount: String(Number(charges[0].due)) })}>Charges / fees ({charges.length})</button>
                  </div>
                )}
                {f.purpose === 'CHARGE' && <Select label="Charge" value={f.charge_id} onChange={(e) => { const c = charges.find((x) => String(x.id) === e.target.value); setF({ ...f, charge_id: e.target.value, amount: c ? String(Number(c.due)) : '' }); }} options={charges.map((c) => [c.id, `${c.description} — due ${pkr(c.due)}`])} />}
                {f.purpose === 'INSTALLMENT' && (
                  <div className="flex flex-wrap gap-2">
                    {nextDue > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setF({ ...f, amount: String(nextDue) })}>Next installment {pkr(nextDue)}</button>}
                    {Number(b.overdue_amount) > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setF({ ...f, amount: String(Number(b.overdue_amount)) })}>All overdue {pkr(b.overdue_amount)}</button>}
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setF({ ...f, amount: String(Number(b.balance)) })}>Full balance {pkr(b.balance)}</button>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Amount received (Rs)" required inputMode="decimal" value={f.amount} onChange={set('amount')} className="sm:col-span-1" autoFocus />
                  <Input label="Payment date" type="date" required value={f.payment_date} max={today} onChange={set('payment_date')} />
                  <Select label="Payment method" value={f.method} onChange={set('method')} options={METHODS} />
                  <Input label={f.method === 'CHEQUE' ? 'Cheque number' : 'Reference / transaction no.'} required={f.method === 'CHEQUE'} value={f.reference_no} onChange={set('reference_no')} />
                  {f.method !== 'CASH' && <Input label="Bank" value={f.bank_name} onChange={set('bank_name')} />}
                  <Textarea label="Notes" rows={1} value={f.notes} onChange={set('notes')} className={f.method !== 'CASH' ? '' : 'sm:col-span-2'} />
                </div>
                <ErrorBox error={err} />
                <button type="submit" className="btn-gold w-full py-3 text-base" disabled={busy || !Number(f.amount)}><Wallet className="h-5 w-5" />Save payment & generate receipt</button>
              </form>
            </Card>
          )}
        </div>
        {b && (
          <Card title="Account position">
            <div className="space-y-2 text-sm">
              {[['Customer', <Link key="c" className="text-navy-700 hover:underline" to={`/customers/${b.customer_id}`}>{b.customer_name}</Link>], ['Plot', `${b.plot_no} · Block ${b.block_name}`], ['Total plot price', pkr(b.final_price)], ['Paid so far', pkr(b.paid)],
                ['Previous balance', <b key="b">{pkr(b.balance)}</b>], ['Overdue', <span key="o" className={Number(b.overdue_amount) > 0 ? 'font-bold text-red-700' : ''}>{pkr(b.overdue_amount)}</span>],
                ['Next due', b.next_due_date ? `${date(b.next_due_date)} · ${pkr(b.next_due_amount)}` : '—'], ['Charges due', pkr(b.charges_due)]].map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>)}
              {f.purpose === 'INSTALLMENT' && Number(f.amount) > 0 && <div className="mt-2 flex justify-between rounded-lg bg-navy-50 px-3 py-2"><span>Balance after this payment</span><b className={balanceAfter < 0 ? 'text-red-700' : 'text-navy-900'}>{pkr(balanceAfter)}</b></div>}
              {f.purpose === 'CHARGE' && selCharge && <div className="mt-2 rounded-lg bg-gold-50 px-3 py-2">Paying charge: {selCharge.description}. Plot balance does not change.</div>}
            </div>
            <div className="mt-4 max-h-64 overflow-y-auto border-t pt-3">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Upcoming / unpaid</div>
              {b.schedule.filter((s) => Number(s.paid_amount) < Number(s.amount)).slice(0, 8).map((s) => (
                <div key={s.id} className={`flex justify-between py-1 text-xs ${s.due_date < today ? 'text-red-700' : 'text-slate-600'}`}><span>{date(s.due_date)} · {s.label}</span><span className="tabular-nums">{pkr(Number(s.amount) - Number(s.paid_amount))}</span></div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <Modal open={!!done} onClose={() => setDone(null)} title="Payment saved" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => { setDone(null); setF({ ...blank, payment_date: f.payment_date }); }}>Another payment</button>
          <button type="button" className="btn-primary" onClick={() => openPdf(`/payments/${done.id}/receipt.pdf`)}><Printer className="h-4 w-4" />Print receipt</button></>}>
        {done && <div className="text-center"><CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-emerald-600" /><div className="text-lg font-bold">{done.receipt_no}</div><div className="text-2xl font-bold text-navy-900">{pkr(done.amount)}</div>
          {done.purpose === 'INSTALLMENT' && <div className="mt-1 text-sm text-slate-600">Remaining balance {pkr(done.balance_after)}</div>}
          <a className="mt-3 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline" href={`/api/payments/${done.id}/receipt.pdf?download=1`}><Download className="h-4 w-4" />Download PDF</a></div>}
      </Modal>
    </>
  );
}

export function ReceiptsPage() {
  const nav = useNavigate();
  const today = todayStr();
  const [f, setF] = useState({ from: addDaysStr(today, -90), to: today, method: '', status: '' });
  const { data, isLoading, error } = useApi(`/payments${qs(f)}`);
  const total = (data || []).filter((r) => r.status === 'VALID').reduce((s, r) => s + toPaisa(r.amount), 0) / 100;
  const cols = [
    { key: 'receipt_no', header: 'Receipt', render: (r) => <span className="font-semibold text-navy-900">{r.receipt_no}</span> },
    { key: 'payment_date', header: 'Date', render: (r) => date(r.payment_date) },
    { key: 'customer_name', header: 'Customer', render: (r) => <div>{r.customer_name}<div className="text-xs text-slate-500">{r.customer_cnic}</div></div> },
    { key: 'plot_no', header: 'Plot', render: (r) => `${r.plot_no} (${r.block_name})` },
    { key: 'purpose', header: 'For', render: (r) => (r.purpose === 'CHARGE' ? r.charge_description : 'Installment') },
    { key: 'method', header: 'Method', render: (r) => `${methodLabel(r.method)}${r.reference_no ? ` · ${r.reference_no}` : ''}` },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={r.status === 'REVERSED' ? 'line-through opacity-60' : 'font-semibold'}>{pkr(r.amount)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'p', header: '', sortable: false, render: (r) => <button type="button" className="btn-ghost btn-sm" title="Print" onClick={(e) => { e.stopPropagation(); openPdf(`/payments/${r.id}/receipt.pdf`); }}><Printer className="h-4 w-4" /></button> },
  ];
  return (
    <>
      <PageHeader title="Receipts" subtitle={`${(data || []).length} receipts · valid total ${pkr(total)}`} actions={<ExportButtons report="collections" params={{ from: f.from, to: f.to, method: f.method }} />} />
      <Card className="mb-4" bodyClass="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Input label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input label="To" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Select label="Method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} placeholder="All" options={METHODS} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All" options={[['VALID', 'Valid'], ['REVERSED', 'Reversed']]} />
        </div>
      </Card>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} onRowClick={(r) => nav(`/receipts/${r.id}`)} searchPlaceholder="Receipt no, customer, plot, CNIC, cheque no…" />}
    </>
  );
}

export function ReceiptDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data: r, isLoading, error } = useApi(`/payments/${id}`);
  const [rev, setRev] = useState(false);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <PageHeader back={{ to: '/receipts', label: 'Receipts' }} title={<span className="flex items-center gap-3">Receipt {r.receipt_no}<StatusBadge status={r.status} /></span>} subtitle={`${date(r.payment_date)} · ${r.customer_name}`}
        actions={<>
          <button type="button" className="btn-primary" onClick={() => openPdf(`/payments/${r.id}/receipt.pdf`)}><Printer className="h-4 w-4" />{r.print_count ? 'Reprint' : 'Print'}</button>
          <a className="btn-secondary" href={`/api/payments/${r.id}/receipt.pdf?download=1`}><Download className="h-4 w-4" />PDF</a>
          {r.status === 'VALID' && r.booking_status === 'ACTIVE' && can('payment.reverse') && <button type="button" className="btn-ghost text-red-600" onClick={() => setRev(true)}><RotateCcw className="h-4 w-4" />Reverse</button>}
        </>} />
      {r.status === 'REVERSED' && <Notice tone="warn" className="mb-4">Reversed on {dateTime(r.reversed_at)} by {r.reversed_by_name}: {r.reversal_reason}</Notice>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Receipt" className="lg:col-span-2">
          <KV items={[['Amount received', <span key="a" className="text-xl font-bold text-navy-900">{pkr(r.amount)}</span>], ['Payment for', r.purpose === 'CHARGE' ? r.charge_description : 'Plot installment'],
            ['Customer', <Link key="c" to={`/customers/${r.customer_id}`} className="text-navy-700 hover:underline">{r.customer_name}</Link>], ['CNIC', r.customer_cnic],
            ['Plot', `${r.plot_no} · Block ${r.block_name} · ${r.society_name}`], ['Booking', <Link key="b" to={`/bookings/${r.booking_id}`} className="text-navy-700 hover:underline">{r.booking_no}</Link>],
            ['Total plot price', pkr(r.final_price_snapshot)], ['Previous balance', pkr(r.balance_before)], ['Remaining balance', pkr(r.balance_after)],
            ['Method', methodLabel(r.method)], ['Reference', r.reference_no], ['Bank', r.bank_name], ['Notes', r.notes], ['Received by', r.created_by_name], ['Entered at', dateTime(r.created_at)], ['Printed', `${r.print_count} time(s)`]]} />
        </Card>
        <Card title="Applied to installments">
          {r.allocations.length ? r.allocations.map((a, i) => <div key={i} className="flex justify-between border-b border-slate-100 py-1.5 text-sm"><span>{a.label}<div className="text-xs text-slate-500">due {date(a.due_date)}</div></span><b>{pkr(a.amount)}</b></div>)
            : <p className="text-sm text-slate-500">{r.status === 'REVERSED' ? 'Reversed — not applied.' : 'Charge payment (not applied to plot installments).'}</p>}
        </Card>
      </div>
      <ConfirmDialog open={rev} onClose={() => setRev(false)} title={`Reverse receipt ${r.receipt_no}`} danger requireReason reasonLabel="Reason for reversal" confirmText="Reverse payment"
        message={`The payment of ${pkr(r.amount)} will be marked REVERSED (not deleted). Balances are recalculated and a reversal entry is added to the cash book.`}
        onConfirm={async (reason) => { await api.post(`/payments/${r.id}/reverse`, { reason }); toast('Payment reversed'); refresh(); }} />
    </>
  );
}
