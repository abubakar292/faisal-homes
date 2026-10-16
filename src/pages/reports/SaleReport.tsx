import React, { useEffect, useState } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { BarChart2, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, formatDateInput } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Sale, Customer, Plot, CompanySettings } from '../../types';

const SaleReport: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    Promise.all([
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([s, c, p, comp]) => {
      setSales(s); setCustomers(c); setPlots(p);
      if (comp) setCompany(comp);
    });
  }, []);

  const filtered = sales.filter(s => {
    const d = new Date(s.saleDate);
    if (dateRange.start && d < dateRange.start) return false;
    if (dateRange.end && d > dateRange.end) return false;
    return true;
  });

  const totalSales = filtered.reduce((sum, s) => sum + s.finalPrice, 0);
  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => { const p = plots.find(pl => pl.id === id); return p ? { num: p.plotNumber, block: p.block, size: `${p.size} ${p.sizeUnit}` } : null; };

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(s => {
      const pi = plotInfo(s.plotId);
      return [s.saleNumber, customerName(s.customerId), pi?.num || '—', pi?.size || '—', formatCurrency(s.finalPrice), formatCurrency(s.downPayment), formatCurrency(s.remainingAmount), formatDate(s.saleDate)];
    });
    const html = generateReportHTML(company, 'Sale Report', ['Sale #', 'Customer', 'Plot', 'Size', 'Final Price', 'Down Payment', 'Remaining', 'Date'], rows, `Total Sales: ${formatCurrency(totalSales)} | ${filtered.length} transactions`);
    printContent(html, 'Report');
  };

  const handleExportCSV = () => {
    const headers = ['Sale #', 'Customer', 'Plot', 'Block', 'Size', 'Total Price', 'Discount', 'Final Price', 'Down Payment', 'Remaining', 'Date'];
    const rows = filtered.map(s => {
      const pi = plotInfo(s.plotId);
      return [s.saleNumber, customerName(s.customerId), pi?.num || '', pi?.block || '', pi?.size || '', s.totalPrice, s.discount, s.finalPrice, s.downPayment, s.remainingAmount, formatDate(s.saleDate)];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Sale-Report.csv'; a.click();
  };

  return (
    <div>
      <PageHeader
        title="Sale Report"
        subtitle="All plot sales in date range"
        icon={<BarChart2 size={20} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
            <button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>
            <button onClick={handleExportCSV} className="btn-secondary"><Download size={15} /> CSV</button>
            
          </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          ['Total Sales', filtered.length, 'text-primary'],
          ['Total Amount', formatCurrency(totalSales), 'text-green-600'],
          ['Total Down Payments', formatCurrency(filtered.reduce((s, x) => s + x.downPayment, 0)), 'text-blue-600'],
          ['Total Remaining', formatCurrency(filtered.reduce((s, x) => s + x.remainingAmount, 0)), 'text-red-500'],
        ].map(([label, value, color]) => (
          <div key={label as string} className="card text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>{['Sale #', 'Customer', 'Plot', 'Block', 'Size', 'Final Price', 'Down Payment', 'Remaining', 'Date'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const pi = plotInfo(s.plotId);
              return (
                <tr key={s.id} className="table-row">
                  <td className="table-td font-mono text-xs font-semibold text-primary">{s.saleNumber}</td>
                  <td className="table-td font-medium">{customerName(s.customerId)}</td>
                  <td className="table-td font-mono">{pi?.num || '—'}</td>
                  <td className="table-td">{pi?.block || '—'}</td>
                  <td className="table-td">{pi?.size || '—'}</td>
                  <td className="table-td font-semibold">{formatCurrency(s.finalPrice)}</td>
                  <td className="table-td">{formatCurrency(s.downPayment)}</td>
                  <td className="table-td text-red-500 font-semibold">{formatCurrency(s.remainingAmount)}</td>
                  <td className="table-td">{formatDate(s.saleDate)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">No sales in selected date range</td></tr>}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan={5} className="table-td font-bold">Total ({filtered.length} sales)</td>
                <td className="table-td font-bold text-green-600">{formatCurrency(totalSales)}</td>
                <td className="table-td font-bold">{formatCurrency(filtered.reduce((s, x) => s + x.downPayment, 0))}</td>
                <td className="table-td font-bold text-red-500">{formatCurrency(filtered.reduce((s, x) => s + x.remainingAmount, 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default SaleReport;
