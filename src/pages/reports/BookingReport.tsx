import React, { useEffect, useState } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { BookOpen, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, formatDateInput } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Booking, Customer, Plot, CompanySettings } from '../../types';

const BookingReport: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    Promise.all([
      getCollection<Booking>('bookings'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([b, c, p, comp]) => {
      setBookings(b); setCustomers(c); setPlots(p);
      if (comp) setCompany(comp);
    });
  }, []);

  const filtered = bookings.filter(b => {
    const d = new Date(b.bookingDate);
    if (dateRange.start && d < dateRange.start) return false;
    if (dateRange.end && d > dateRange.end) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    return true;
  });

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => { const p = plots.find(pl => pl.id === id); return p ? `${p.plotNumber}-${p.block}` : '—'; };
  const totalAmount = filtered.reduce((s, b) => s + b.bookingAmount, 0);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(b => [b.receiptNumber, customerName(b.customerId), plotInfo(b.plotId), formatDate(b.bookingDate), formatCurrency(b.bookingAmount), b.paymentMethod, b.status]);
    const html = generateReportHTML(company, 'Booking Report', ['Receipt #', 'Customer', 'Plot', 'Date', 'Amount', 'Method', 'Status'], rows, `Total: ${formatCurrency(totalAmount)} | ${filtered.length} bookings`);
    printContent(html, 'Report');
  };

  return (
    <div>
      <PageHeader
        title="Booking Report"
        icon={<BookOpen size={20} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
            
            
            
            <select className="input-field w-32" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              {['pending','confirmed','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>
            
          </>}
      />

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="card text-center"><p className="text-xl font-bold text-primary">{filtered.length}</p><p className="text-xs text-slate-500 mt-1">Total Bookings</p></div>
        <div className="card text-center"><p className="text-xl font-bold text-green-600">{formatCurrency(totalAmount)}</p><p className="text-xs text-slate-500 mt-1">Total Amount</p></div>
        <div className="card text-center"><p className="text-xl font-bold text-amber-600">{filtered.filter(b => b.status === 'pending').length}</p><p className="text-xs text-slate-500 mt-1">Pending</p></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>{['Receipt #', 'Customer', 'Plot', 'Date', 'Amount', 'Method', 'Status'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id} className="table-row">
                <td className="table-td font-mono text-xs text-primary font-semibold">{b.receiptNumber}</td>
                <td className="table-td font-medium">{customerName(b.customerId)}</td>
                <td className="table-td">{plotInfo(b.plotId)}</td>
                <td className="table-td">{formatDate(b.bookingDate)}</td>
                <td className="table-td font-semibold">{formatCurrency(b.bookingAmount)}</td>
                <td className="table-td">{b.paymentMethod}</td>
                <td className="table-td"><StatusBadge status={b.status} size="sm" /></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="table-td text-center py-10 text-slate-400">No bookings in selected range</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BookingReport;
