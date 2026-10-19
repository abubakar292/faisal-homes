import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, MessageCircle, ChevronRight, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, daysOverdue, getOutstanding, getInstallmentStatus, getWhatsAppUrl } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import { buildCustomerLedgers } from '../../utils/ledger';
import type { Installment, Customer, Plot, CompanySettings, Sale, DownPaymentTransaction } from '../../types';

type ViewMode = 'installments' | 'customers';

const PendingPaymentsReport: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('installments');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
    try {
      const [insts, cust, plts, s, dp, comp] = await Promise.all([
        getCollection<Installment>('installments'),
        getCollection<Customer>('customers'),
        getCollection<Plot>('plots'),
        getCollection<Sale>('sales'),
        getCollection<DownPaymentTransaction>('downPaymentTransactions'),
        getDocument<CompanySettings>('settings', 'company'),
      ]);

      const activeSales = new Set(s.filter(sale => sale.status !== 'cancelled').map(sale => sale.id));
      const activeInsts = insts.filter(i => {
        if (!activeSales.has(i.saleId) || getOutstanding(i) <= 0) return false;
        // Down payments have their own tracker and screen (/payments/down-payments)
        if (i.type === 'down_payment') return false;
        return true;
      });

      setInstallments(activeInsts);
      setCustomers(cust);
      setPlots(plts);
      setSales(s);
      setDpTx(dp);
      if (comp) setCompany(comp);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load pending payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const customerInfo = (id: string) => customers.find(c => c.id === id);
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} - ${p.block}` : '—';
  };

  // ─── INSTALLMENTS VIEW LOGIC ───
  const filteredInsts = useMemo(() => {
    let result = [...installments];
    if (dateRange.start) {
      result = result.filter(i => new Date(i.dueDate) >= dateRange.start!);
    }
    if (dateRange.end) {
      result = result.filter(i => new Date(i.dueDate) <= dateRange.end!);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(i => {
        const c = customerInfo(i.customerId);
        const p = plotInfo(i.plotId);
        return (
          (c?.name || '').toLowerCase().includes(q) ||
          (c?.cnic || '').includes(q) ||
          (c?.phone || '').includes(q) ||
          p.toLowerCase().includes(q)
        );
      });
    }

    return result.sort((a, b) => daysOverdue(b) - daysOverdue(a));
  }, [installments, dateRange, search, customers, plots]);

  const totalOutstandingAmount = useMemo(() => {
    return filteredInsts.reduce((s, i) => s + getOutstanding(i), 0);
  }, [filteredInsts]);

  const overdueCount = useMemo(() => {
    return filteredInsts.filter(i => daysOverdue(i) > 0).length;
  }, [filteredInsts]);

  const buildWaMsg = (inst: Installment, customer: Customer) => {
    return `Assalam-o-Alaikum ${customer.name},\n\nAapki plot ${plotInfo(inst.plotId)} ki qist baqi hai:\nAmount: ${formatCurrency(getOutstanding(inst))}\nDue Date: ${formatDate(inst.dueDate)}\n\nMeherbani farma ke jald payment karein.\n\n${company?.name || 'Faisal Homes'}\n${company?.phone || ''}`;
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
  }, [filteredCustomers, page, itemsPerPage]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    if (viewMode === 'installments') {
      const rows = filteredInsts.map(i => {
        const c = customerInfo(i.customerId);
        const days = daysOverdue(i);
        return [
          c?.name || '—',
          plotInfo(i.plotId),
          `#${i.installmentNumber}`,
          formatDate(i.dueDate),
          formatCurrency(getOutstanding(i)),
          days > 0 ? `${days} days` : 'Upcoming',
          getInstallmentStatus(i)
        ];
      });
      const html = generateReportHTML(
        company,
        'Pending Payments Report (Installments)',
        ['Customer', 'Plot', '#', 'Due Date', 'Amount Due', 'Overdue', 'Status'],
        rows,
        `Total Outstanding: ${formatCurrency(totalOutstandingAmount)} | ${filteredInsts.length} installments`
      );
      printContent(html, 'Pending-Payments-Installments');
    } else {
      const rows = filteredCustomers.map(l => [
        l.customerId,
        l.customerName,
        l.phone,
        l.plots.join(', '),
        formatCurrency(l.overdueAmount),
        formatCurrency(l.totalOutstanding),
        `${l.maxDaysOverdue} days`,
        l.severity
      ]);
      const html = generateReportHTML(
        company,
        'Pending Payments Report (Customers)',
        ['Customer ID', 'Name', 'Phone', 'Plots', 'Overdue Amount', 'Total Outstanding', 'Max Days', 'Severity'],
        rows,
        `Total Customers: ${filteredCustomers.length}`
      );
      printContent(html, 'Pending-Payments-Customers');
    }
  };

  const handleExportCsv = () => {
    if (viewMode === 'installments') {
      const headers = ['Customer', 'Phone', 'Plot', 'Inst #', 'Due Date', 'Outstanding Amount', 'Days Overdue', 'Status'];
      const rows = filteredInsts.map(i => {
        const c = customerInfo(i.customerId);
        const days = daysOverdue(i);
        return [
          c?.name || '',
          c?.phone || '',
          plotInfo(i.plotId),
          i.installmentNumber,
          formatDate(i.dueDate),
          getOutstanding(i),
          days > 0 ? days : 0,
          getInstallmentStatus(i)
        ];
      });
      exportRowsToCsv('Pending-Payments-Installments', headers, rows);
    } else {
      const headers = ['Customer ID', 'Customer Name', 'Phone', 'CNIC', 'Plots', 'Overdue Amount', 'Total Outstanding', 'Max Days Overdue', 'Severity'];
      const rows = filteredCustomers.map(l => [
        l.customerId,
        l.customerName,
        l.phone,
        l.cnic,
        l.plots.join('; '),
        l.overdueAmount,
        l.totalOutstanding,
        l.maxDaysOverdue,
        l.severity
      ]);
      exportRowsToCsv('Pending-Payments-Customers', headers, rows);
    }
  };

  const getSeverityBadge = (sev: string) => {
    if (sev === 'CRITICAL') return <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded">CRITICAL</span>;
    if (sev === 'OVERDUE') return <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">OVERDUE</span>;
    if (sev === 'UPCOMING') return <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded">UPCOMING</span>;
    return <span className="px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded">CLEAR</span>;
  };

  const kpis = [
    { label: 'Pending Installments', value: filteredInsts.length, color: 'amber' as const, hint: 'Unpaid or partial' },
    { label: 'Total Outstanding', value: totalOutstandingAmount, isCurrency: true, color: 'red' as const, hint: 'Receivable total' },
    { label: 'Overdue Installments', value: overdueCount, color: 'red' as const, hint: 'Past due date' },
    { label: 'Defaulter Customers', value: new Set(filteredInsts.map(i => i.customerId)).size, color: 'navy' as const, hint: 'Unique buyers' },
  ];

  return (
    <ReportLayout
      reportName="Pending Payments"
      title="Pending & Overdue Payments"
      subtitle="Comprehensive recovery tracking by individual installments and customer ledger totals"
      icon={<AlertCircle size={18} />}
      onPrint={handlePrint}
      onExportCsv={handleExportCsv}
      kpis={kpis}
      loading={loading}
      topContent={
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          {/* Segmented view switcher */}
          <div className="inline-flex p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => { setViewMode('installments'); setPage(1); }}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'installments'
                  ? 'bg-white text-slate-900 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Installments View ({filteredInsts.length})
            </button>
            <button
              onClick={() => { setViewMode('customers'); setPage(1); }}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'customers'
                  ? 'bg-white text-slate-900 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customers View ({filteredCustomers.length})
            </button>
          </div>

          {viewMode === 'customers' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Sort By:</span>
              <select
                value={sortField}
                onChange={e => { setSortField(e.target.value); setPage(1); }}
                className="input-field text-xs py-1 px-2.5 w-auto"
              >
                <option value="highest_overdue">Highest Overdue</option>
                <option value="most_days">Most Days Overdue</option>
                <option value="highest_outstanding">Highest Outstanding</option>
                <option value="name">Customer Name A-Z</option>
              </select>
            </div>
          )}
        </div>
      }
      filterCard={
        <ReportFilters
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder={viewMode === 'installments' ? "Search customer, CNIC, or plot..." : "Search customer, ID, CNIC, or plot..."}
        />
      }
      footerContent={
        viewMode === 'installments' ? (
          <div className="flex justify-between items-center font-bold">
            <span>Pending Installments: {filteredInsts.length}</span>
            <span className="text-rose-700">Total Outstanding: {formatCurrency(totalOutstandingAmount)}</span>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <span>Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} customers</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-1.5 font-bold">Page {page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )
      }
    >
      {viewMode === 'installments' ? (
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3">Phone</th>
              <th className="py-3 px-3">Plot</th>
              <th className="py-3 px-3">Inst #</th>
              <th className="py-3 px-3">Due Date</th>
              <th className="py-3 px-3">Amount Due</th>
              <th className="py-3 px-3">Days Overdue</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-center">Remind</th>
            </tr>
          </thead>
          <tbody>
            {filteredInsts.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  No pending installments found for selected criteria.
                </td>
              </tr>
            ) : (
              filteredInsts.map(i => {
                const c = customerInfo(i.customerId);
                const dOverdue = daysOverdue(i);
                const stat = getInstallmentStatus(i);
                const out = getOutstanding(i);

                return (
                  <tr
                    key={i.id}
                    className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${
                      stat === 'overdue' ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-semibold">
                      {c ? (
                        <button
                          onClick={() => navigate(`/reports/pending/customer/${c.id}`)}
                          className="text-primary hover:underline font-bold text-left"
                          title="Open Customer Ledger"
                        >
                          {c.name}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{c?.phone || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-700">{plotInfo(i.plotId)}</td>
                    <td className="py-2.5 px-3 text-slate-600">#{i.installmentNumber}</td>
                    <td className="py-2.5 px-3 text-slate-500">{formatDate(i.dueDate)}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {formatCurrency(out)}
                      {stat === 'partial' && (
                        <span className="block text-[10px] text-slate-500 font-normal">
                          (paid {formatCurrency(i.amountPaid || 0)})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-rose-600">
                      {dOverdue > 0 ? `${dOverdue} days` : '—'}
                    </td>
                    <td className="py-2.5 px-3"><StatusBadge status={stat} size="sm" /></td>
                    <td className="py-2.5 px-3 text-center">
                      {c?.whatsapp && (
                        <button
                          onClick={() => window.open(getWhatsAppUrl(c.whatsapp, buildWaMsg(i, c)), '_blank')}
                          className="p-1 hover:bg-emerald-50 rounded text-emerald-600 inline-flex transition-colors"
                          title="Send WhatsApp Reminder"
                        >
                          <MessageCircle size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3">Phone</th>
              <th className="py-3 px-3">Plots</th>
              <th className="py-3 px-3">Overdue Amount</th>
              <th className="py-3 px-3">Total Outstanding</th>
              <th className="py-3 px-3">Max Overdue</th>
              <th className="py-3 px-3">Severity</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCustomers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  No customer records matched your search.
                </td>
              </tr>
            ) : (
              paginatedCustomers.map(l => (
                <tr key={l.customerId} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    <div>{l.customerName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{l.customerId}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{l.phone || '—'}</td>
                  <td className="py-2.5 px-3 text-slate-700">{l.plots.join(', ') || '—'}</td>
                  <td className="py-2.5 px-3 font-bold text-rose-600">{formatCurrency(l.overdueAmount)}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{formatCurrency(l.totalOutstanding)}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-700">
                    {l.maxDaysOverdue > 0 ? `${l.maxDaysOverdue} days` : '0 days'}
                  </td>
                  <td className="py-2.5 px-3">{getSeverityBadge(l.severity)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => navigate(`/reports/pending/customer/${l.customerId}`)}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-1"
                    >
                      <User size={12} /> Ledger <ChevronRight size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </ReportLayout>
  );
};

export default PendingPaymentsReport;
