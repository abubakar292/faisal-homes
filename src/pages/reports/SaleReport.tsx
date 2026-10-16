import React, { useEffect, useState, useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Sale, Customer, Plot, CompanySettings } from '../../types';

const SaleReport: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([s, c, p, comp]) => {
      setSales(s);
      setCustomers(c);
      setPlots(p);
      if (comp) setCompany(comp);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      toast.error('Failed to load sales report data');
      setLoading(false);
    });
  }, []);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? { num: p.plotNumber, block: p.block, size: `${p.size} ${p.sizeUnit}` } : null;
  };

  const filtered = useMemo(() => {
    return sales.filter(s => {
      const d = new Date(s.saleDate || s.createdAt);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const cName = customerName(s.customerId).toLowerCase();
        const pi = plotInfo(s.plotId);
        const pNum = (pi?.num || '').toLowerCase();
        const pBlock = (pi?.block || '').toLowerCase();
        const sNum = (s.saleNumber || '').toLowerCase();
        if (!cName.includes(q) && !pNum.includes(q) && !pBlock.includes(q) && !sNum.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [sales, dateRange, search, customers, plots]);

  const totalSales = useMemo(() => filtered.reduce((sum, s) => sum + (s.finalPrice || 0), 0), [filtered]);
  const totalDownPayment = useMemo(() => filtered.reduce((sum, s) => sum + (s.downPayment || 0), 0), [filtered]);
  const totalRemaining = useMemo(() => filtered.reduce((sum, s) => sum + (s.remainingAmount || 0), 0), [filtered]);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(s => {
      const pi = plotInfo(s.plotId);
      return [
        s.saleNumber,
        customerName(s.customerId),
        pi?.num || '—',
        pi?.size || '—',
        formatCurrency(s.finalPrice),
        formatCurrency(s.downPayment),
        formatCurrency(s.remainingAmount),
        formatDate(s.saleDate || s.createdAt)
      ];
    });
    const html = generateReportHTML(
      company,
      'Sale Report',
      ['Sale #', 'Customer', 'Plot', 'Size', 'Final Price', 'Down Payment', 'Remaining', 'Date'],
      rows,
      `Total Sales: ${formatCurrency(totalSales)} | ${filtered.length} transactions`
    );
    printContent(html, 'Sale-Report');
  };

  const handleExportCSV = () => {
    const headers = ['Sale #', 'Customer', 'Plot', 'Block', 'Size', 'Total Price', 'Discount', 'Final Price', 'Down Payment', 'Remaining', 'Date'];
    const rows = filtered.map(s => {
      const pi = plotInfo(s.plotId);
      return [
        s.saleNumber,
        customerName(s.customerId),
        pi?.num || '',
        pi?.block || '',
        pi?.size || '',
        s.totalPrice || s.finalPrice,
        s.discount || 0,
        s.finalPrice,
        s.downPayment,
        s.remainingAmount,
        formatDate(s.saleDate || s.createdAt)
      ];
    });
    exportRowsToCsv('Sale-Report', headers, rows);
  };

  const kpis = [
    { label: 'Total Sales', value: filtered.length, color: 'navy' as const, hint: 'Transactions count' },
    { label: 'Total Revenue', value: totalSales, isCurrency: true, color: 'green' as const, hint: 'Gross sales volume' },
    { label: 'Down Payments', value: totalDownPayment, isCurrency: true, color: 'blue' as const, hint: 'Committed down payment' },
    { label: 'Total Remaining', value: totalRemaining, isCurrency: true, color: 'red' as const, hint: 'Receivable installment balance' },
  ];

  return (
    <ReportLayout
      reportName="Sale Report"
      title="Plot Sales Report"
      subtitle="Detailed breakdown of all active and completed plot sales"
      icon={<BarChart2 size={18} />}
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
          searchPlaceholder="Search sale #, customer, or plot..."
        />
      }
      footerContent={
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 font-bold">
          <span>Total Transactions: {filtered.length} sales</span>
          <div className="flex gap-4">
            <span className="text-emerald-700">Total: {formatCurrency(totalSales)}</span>
            <span className="text-rose-700">Remaining: {formatCurrency(totalRemaining)}</span>
          </div>
        </div>
      }
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
          <tr>
            <th className="py-3 px-3">Sale #</th>
            <th className="py-3 px-3">Customer</th>
            <th className="py-3 px-3">Plot</th>
            <th className="py-3 px-3">Block</th>
            <th className="py-3 px-3">Size</th>
            <th className="py-3 px-3">Final Price</th>
            <th className="py-3 px-3">Down Payment</th>
            <th className="py-3 px-3">Remaining</th>
            <th className="py-3 px-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-12 text-center text-slate-400">
                No sales found in the selected range.
              </td>
            </tr>
          ) : (
            filtered.map(s => {
              const pi = plotInfo(s.plotId);
              return (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-bold text-primary">{s.saleNumber}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">{customerName(s.customerId)}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-700">{pi?.num || '—'}</td>
                  <td className="py-2.5 px-3 text-slate-600">{pi?.block || '—'}</td>
                  <td className="py-2.5 px-3 text-slate-600">{pi?.size || '—'}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{formatCurrency(s.finalPrice)}</td>
                  <td className="py-2.5 px-3 text-slate-700">{formatCurrency(s.downPayment)}</td>
                  <td className="py-2.5 px-3 font-bold text-rose-600">{formatCurrency(s.remainingAmount)}</td>
                  <td className="py-2.5 px-3 text-slate-500">{formatDate(s.saleDate || s.createdAt)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default SaleReport;
