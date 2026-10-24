import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import StatusBadge from '../../components/ui/StatusBadge';
import { getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Booking, Customer, Plot, CompanySettings } from '../../types';
import {
  isDateInRangeKarachi,
  startOfDayKarachi,
  endOfDayKarachi,
} from '../../domain/metrics';

const BookingReport: React.FC = () => {
  const { data: bookings, loading: loadingBookings } = useLiveCollection<Booking>('bookings');
  const { data: customers, loading: loadingCust } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: loadingPlots } = useLiveCollection<Plot>('plots');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const loading = loadingBookings || loadingCust || loadingPlots;

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
    return bookings.filter(b => {
      const d = new Date(b.bookingDate || b.createdAt);
      if (dateRange.start && dateRange.end) {
        if (!isDateInRangeKarachi(d, dateRange.start, dateRange.end)) return false;
      } else if (dateRange.start) {
        if (d.getTime() < startOfDayKarachi(dateRange.start).getTime()) return false;
      } else if (dateRange.end) {
        if (d.getTime() > endOfDayKarachi(dateRange.end).getTime()) return false;
      }
      if (filterStatus && b.status !== filterStatus) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const cName = customerName(b.customerId).toLowerCase();
        const pInfo = plotInfo(b.plotId).toLowerCase();
        const rec = (b.receiptNumber || '').toLowerCase();
        if (!cName.includes(q) && !pInfo.includes(q) && !rec.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, dateRange, filterStatus, search, customers, plots]);

  const totalAmount = useMemo(() => filtered.reduce((s, b) => s + (b.bookingAmount || 0), 0), [filtered]);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(b => [
      b.receiptNumber,
      customerName(b.customerId),
      plotInfo(b.plotId),
      formatDate(b.bookingDate),
      formatCurrency(b.bookingAmount),
      b.paymentMethod,
      b.status
    ]);
    const html = generateReportHTML(
      company,
      'Booking Report',
      ['Receipt #', 'Customer', 'Plot', 'Date', 'Amount', 'Method', 'Status'],
      rows,
      `Total: ${formatCurrency(totalAmount)} | ${filtered.length} bookings`
    );
    printContent(html, 'Booking Report');
  };

  const handleExportCsv = () => {
    const headers = ['Receipt #', 'Customer', 'Plot', 'Date', 'Amount', 'Method', 'Status'];
    const rows = filtered.map(b => [
      b.receiptNumber,
      customerName(b.customerId),
      plotInfo(b.plotId),
      formatDate(b.bookingDate),
      b.bookingAmount || 0,
      b.paymentMethod,
      b.status
    ]);
    exportRowsToCsv('Booking-Report', headers, rows);
  };

  const kpis = [
    { label: 'Total Bookings', value: filtered.length, color: 'navy' as const, hint: 'Selected period' },
    { label: 'Advance Collected', value: totalAmount, isCurrency: true, color: 'green' as const, hint: 'Total booking payments' },
    { label: 'Confirmed', value: filtered.filter(b => b.status === 'confirmed').length, color: 'blue' as const, hint: 'Ready for sale' },
    { label: 'Converted to Sale', value: filtered.filter(b => b.status === 'converted').length, color: 'green' as const, hint: 'Converted bookings' },
  ];

  return (
    <ReportLayout
      reportName="Booking Report"
      title="Plot Bookings Report"
      subtitle="Detailed overview of advance bookings, payments, and conversion status"
      icon={<BookOpen size={18} />}
      onPrint={handlePrint}
      onExportCsv={handleExportCsv}
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
              <option value="confirmed">Confirmed</option>
              <option value="converted">Converted</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          }
        />
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Total Records: {filtered.length} bookings</span>
          <span className="text-emerald-700">Total Booking Volume: {formatCurrency(totalAmount)}</span>
        </div>
      }
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
          <tr>
            <th className="py-3 px-3">Receipt #</th>
            <th className="py-3 px-3">Customer</th>
            <th className="py-3 px-3">Plot</th>
            <th className="py-3 px-3">Date</th>
            <th className="py-3 px-3">Amount</th>
            <th className="py-3 px-3">Method</th>
            <th className="py-3 px-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-12 text-center text-slate-400">
                No bookings matched your filter criteria.
              </td>
            </tr>
          ) : (
            filtered.map(b => (
              <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="py-2.5 px-3 font-mono font-bold text-primary">{b.receiptNumber}</td>
                <td className="py-2.5 px-3 font-semibold text-slate-800">{customerName(b.customerId)}</td>
                <td className="py-2.5 px-3 text-slate-700">{plotInfo(b.plotId)}</td>
                <td className="py-2.5 px-3 text-slate-500">{formatDate(b.bookingDate || b.createdAt)}</td>
                <td className="py-2.5 px-3 font-bold text-emerald-700">{formatCurrency(b.bookingAmount)}</td>
                <td className="py-2.5 px-3 text-slate-600">{b.paymentMethod}</td>
                <td className="py-2.5 px-3"><StatusBadge status={b.status} size="sm" /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default BookingReport;
