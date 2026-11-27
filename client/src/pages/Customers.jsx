import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Archive, RotateCcw, FileSpreadsheet, FileDown, Wallet, Phone, MessageCircle, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useRefreshAll } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, installmentStatus, methodLabel, num, pkr } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import CustomerForm from '../components/CustomerForm.jsx';
import { Card, Checkbox, ConfirmDialog, ErrorBox, KV, Loading, PageHeader, StatusBadge, Tabs, useToast, StatCard, Empty } from '../components/ui.jsx';

export function CustomersPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [archived, setArchived] = useState(false);
  const { data, isLoading, error } = useApi(`/customers${archived ? '?include_archived=1' : ''}`);
  const cols = [
    { key: 'customer_code', header: 'ID', render: (r) => <span className="font-mono text-xs">{r.customer_code}</span> },
    { key: 'full_name', header: 'Name', render: (r) => <div><div className="font-semibold text-navy-900">{r.full_name}</div>{r.father_name && <div className="text-xs text-slate-500">s/o {r.father_name}</div>}</div> },
    { key: 'cnic', header: 'CNIC', render: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.cnic}</span>, value: (r) => `${r.cnic} ${String(r.cnic).replace(/\D/g, '')}` },
    { key: 'mobile', header: 'Mobile', render: (r) => r.mobile || '—', value: (r) => `${r.mobile || ''} ${String(r.mobile || '').replace(/\D/g, '')}` },
    { key: 'plot_count', header: 'Plots', align: 'right' },
    { key: 'total_price', header: 'Total price', align: 'right', render: (r) => pkr(r.total_price) },
    { key: 'paid', header: 'Paid', align: 'right', render: (r) => pkr(r.paid) },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className={Number(r.overdue) > 0 ? 'font-semibold text-red-700' : ''}>{pkr(r.balance)}</span> },
    { key: 'registration_date', header: 'Registered', render: (r) => date(r.registration_date) },
  ];
  return (
    <>
      <PageHeader title="Customers" subtitle="Search by name, CNIC, mobile number or customer ID"
        actions={can('customer.edit') && <Link to="/customers/new" className="btn-primary"><Plus className="h-4 w-4" />Register customer</Link>} />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : <DataTable columns={cols} rows={data} onRowClick={(r) => nav(`/customers/${r.id}`)} searchPlaceholder="Name, CNIC (with or without dashes), mobile, customer ID…"
        rowClass={(r) => (r.is_archived ? 'opacity-50' : '')} toolbar={<Checkbox label="Show archived" checked={archived} onChange={setArchived} />} empty="No customers yet." />}
    </>
  );
}

export function CustomerEditPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useApi(id ? `/customers/${id}` : null);
  if (id && isLoading) return <Loading />;
  return (
    <div className="max-w-4xl">
      <PageHeader title={id ? `Edit ${data.customer.full_name}` : 'Register new customer'} back={{ to: id ? `/customers/${id}` : '/customers', label: id ? 'Customer profile' : 'Customers' }} />
      <Card>
        <CustomerForm customer={id ? data.customer : null} onSaved={(c) => nav(`/customers/${c.id}`)} />
        <div className="mt-5 flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => nav(-1)}>Cancel</button><button form="customer-form" className="btn-primary">Save customer</button></div>
      </Card>
      {!id && <p className="mt-3 text-sm text-slate-500">After saving you can upload the photograph and CNIC copies on the customer profile.</p>}
    </div>
  );
}

export function CustomerProfilePage() {
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const toast = useToast(); const refresh = useRefreshAll();
  const { data, isLoading, error } = useApi(`/customers/${id}`);
  const [tab, setTab] = useState('plots');
  const [arch, setArch] = useState(false);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { customer: c, totals, bookings, installments, payments, transfers } = data;
  const wa = (c.whatsapp || c.mobile || '').replace(/\D/g, '').replace(/^0/, '92');
  return (
    <>
      <PageHeader back={{ to: '/customers', label: 'Customers' }}
        title={<span className="flex items-center gap-3">{c.full_name}{c.is_archived && <StatusBadge status="ARCHIVED" />}</span>}
        subtitle={`${c.customer_code} · CNIC ${c.cnic}${c.father_name ? ` · s/o ${c.father_name}` : ''}`}
        actions={<>
          {can('report.view') && <><a className="btn-secondary" href={`/api/reports/customer-ledger?customer_id=${c.id}&format=pdf`} target="_blank" rel="noreferrer"><FileDown className="h-4 w-4 text-red-700" />Statement</a>
            <a className="btn-secondary" href={`/api/reports/customer-ledger?customer_id=${c.id}&format=xlsx`}><FileSpreadsheet className="h-4 w-4 text-emerald-700" />Ledger</a></>}
          {can('payment.create') && totals.plots > 0 && <Link to={`/collect?customer_id=${c.id}`} className="btn-gold"><Wallet className="h-4 w-4" />Collect payment</Link>}
          {can('booking.create') && !c.is_archived && <Link to={`/bookings/new?customer_id=${c.id}`} className="btn-secondary"><Plus className="h-4 w-4" />Book plot</Link>}
          {can('customer.edit') && <button type="button" className="btn-secondary" onClick={() => setArch(true)}>{c.is_archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>}
          {can('customer.edit') && <Link to={`/customers/${c.id}/edit`} className="btn-primary"><Pencil className="h-4 w-4" />Edit</Link>}
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Plots owned" value={totals.plots} />
        <StatCard label="Total purchase" value={pkr(totals.total_price)} />
        <StatCard label="Total paid" value={pkr(totals.paid)} tone="green" />
        <StatCard label="Remaining balance" value={pkr(totals.balance)} />
        <StatCard label="Overdue" value={pkr(totals.overdue)} tone={totals.overdue > 0 ? 'red' : 'slate'} sub={totals.charges_due > 0 ? `+ charges ${pkr(totals.charges_due)}` : undefined} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Profile">
          <div className="mb-4 flex items-center gap-4">
            {c.photo_document_id && can('document.view') ? <img src={`/api/documents/${c.photo_document_id}/file`} alt="" className="h-20 w-20 rounded-xl border object-cover" />
              : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100"><User className="h-8 w-8 text-slate-400" /></div>}
            <div className="space-y-1 text-sm">
              {c.mobile && <a href={`tel:${c.mobile}`} className="flex items-center gap-1.5 text-navy-700 hover:underline"><Phone className="h-4 w-4" />{c.mobile}</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-emerald-700 hover:underline"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
            </div>
          </div>
          <KV cols={1} items={[['Address', [c.address, c.city].filter(Boolean).join(', ')], ['Email', c.email], ['Registered', date(c.registration_date)],
            ['Nominee', [c.nominee_name, c.nominee_relation && `(${c.nominee_relation})`, c.nominee_cnic, c.nominee_mobile].filter(Boolean).join(' ')],
            ['Notes', c.notes]]} />
        </Card>
        <div className="lg:col-span-2">
          <Tabs active={tab} onChange={setTab} tabs={[['plots', 'Plots', bookings.length], ['schedule', 'Installments', installments.length], ['payments', 'Payments & receipts', payments.length], ['transfers', 'Transfers', transfers.length], ['docs', 'Documents']]} />
          {tab === 'plots' && (bookings.length ? (
            <div className="space-y-3">
              {bookings.map((b) => (
                <Link key={b.id} to={`/bookings/${b.id}`} className="card block p-4 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><div className="font-semibold text-navy-900">Plot {b.plot_no} · Block {b.block_name} · {b.society_name}</div><div className="text-xs text-slate-500">{b.booking_no} · booked {date(b.booking_date)} · {num(b.size_marla)} Marla</div></div>
                    <div className="flex gap-1">{!b.is_current_owner && <StatusBadge status="TRANSFERRED" label="Transferred out" />}<StatusBadge status={b.status} /></div>
                  </div>
                  {b.is_current_owner && b.status === 'ACTIVE' && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div><div className="text-xs text-slate-500">Price</div><b>{pkr(b.final_price)}</b></div>
                      <div><div className="text-xs text-slate-500">Paid</div><b className="text-emerald-700">{pkr(b.paid)}</b></div>
                      <div><div className="text-xs text-slate-500">Balance</div><b>{pkr(b.balance)}</b></div>
                      <div><div className="text-xs text-slate-500">Next due</div><b>{b.next_due_date ? `${date(b.next_due_date)} · ${pkr(b.next_due_amount)}` : '—'}</b></div>
                    </div>
                  )}
                  {Number(b.overdue_amount) > 0 && b.is_current_owner && b.status === 'ACTIVE' && <div className="mt-2 text-sm font-semibold text-red-700">Overdue: {pkr(b.overdue_amount)} ({b.overdue_count} installment{b.overdue_count > 1 ? 's' : ''})</div>}
                </Link>
              ))}
            </div>
          ) : <Card><Empty text="No plots purchased yet." /></Card>)}
          {tab === 'schedule' && <DataTable searchable={false} pageSize={60} rows={installments} columns={[
            { key: 'due_date', header: 'Due date', render: (r) => date(r.due_date) }, { key: 'plot_no', header: 'Plot' }, { key: 'label', header: 'Installment' },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => pkr(r.amount) }, { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => pkr(r.paid_amount) },
            { key: 'st', header: 'Status', sortable: false, render: (r) => <StatusBadge status={installmentStatus(r)} /> }]} empty="No installments." />}
          {tab === 'payments' && <DataTable rows={payments} onRowClick={(r) => nav(`/receipts/${r.id}`)} columns={[
            { key: 'receipt_no', header: 'Receipt' }, { key: 'payment_date', header: 'Date', render: (r) => date(r.payment_date) }, { key: 'plot_no', header: 'Plot' },
            { key: 'method', header: 'Method', render: (r) => methodLabel(r.method) }, { key: 'amount', header: 'Amount', align: 'right', render: (r) => pkr(r.amount) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} empty="No payments yet." />}
          {tab === 'transfers' && <DataTable searchable={false} rows={transfers} onRowClick={(r) => nav(`/transfers/${r.id}`)} columns={[
            { key: 'transfer_no', header: 'No' }, { key: 'transfer_date', header: 'Date', render: (r) => date(r.transfer_date) }, { key: 'plot_no', header: 'Plot' },
            { key: 'from_name', header: 'From' }, { key: 'to_name', header: 'To' }, { key: 'dir', header: '', sortable: false, render: (r) => <StatusBadge status={r.to_customer_id === c.id ? 'ACTIVE' : 'TRANSFERRED'} label={r.to_customer_id === c.id ? 'Received' : 'Transferred out'} /> }]} empty="No transfers." />}
          {tab === 'docs' && <DocumentsPanel entityType="CUSTOMER" entityId={c.id} types={['PHOTO', 'CNIC_FRONT', 'CNIC_BACK', 'BOOKING_FORM', 'SALE_AGREEMENT', 'LEGAL_DOCUMENT', 'OTHER']} title="Photograph, CNIC & documents" />}
        </div>
      </div>
      <ConfirmDialog open={arch} onClose={() => setArch(false)} title={c.is_archived ? 'Restore customer' : 'Archive customer'}
        message={c.is_archived ? 'Show this customer in lists again?' : 'Archived customers are hidden from lists. Customers with active plots cannot be archived. Nothing is deleted.'}
        onConfirm={async () => { await api.post(`/customers/${c.id}/archive`, { archived: !c.is_archived }); toast('Updated'); refresh(); }} />
    </>
  );
}
