import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Eye, CreditCard, Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { getCollection, subscribeCollection } from '../../firebase/firestore';
import { formatCurrency } from '../../utils/formatters';
import type { Sale, Customer, Plot } from '../../types';
import StatCard from '../../components/ui/StatCard';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import gsap from 'gsap';
import { BrandLoader } from '../../components/brand';

interface DownPaymentRow {
  saleId: string;
  saleNumber: string;
  customerId: string;
  customerDisplayId: string;
  customerName: string;
  fatherName: string;
  phone: string;
  plotNumber: string;
  block: string;
  totalDownPayment: number;
  bookingPaid: number;
  remainingRequired: number;
  receivedSoFar: number;
  stillPending: number;
  status: 'complete' | 'partial' | 'pending';
  saleDate: Date;
}

export default function DownPayments() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'partial' | 'complete'>('all');

  useEffect(() => {
    const load = async () => {
      const [c, p] = await Promise.all([
        getCollection<Customer>('customers'),
        getCollection<Plot>('plots'),
      ]);
      setCustomers(c);
      setPlots(p);
      setLoading(false);
    };
    load();

    const unsub = subscribeCollection<Sale>('sales', (data) => {
      setSales(data.filter(s => s.status === 'active' && ((s.downPaymentAmount || 0) > 0 || (s.remainingDownPayment || 0) > 0 || (s.downPaymentReceived || 0) > 0)));
    });
    return () => unsub();
  }, []);

  const rows = useMemo<DownPaymentRow[]>(() => {
    const q = search.toLowerCase().trim();

    return sales.map(sale => {
      const customer = customers.find(c => c.id === sale.customerId);
      const plot = plots.find(p => p.id === sale.plotId);
      if (!customer || !plot) return null;

      const totalDownPayment = sale.downPaymentAmount || 0;
      const bookingPaid = sale.bookingAmountPaid || 0;
      const remainingRequired = Math.max(0, totalDownPayment - bookingPaid);
      const receivedSoFar = sale.downPaymentReceived || 0;
      const stillPending = Math.max(0, remainingRequired - receivedSoFar);

      let status: 'complete' | 'partial' | 'pending';
      if (sale.downPaymentStatus === 'complete' || stillPending === 0) status = 'complete';
      else if (receivedSoFar > 0 || sale.downPaymentStatus === 'partial') status = 'partial';
      else status = 'pending';

      return {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        customerId: customer.id,
        customerDisplayId: customer.customerId,
        customerName: customer.name,
        fatherName: customer.fatherName || '',
        phone: customer.phone,
        plotNumber: plot.plotNumber,
        block: plot.block,
        totalDownPayment: sale.downPaymentAmount || 0,
        bookingPaid: sale.bookingAmountPaid || 0,
        remainingRequired,
        receivedSoFar,
        stillPending,
        status,
        saleDate: new Date(sale.saleDate),
      } as DownPaymentRow;
    }).filter((r): r is DownPaymentRow => {
      if (!r) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (dateRange.start && r.saleDate < dateRange.start) return false;
      if (dateRange.end && r.saleDate > dateRange.end) return false;
      if (!q) return true;
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerDisplayId.toLowerCase().includes(q) ||
        r.fatherName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.plotNumber.toLowerCase().includes(q) ||
        r.block.toLowerCase().includes(q) ||
        r.saleNumber.toLowerCase().includes(q)
      );
    }).sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime());
  }, [sales, customers, plots, search, filterStatus, dateRange]);

  useEffect(() => {
    if (rows.length > 0) {
      gsap.fromTo('.table-row-animate', 
        { opacity: 0, y: 10 }, 
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, [rows]);

  const totalPending = rows.reduce((s, r) => s + r.stillPending, 0);
  const countComplete = rows.filter(r => r.status === 'complete').length;
  const countPartial = rows.filter(r => r.status === 'partial').length;
  const countNotStart = rows.filter(r => r.status === 'pending').length;

  const statusBadge = (status: DownPaymentRow['status']) => {
    if (status === 'complete') return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-700"><CheckCircle2 size={12}/> Fully Paid</span>;
    if (status === 'partial') return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700"><AlertCircle size={12}/> Partially Paid</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700"><XCircle size={12}/> Not Started</span>;
  };

  const getExtraFilters = () => (
    <select 
      value={filterStatus}
      onChange={e => setFilterStatus(e.target.value as any)}
      className="text-sm bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-3 pr-8 outline-none focus:border-blue-500"
    >
      <option value="all">All Status</option>
      <option value="pending">Not Started</option>
      <option value="partial">Partially Paid</option>
      <option value="complete">Fully Paid</option>
    </select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Down Payment Management"
        subtitle="Track and collect remaining down payments for assigned plots"
        icon={<DollarSign size={22} />}
        actions={
          <button onClick={() => navigate('/payments/receive-down-payment')} className="btn btn-primary">
            <CreditCard size={16} /> Receive Payment
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Pending" value={`Rs. ${totalPending}`} icon={<div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><Clock size={20}/></div>} index={0} />
        <StatCard title="Fully Paid" value={countComplete} icon={<div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600"><CheckCircle2 size={20}/></div>} index={1} />
        <StatCard title="Partially Paid" value={countPartial} icon={<div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><AlertCircle size={20}/></div>} index={2} />
        <StatCard title="Not Started" value={countNotStart} icon={<div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><XCircle size={20}/></div>} index={3} />
      </div>

      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        searchPlaceholder="Search by name, ID, phone, plot..."
        extraFilters={getExtraFilters()}
        activeFiltersCount={filterStatus !== 'all' ? 1 : 0}
        onClearFilters={() => setFilterStatus('all')}
      />

      <div className="card">
        {loading ? (
          <BrandLoader />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <DollarSign size={32} className="text-slate-300" />
            </div>
            <p className="text-lg font-medium text-slate-600">No down payment records found</p>
            <p className="text-sm">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Customer', 'Plot', 'Total DP', 'Progress', 'Still Pending', 'Status', 'Actions'].map(h => (
                    <th key={h} className="table-th text-left py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const progressPct = row.remainingRequired > 0 ? Math.min(100, Math.round((row.receivedSoFar / row.remainingRequired) * 100)) : 100;
                  return (
                    <tr key={row.saleId} className="table-row-animate hover:bg-slate-50/50 transition-colors">
                      <td className="table-td py-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{row.customerDisplayId}</span>
                          <p className="font-semibold text-slate-800 text-sm">{row.customerName}</p>
                        </div>
                        <p className="text-xs text-slate-500">{row.phone}</p>
                      </td>
                      <td className="table-td py-3 px-4">
                        <p className="font-semibold text-slate-800 text-sm">{row.plotNumber}</p>
                        <p className="text-xs text-slate-500">Block {row.block}</p>
                      </td>
                      <td className="table-td py-3 px-4 text-sm font-medium text-slate-700">
                        {formatCurrency(row.totalDownPayment)}
                      </td>
                      <td className="table-td py-3 px-4 min-w-[150px]">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Rec: {formatCurrency(row.receivedSoFar)}</span>
                          <span className="font-medium text-slate-700">{progressPct}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${progressPct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progressPct}%` }} />
                        </div>
                      </td>
                      <td className="table-td py-3 px-4">
                        <span className={`font-bold text-sm ${row.stillPending > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(row.stillPending)}
                        </span>
                      </td>
                      <td className="table-td py-3 px-4">{statusBadge(row.status)}</td>
                      <td className="table-td py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/payments/down-payment-ledger?saleId=${row.saleId}`)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Ledger"
                          >
                            <Eye size={16} />
                          </button>
                          {row.stillPending > 0 && (
                            <button
                              onClick={() => navigate(`/payments/receive-down-payment?saleId=${row.saleId}`)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                              title="Receive Payment"
                            >
                              <CreditCard size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
