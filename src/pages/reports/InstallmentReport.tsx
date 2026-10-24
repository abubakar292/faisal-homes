import React, { useEffect, useState, useMemo } from 'react';
import { Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import StatusBadge from '../../components/ui/StatusBadge';
import { getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, Customer, Plot, CompanySettings } from '../../types';
import {
  isDateInRangeKarachi,
  startOfDayKarachi,
  endOfDayKarachi,
  getInstallmentOutstanding,
} from '../../domain/metrics';

const InstallmentReport: React.FC = () => {
  const { data: installments, loading: loadingInst } = useLiveCollection<Installment>('installments');
  const { data: customers, loading: loadingCust } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: loadingPlots } = useLiveCollection<Plot>('plots');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('paid');
  const loading = loadingInst || loadingCust || loadingPlots;

  useEffect(() => {
    let active = true;
    getDocument<CompanySettings>('settings', 'company')
      .then(comp => {
        if (active && comp) setCompany(comp);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} - ${p.block}` : '-';
  };

  const filtered = useMemo(() => {
    return installments.filter(i => {
      if (filterStatus && i.status !== filterStatus) return false;
      const d = i.paymentDate ? new Date(i.paymentDate) : new Date(i.dueDate);
      if (dateRange.start && dateRange.end) {
        if (!isDateInRangeKarachi(d, dateRange.start, dateRange.end)) return false;
      } else if (dateRange.start) {
        if (d.getTime() < startOfDayKarachi(dateRange.start).getTime()) return false;
      } else if (dateRange.end) {
        if (d.getTime() > endOfDayKarachi(dateRange.end).getTime()) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const cName = customerName(i.customerId).toLowerCase();
        const pInfo = plotInfo(i.plotId).toLowerCase();
        const rec = (i.receiptNumber || '').toLowerCase();
        if (!cName.includes(q) && !pInfo.includes(q) && !rec.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [installments, filterStatus, dateRange, search, customers, plots]);

  const totalPaid = useMemo(() => {
    return filtered.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.amountPaid) || 0), 0);
  }, [filtered]);

  const totalScheduled = useMemo(() => {
    return filtered.reduce((s, i) => s + (Number(i.amountDue) || 0), 0);
  }, [filtered]);

  const totalOutstanding = useMemo(() => {
    return filtered.reduce((s, i) => s + getInstallmentOutstanding(i), 0);
  }, [filtered]);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(i => [
      i.receiptNumber || '—',
      customerName(i.customerId),
      plotInfo(i.plotId),
      `#${i.installmentNumber}`,
      formatDate(i.dueDate),
      formatCurrency(i.amountDue),
      formatCurrency(i.amountPaid),
      i.paymentMethod || '—',
      i.status
    ]);
    const html = generateReportHTML(
      company,
      'Installment Report',
      ['Receipt #', 'Customer', 'Plot', '#', 'Due Date', 'Due', 'Paid', 'Method', 'Status'],
      rows,
      `Total Paid: ${formatCurrency(totalPaid)} | Records: ${filtered.length}`
    );
    printContent(html, 'Installment Report');
  };

  const handleExportCSV = () => {
    const headers = ['Receipt #', 'Customer', 'Plot', 'Inst #', 'Due Date', 'Amount Due', 'Amount Paid', 'Method', 'Status', 'Payment Date'];
    const rows = filtered.map(i => [
      i.receiptNumber || '',
      customerName(i.customerId),
      plotInfo(i.plotId),
      i.installmentNumber,
      formatDate(i.dueDate),
      i.amountDue,
      i.amountPaid || 0,
      i.paymentMethod || '',
      i.status,
      i.paymentDate ? formatDate(i.paymentDate) : ''
    ]);
    exportRowsToCsv('Installment-Report', headers, rows);
  };

  const kpis = [
    { label: 'Filtered Receipts', value: filtered.length, color: 'navy' as const, hint: 'Matching records' },
    { label: 'Collected Amount', value: totalPaid, isCurrency: true, color: 'green' as const, hint: 'Paid installments' },
    { label: 'Total Scheduled', value: totalScheduled, isCurrency: true, color: 'blue' as const, hint: 'Gross due volume' },
    { label: 'Remaining Due', value: totalOutstanding, isCurrency: true, color: 'amber' as const, hint: 'Outstanding to collect' },
  ];

  return (
    <ReportLayout
      reportName="Installment Report"
      title="Installment Receipts Report"
      subtitle="Complete ledger of scheduled, collected, and pending installment receipts"
      icon={<Receipt size={18} />}
      onPrint={handlePrint}
      onExportCsv={handleExportCSV}
      kpis={kpis}
      loading={loading}
      filterCard={
        <ReportFilters
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search receipt #, customer, or plot..."
          extraFilters={
            <select
              className="input-field w-36 text-xs"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          }
        />
      }
      footerContent={
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 font-bold">
          <span>Total Records: {filtered.length} installments</span>
          <div className="flex gap-4">
            <span className="text-emerald-700">Collected: {formatCurrency(totalPaid)}</span>
            <span className="text-amber-700">Outstanding: {formatCurrency(totalOutstanding)}</span>
          </div>
        </div>
      }
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
          <tr>
            <th className="py-3 px-3">Receipt #</th>
            <th className="py-3 px-3">Customer</th>
            <th className="py-3 px-3">Plot</th>
            <th className="py-3 px-3">#</th>
            <th className="py-3 px-3">Due Date</th>
            <th className="py-3 px-3">Amount Due</th>
            <th className="py-3 px-3">Paid</th>
            <th className="py-3 px-3">Method</th>
            <th className="py-3 px-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-12 text-center text-slate-400">
                No installment records found matching criteria.
              </td>
            </tr>
          ) : (
            filtered.map(i => (
              <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="py-2.5 px-3 font-mono font-medium text-primary">{i.receiptNumber || '—'}</td>
                <td className="py-2.5 px-3 font-semibold text-slate-800">{customerName(i.customerId)}</td>
                <td className="py-2.5 px-3 text-slate-700">{plotInfo(i.plotId)}</td>
                <td className="py-2.5 px-3 text-slate-600">#{i.installmentNumber}</td>
                <td className="py-2.5 px-3 text-slate-500">{formatDate(i.dueDate)}</td>
                <td className="py-2.5 px-3 text-slate-800 font-medium">{formatCurrency(i.amountDue)}</td>
                <td className="py-2.5 px-3 font-bold text-emerald-700">{formatCurrency(i.amountPaid)}</td>
                <td className="py-2.5 px-3 text-slate-600">{i.paymentMethod || '—'}</td>
                <td className="py-2.5 px-3"><StatusBadge status={i.status} size="sm" /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default InstallmentReport;
