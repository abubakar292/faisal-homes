import React, { useEffect, useState } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { Receipt, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, formatDateInput } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, Customer, Plot, CompanySettings } from '../../types';

const InstallmentReport: React.FC = () => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('paid');

  useEffect(() => {
    Promise.all([
      getCollection<Installment>('installments'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([i, c, p, comp]) => {
      setInstallments(i); setCustomers(c); setPlots(p);
      if (comp) setCompany(comp);
    });
  }, []);

  const filtered = installments.filter(i => {
    if (filterStatus && i.status !== filterStatus) return false;
    const d = i.paymentDate ? new Date(i.paymentDate) : new Date(i.dueDate);
    if (dateRange.start && d < dateRange.start) return false;
    if (dateRange.end && d > dateRange.end) return false;
    return true;
  });

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => { const p = plots.find(pl => pl.id === id); return p ? `${p.plotNumber}-${p.block}` : '—'; };
  const totalPaid = filtered.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountPaid, 0);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = filtered.map(i => [i.receiptNumber || '—', customerName(i.customerId), plotInfo(i.plotId), `#${i.installmentNumber}`, formatDate(i.dueDate), formatCurrency(i.amountDue), formatCurrency(i.amountPaid), i.paymentMethod || '—', i.status]);
    const html = generateReportHTML(company, 'Installment Report', ['Receipt #', 'Customer', 'Plot', '#', 'Due Date', 'Due', 'Paid', 'Method', 'Status'], rows, `Total Paid: ${formatCurrency(totalPaid)}`);
    printContent(html, 'Report');
  };

  const handleExportCSV = () => {
    const headers = ['Receipt #', 'Customer', 'Plot', 'Inst #', 'Due Date', 'Amount Due', 'Amount Paid', 'Method', 'Status', 'Payment Date'];
    const rows = filtered.map(i => [i.receiptNumber || '', customerName(i.customerId), plotInfo(i.plotId), i.installmentNumber, formatDate(i.dueDate), i.amountDue, i.amountPaid, i.paymentMethod || '', i.status, formatDate(i.paymentDate)]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Installment-Report.csv'; a.click();
  };

  return (
    <div>
      <PageHeader
        title="Installment Report"
        icon={<Receipt size={20} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
            
            
            
            <select className="input-field w-32" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              {['paid','pending','overdue'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>
            <button onClick={handleExportCSV} className="btn-secondary"><Download size={15} /> CSV</button>
            
          </>}
      />

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="card text-center"><p className="text-xl font-bold text-primary">{filtered.length}</p><p className="text-xs text-slate-500 mt-1">Records</p></div>
        <div className="card text-center"><p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p><p className="text-xs text-slate-500 mt-1">Total Paid</p></div>
        
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>{['Receipt #', 'Customer', 'Plot', '#', 'Due Date', 'Amount Due', 'Paid', 'Method', 'Status'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id} className="table-row">
                <td className="table-td font-mono text-xs text-primary">{i.receiptNumber || '—'}</td>
                <td className="table-td font-medium">{customerName(i.customerId)}</td>
                <td className="table-td">{plotInfo(i.plotId)}</td>
                <td className="table-td">#{i.installmentNumber}</td>
                <td className="table-td">{formatDate(i.dueDate)}</td>
                <td className="table-td">{formatCurrency(i.amountDue)}</td>
                <td className="table-td font-semibold text-green-600">{formatCurrency(i.amountPaid)}</td>
                
                <td className="table-td">{i.paymentMethod || '—'}</td>
                <td className="table-td"><StatusBadge status={i.status} size="sm" /></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InstallmentReport;
