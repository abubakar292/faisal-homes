import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { qs } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { date, pkr } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import { ErrorBox, Loading, PageHeader, Select, Tabs, Notice } from '../components/ui.jsx';

function waLink(mobile, text) {
  const n = String(mobile || '').replace(/\D/g, '').replace(/^0/, '92');
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export default function InstallmentsPage() {
  const { can, settings } = useAuth();
  const [tab, setTab] = useState('overdue');
  const [days, setDays] = useState('30');
  const company = settings.company?.name || 'FAISAL HOMES';
  const canReports = can('report.view');
  const od = useApi(canReports && tab === 'overdue' ? '/reports/overdue' : null);
  const up = useApi(canReports && tab === 'upcoming' ? `/reports/upcoming${qs({ days })}` : null);
  if (!canReports) return <Notice>Overdue and upcoming installment lists are available to Admin, Accountant and Viewer roles. Use Bookings → Overdue only.</Notice>;
  const odCols = [
    { key: 'customer', header: 'Customer', render: (r) => <div><Link to={`/bookings/${r.booking_id}`} className="font-semibold text-navy-800 hover:underline">{r.customer}</Link><div className="text-xs text-slate-500">{r.mobile}</div></div> },
    { key: 'plot_no', header: 'Plot', render: (r) => `${r.plot_no} (${r.block})` },
    { key: 'overdue_count', header: 'Installments', align: 'right' },
    { key: 'oldest_due', header: 'Oldest due', render: (r) => date(r.oldest_due) },
    { key: 'days_overdue', header: 'Days late', align: 'right', render: (r) => <span className={r.days_overdue > 60 ? 'font-bold text-red-700' : r.days_overdue > 30 ? 'font-semibold text-amber-700' : ''}>{r.days_overdue}</span> },
    { key: 'overdue_amount', header: 'Overdue amount', align: 'right', render: (r) => <b className="text-red-700">{pkr(r.overdue_amount)}</b> },
    { key: 'balance', header: 'Total balance', align: 'right', render: (r) => pkr(r.balance) },
    ...(settings.late_fee?.enabled ? [{ key: 'suggested_late_fee', header: 'Late fee (suggested)', align: 'right', render: (r) => pkr(r.suggested_late_fee) }] : []),
    { key: 'wa', header: '', sortable: false, render: (r) => { const l = waLink(r.whatsapp || r.mobile, `Assalam-o-Alaikum ${r.customer}, this is a reminder from ${company} that ${pkr(r.overdue_amount)} is overdue for Plot ${r.plot_no} (Block ${r.block}). Kindly arrange payment at the earliest. Thank you.`); return l && <a href={l} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-emerald-700" onClick={(e) => e.stopPropagation()}><MessageCircle className="h-4 w-4" />Remind</a>; } },
  ];
  const upCols = [
    { key: 'due_date', header: 'Due date', render: (r) => date(r.due_date) },
    { key: 'customer', header: 'Customer', render: (r) => <div className="font-medium">{r.customer}<div className="text-xs text-slate-500">{r.mobile}</div></div> },
    { key: 'plot_no', header: 'Plot', render: (r) => `${r.plot_no} (${r.block})` },
    { key: 'label', header: 'Installment' },
    { key: 'due', header: 'Amount due', align: 'right', render: (r) => <b>{pkr(r.due)}</b> },
    { key: 'wa', header: '', sortable: false, render: (r) => { const l = waLink(r.mobile, `Assalam-o-Alaikum ${r.customer}, a reminder from ${company}: your installment of ${pkr(r.due)} for Plot ${r.plot_no} is due on ${date(r.due_date)}. Thank you.`); return l && <a href={l} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-emerald-700"><MessageCircle className="h-4 w-4" />Remind</a>; } },
  ];
  const cur = tab === 'overdue' ? od : up;
  return (
    <>
      <PageHeader title="Installments" subtitle={tab === 'overdue' ? 'Customers with unpaid installments past their due date' : 'Installments falling due soon'}
        actions={<ExportButtons report={tab === 'overdue' ? 'overdue' : 'upcoming'} params={tab === 'upcoming' ? { days } : {}} />} />
      <Tabs active={tab} onChange={setTab} tabs={[['overdue', 'Overdue customers'], ['upcoming', 'Upcoming installments']]} />
      {tab === 'upcoming' && <div className="mb-3 max-w-xs"><Select label="Period" value={days} onChange={(e) => setDays(e.target.value)} options={[['7', 'Next 7 days'], ['15', 'Next 15 days'], ['30', 'Next 30 days'], ['60', 'Next 60 days'], ['90', 'Next 90 days']]} /></div>}
      <ErrorBox error={cur.error} />
      {cur.isLoading ? <Loading /> : cur.data && (
        <>
          <div className="mb-3 text-sm text-slate-600">{cur.data.rows.length} record(s) · Total {pkr(tab === 'overdue' ? cur.data.totals.overdue_amount : cur.data.totals.due)}</div>
          <DataTable columns={tab === 'overdue' ? odCols : upCols} rows={cur.data.rows.map((r, i) => ({ id: i, ...r }))} pageSize={50} empty={tab === 'overdue' ? 'No overdue installments. Excellent!' : 'Nothing due in this period.'} />
          {tab === 'overdue' && <p className="mt-2 text-xs text-slate-500">Late fees are never charged automatically. If enabled in Settings, an admin can post a late fee from the booking's schedule.</p>}
        </>
      )}
    </>
  );
}
