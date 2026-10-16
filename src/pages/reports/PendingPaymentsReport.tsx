import React, { useEffect, useState, useMemo } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { AlertCircle, Download, Printer, MessageCircle, ChevronRight, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, daysOverdue, getOutstanding, getInstallmentStatus, getWhatsAppUrl } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import { buildCustomerLedgers, CustomerLedgerSummary } from '../../utils/ledger';
import type { Installment, Customer, Plot, CompanySettings, Sale, DownPaymentTransaction } from '../../types';

type ViewMode = 'installments' | 'customers';

const PendingPaymentsReport: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('installments');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dpTx, setDpTx] = useState<DownPaymentTransaction[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);

  // Sorting/Pagination for Customers view
  const [sortField, setSortField] = useState('highest_overdue');
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;

  const load = async () => {
    const [insts, cust, plts, s, dp, comp] = await Promise.all([
      getCollection<Installment>('installments'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getCollection<Sale>('sales'),
      getCollection<DownPaymentTransaction>('downPaymentTransactions'),
      getDocument<CompanySettings>('settings', 'company'),
    ]);
    
    // We only keep installments whose sale is NOT cancelled and that have an outstanding amount
    const activeSales = new Set(s.filter(sale => sale.status !== 'cancelled').map(sale => sale.id));
    const activeInsts = insts.filter(i => activeSales.has(i.saleId) && getOutstanding(i) > 0);
    
    setInstallments(activeInsts);
    setCustomers(cust);
    setPlots(plts);
    setSales(s);
    setDpTx(dp);
    if (comp) setCompany(comp);
  };

  useEffect(() => { load(); }, []);

  // ─── INSTALLMENTS VIEW LOGIC ───
  const sortedInsts = useMemo(() => {
    return [...installments].sort((a, b) => {
      const daysA = daysOverdue(a);
      const daysB = daysOverdue(b);
      return daysB - daysA;
    });
  }, [installments]);

  const customerInfo = (id: string) => customers.find(c => c.id === id);
  const plotInfo = (id: string) => { const p = plots.find(pl => pl.id === id); return p ? `${p.plotNumber}-${p.block}` : '—'; };

  const handleExportPDF = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = sortedInsts.map(i => {
      const c = customerInfo(i.customerId);
      const days = daysOverdue(i);
      return [c?.name || '—', plotInfo(i.plotId), `#${i.installmentNumber}`, formatDate(i.dueDate), formatCurrency(getOutstanding(i)), days > 0 ? `${days} days` : 'Upcoming', getInstallmentStatus(i)];
    });
    const html = generateReportHTML(company, 'Pending Payments Report', ['Customer', 'Plot', '#', 'Due Date', 'Amount Due', 'Overdue', 'Status'], rows, '');
    printContent(html, 'Report');
  };

  const buildWaMsg = (inst: Installment, customer: Customer) => {
    return `Assalam-o-Alaikum ${customer.name},\n\nAapki plot ${plotInfo(inst.plotId)} ki qist baqi hai:\nAmount: Rs. ${formatCurrency(getOutstanding(inst))}\nDue Date: ${formatDate(inst.dueDate)}\n\nMeherbani farma ke jald payment karein.\n\n${company?.name || 'Faisal Homes'}\n${company?.phone || ''}`;
  };

  // ─── CUSTOMERS VIEW LOGIC ───
  const customerLedgers = useMemo(() => {
    if (viewMode !== 'customers' || customers.length === 0) return [];
    return buildCustomerLedgers(customers, sales, plots, installments, dpTx);
  }, [viewMode, customers, sales, plots, installments, dpTx]);

  const filteredCustomers = useMemo(() => {
    let result = customerLedgers;
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(l => 
        l.customerName.toLowerCase().includes(q) ||
        l.fatherName.toLowerCase().includes(q) ||
        l.cnic.includes(q) ||
        l.phone.includes(q) ||
        l.customerId.toLowerCase().includes(q) ||
        l.plots.some(p => p.toLowerCase().includes(q))
      );
    }
    
    result = [...result].sort((a, b) => {
      if (sortField === 'highest_overdue') return b.overdueAmount - a.overdueAmount;
      if (sortField === 'most_days') return b.maxDaysOverdue - a.maxDaysOverdue;
      if (sortField === 'highest_outstanding') return b.totalOutstanding - a.totalOutstanding;
      if (sortField === 'name') return a.customerName.localeCompare(b.customerName);
      return 0;
    });
    
    return result;
  }, [customerLedgers, search, sortField]);

  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, page]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const getSeverityBadge = (sev: string) => {
    if (sev === 'CRITICAL') return <span className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded">CRITICAL</span>;
    if (sev === 'OVERDUE') return <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded">OVERDUE</span>;
    if (sev === 'UPCOMING') return <span className="px-2 py-1 bg-amber-500 text-white text-[10px] font-bold rounded">UPCOMING</span>;
    return <span className="px-2 py-1 bg-green-500 text-white text-[10px] font-bold rounded">CLEAR</span>;
  };

  return (
    <div>
      <PageHeader
        title="Pending Payments Report"
        subtitle={`${installments.length} pending installments — ${new Set(installments.map(i => i.customerId)).size} customers`}
        icon={<AlertCircle size={20} />}
      />
      
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('installments')}
            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'installments' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Installments
          </button>
          <button 
            onClick={() => setViewMode('customers')}
            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'customers' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Customers
          </button>
        </div>
        
        {viewMode === 'installments' && (
          <div className="flex items-center gap-2">
            <button onClick={handleExportPDF} className="btn-secondary"><Printer size={15} /> Print</button>
          </div>
        )}
        
        {viewMode === 'customers' && (
          <select value={sortField} onChange={e => setSortField(e.target.value)} className="input-field text-sm w-48">
            <option value="highest_overdue">Highest Overdue</option>
            <option value="most_days">Most Days Overdue</option>
            <option value="highest_outstanding">Highest Outstanding</option>
            <option value="name">Name A-Z</option>
          </select>
        )}
      </div>

      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />

      {viewMode === 'installments' ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>{['Customer', 'Phone', 'Plot', 'Inst #', 'Due Date', 'Amount Due', 'Days Overdue', 'Status', 'Remind'].map(h => <th key={h} className="table-th text-xs">{h}</th>)}</tr>
            </thead>
            <tbody>
              {sortedInsts.map(i => {
                const c = customerInfo(i.customerId);
                const dOverdue = daysOverdue(i);
                const stat = getInstallmentStatus(i);
                const out = getOutstanding(i);
                return (
                  <tr key={i.id} className={`table-row ${stat === 'overdue' ? 'bg-red-50/50' : ''}`}>
                    <td className="table-td font-medium">
                      {c ? (
                        <button onClick={() => navigate(`/reports/pending/customer/${c.id}`)} className="text-primary hover:underline font-bold">
                          {c.name}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="table-td text-xs">{c?.phone || '—'}</td>
                    <td className="table-td">{plotInfo(i.plotId)}</td>
                    <td className="table-td">#{i.installmentNumber}</td>
                    <td className="table-td">{formatDate(i.dueDate)}</td>
                    <td className="table-td font-semibold">
                      {formatCurrency(out)}
                      {stat === 'partial' && <span className="block text-[10px] text-slate-500 font-normal">(paid {formatCurrency(i.amountPaid || 0)})</span>}
                    </td>
                    <td className="table-td font-semibold text-red-500">{dOverdue > 0 ? `${dOverdue} days` : '—'}</td>
                    <td className="table-td"><StatusBadge status={stat} size="sm" /></td>
                    <td className="table-td">
                      {c?.whatsapp && (
                        <button
                          onClick={() => window.open(getWhatsAppUrl(c.whatsapp, buildWaMsg(i, c)), '_blank')}
                          className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 inline-flex"
                          title="Send WhatsApp reminder"
                        >
                          <MessageCircle size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedInsts.length === 0 && <tr><td colSpan={9} className="table-td text-center py-10 text-slate-400">No pending payments</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th text-xs">Customer</th>
                <th className="table-th text-xs">Phone</th>
                <th className="table-th text-xs">Plots</th>
                <th className="table-th text-xs text-right">Overdue</th>
                <th className="table-th text-xs text-right">Pending</th>
                <th className="table-th text-xs text-right">Total Outst.</th>
                <th className="table-th text-xs text-right">Oldest</th>
                <th className="table-th text-xs">Next Due</th>
                <th className="table-th text-xs">Severity</th>
                <th className="table-th w-8"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400">No customers found</td></tr>
              ) : (
                paginatedCustomers.map(l => (
                  <tr 
                    key={l.customerId} 
                    onClick={() => navigate(`/reports/pending/customer/${l.customerId}`)}
                    className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                          {l.customerName.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{l.customerName}</p>
                          <p className="text-[10px] text-slate-500">S/O {l.fatherName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-td text-xs text-slate-600">{l.phone}</td>
                    <td className="table-td text-xs font-medium">{l.plots.join(', ')}</td>
                    <td className="table-td text-right">
                      {l.overdueCount > 0 ? (
                        <>
                          <p className="font-bold text-red-600">{formatCurrency(l.overdueAmount)}</p>
                          <p className="text-[10px] text-red-500 bg-red-50 inline-block px-1 rounded">{l.overdueCount} inst</p>
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-td text-right">
                      {l.pendingCount > 0 ? (
                        <>
                          <p className="font-bold text-amber-600">{formatCurrency(l.pendingAmount)}</p>
                          <p className="text-[10px] text-amber-600 bg-amber-50 inline-block px-1 rounded">{l.pendingCount} inst</p>
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-td text-right font-black text-primary">{formatCurrency(l.totalOutstanding)}</td>
                    <td className="table-td text-right text-xs">
                      {l.maxDaysOverdue > 0 ? <span className="text-red-500 font-bold">{l.maxDaysOverdue}d</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-td text-xs">
                      {l.nextDue ? (
                        <>
                          <p className="font-medium text-slate-700">{formatDate(l.nextDue.date)}</p>
                          <p className="text-[10px] text-slate-500">{l.nextDue.label}</p>
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-td">{getSeverityBadge(l.severity)}</td>
                    <td className="table-td text-slate-400"><ChevronRight size={16} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary btn-sm bg-white">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === 1} className="btn-secondary btn-sm bg-white">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PendingPaymentsReport;
