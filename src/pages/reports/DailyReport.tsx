import React, { useEffect, useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, Booking, Sale, Customer, Plot, CompanySettings } from '../../types';

const DailyReport: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCollection<Installment>('installments'),
      getCollection<Booking>('bookings'),
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([i, b, s, c, p, comp]) => {
      setInstallments(i);
      setBookings(b);
      setSales(s);
      setCustomers(c);
      setPlots(p);
      if (comp) setCompany(comp);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      toast.error('Failed to load daily report data');
      setLoading(false);
    });
  }, []);

  const dayPayments = useMemo(() => {
    return installments.filter(i => {
      if (i.status !== 'paid' || !i.paymentDate) return false;
      const d = new Date(i.paymentDate);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
      return true;
    });
  }, [installments, dateRange]);

  const dayBookings = useMemo(() => {
    return bookings.filter(b => {
      const d = new Date(b.bookingDate);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
      return true;
    });
  }, [bookings, dateRange]);

  const daySales = useMemo(() => {
    return sales.filter(s => {
      const d = new Date(s.saleDate || s.createdAt);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
      return true;
    });
  }, [sales, dateRange]);

  const totalCollection = useMemo(() => {
    return dayPayments.reduce((s, i) => s + (i.amountPaid || 0), 0);
  }, [dayPayments]);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} - ${p.block}` : '—';
  };

  // Search filtered payments
  const filteredPayments = useMemo(() => {
    if (!search.trim()) return dayPayments;
    const q = search.toLowerCase().trim();
    return dayPayments.filter(i => {
      const cName = customerName(i.customerId).toLowerCase();
      const pInfo = plotInfo(i.plotId).toLowerCase();
      const rec = (i.receiptNumber || '').toLowerCase();
      return cName.includes(q) || pInfo.includes(q) || rec.includes(q);
    });
  }, [dayPayments, search, customers, plots]);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings first'); return; }
    const rows = dayPayments.map(i => [
      i.receiptNumber || '—',
      customerName(i.customerId),
      plotInfo(i.plotId),
      `#${i.installmentNumber}`,
      formatCurrency(i.amountPaid),
      i.paymentMethod || '—'
    ]);
    const html = generateReportHTML(
      company,
      `Daily Report — ${dateRange.start ? formatDate(dateRange.start) : 'All Dates'}`,
      ['Receipt #', 'Customer', 'Plot', 'Inst #', 'Amount', 'Method'],
      rows,
      `Total Collection: ${formatCurrency(totalCollection)}`
    );
    printContent(html, 'Daily-Report');
  };

  const handleExportCsv = () => {
    const headers = ['Receipt #', 'Customer', 'Plot', 'Inst #', 'Amount', 'Method', 'Date'];
    const rows = dayPayments.map(i => [
      i.receiptNumber || '—',
      customerName(i.customerId),
      plotInfo(i.plotId),
      `#${i.installmentNumber}`,
      i.amountPaid || 0,
      i.paymentMethod || '—',
      formatDate(i.paymentDate as Date)
    ]);
    exportRowsToCsv('Daily-Report', headers, rows);
  };

  const kpis = [
    { label: 'Payments Received', value: dayPayments.length, color: 'green' as const, hint: 'Installments collected' },
    { label: 'Total Collection', value: totalCollection, isCurrency: true, color: 'green' as const, hint: 'Cash & Bank inflows' },
    { label: 'New Bookings', value: dayBookings.length, color: 'blue' as const, hint: 'Bookings recorded' },
    { label: 'New Sales', value: daySales.length, color: 'navy' as const, hint: 'Plot allocations' },
  ];

  return (
    <ReportLayout
      reportName="Daily Report"
      title="Daily Operations Report"
      subtitle="Comprehensive daily transaction snapshot of payments, bookings, and sales"
      icon={<Calendar size={18} />}
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
          searchPlaceholder="Search customer, plot, or receipt..."
        />
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Total Filtered Payments: {filteredPayments.length}</span>
          <span className="text-emerald-700">Total Inflow: {formatCurrency(totalCollection)}</span>
        </div>
      }
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
          <tr>
            <th className="py-3 px-3">Receipt #</th>
            <th className="py-3 px-3">Customer</th>
            <th className="py-3 px-3">Plot</th>
            <th className="py-3 px-3">Inst #</th>
            <th className="py-3 px-3">Amount</th>
            <th className="py-3 px-3">Method</th>
          </tr>
        </thead>
        <tbody>
          {filteredPayments.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-slate-400">
                No payments recorded for this period.
              </td>
            </tr>
          ) : (
            filteredPayments.map(i => (
              <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="py-2.5 px-3 font-mono font-medium text-primary">{i.receiptNumber || '—'}</td>
                <td className="py-2.5 px-3 font-semibold text-slate-800">{customerName(i.customerId)}</td>
                <td className="py-2.5 px-3 text-slate-700">{plotInfo(i.plotId)}</td>
                <td className="py-2.5 px-3 text-slate-600">#{i.installmentNumber}</td>
                <td className="py-2.5 px-3 font-bold text-emerald-700">{formatCurrency(i.amountPaid)}</td>
                <td className="py-2.5 px-3 text-slate-600">{i.paymentMethod || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default DailyReport;
