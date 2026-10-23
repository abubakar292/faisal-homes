import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { subscribeCollection, getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { where } from 'firebase/firestore';
import { formatCurrency, formatDate, getWhatsAppUrl } from '../../utils/formatters';
import { buildCustomerStatement, CustomerStatement } from '../../utils/ledgerStatement';
import { generateCustomerLedgerHTML } from '../../utils/ledgerPrint';
import { printContent } from '../../utils/printUtils';
import PageHeader from '../../components/ui/PageHeader';
import { 
  ArrowLeft, Printer, MessageCircle, AlertCircle, Clock, 
  CreditCard, TrendingDown, DollarSign, User, ShieldAlert, CheckCircle, Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Customer, Sale, Plot, Installment, DownPaymentTransaction, CompanySettings } from '../../types';

// Simple useCountUp hook if it doesn't exist
function useLocalCountUp(value: number) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);
  return displayValue;
}

const CustomerLedger: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const { data: plots } = useLiveCollection<Plot>('plots');
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [dpTransactions, setDpTransactions] = useState<DownPaymentTransaction[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [scope, setScope] = useState<'all' | string>('all');
  const [activeTab, setActiveTab] = useState<'installments' | 'statement'>('installments');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'pending' | 'partial' | 'paid'>('all');
  
  const [flashRow, setFlashRow] = useState<string | null>(null);
  const [prevInstStatus, setPrevInstStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!customerId) return;

    let unsubSales: () => void;
    let unsubInsts: () => void;
    let unsubDp: () => void;

    const loadStatic = async () => {
      try {
        const [c, comp] = await Promise.all([
          getDocument<Customer>('customers', customerId),
          getDocument<CompanySettings>('settings', 'company')
        ]);
        if (!c) { setError('Customer not found'); setLoading(false); return; }
        setCustomer(c);
        if (comp) setCompany(comp);

        unsubSales = subscribeCollection<Sale>('sales', (data) => {
          setSales(data);
        }, [where('customerId', '==', customerId)]);

        unsubInsts = subscribeCollection<Installment>('installments', (data) => {
          setInstallments(prev => {
            // Check for status changes to trigger flash
            const newStatuses = data.reduce((acc, curr) => ({...acc, [curr.id]: curr.status}), {} as Record<string, string>);
            if (prev.length > 0) {
              const changedId = data.find(n => {
                const old = prev.find(o => o.id === n.id);
                return old && old.status !== 'paid' && n.status === 'paid';
              })?.id;
              if (changedId) {
                setFlashRow(changedId);
                setTimeout(() => setFlashRow(null), 1500);
              }
            }
            return data;
          });
        }, [where('customerId', '==', customerId)]);

        unsubDp = subscribeCollection<DownPaymentTransaction>('downPaymentTransactions', (data) => {
          setDpTransactions(data);
        }, [where('customerId', '==', customerId)]);

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to load ledger data');
        setLoading(false);
      }
    };
    
    loadStatic();

    return () => {
      if (unsubSales) unsubSales();
      if (unsubInsts) unsubInsts();
      if (unsubDp) unsubDp();
    };
  }, [customerId]);

  const statementData = useMemo<CustomerStatement | null>(() => {
    if (!customer || sales.length === 0) return null;
    return buildCustomerStatement(scope, customer, sales, plots, [], dpTransactions, installments);
  }, [scope, customer, sales, plots, dpTransactions, installments]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading ledger...</div>;
  if (error || !customer) return (
    <div className="p-8 text-center">
      <AlertCircle size={40} className="mx-auto text-red-400 mb-4" />
      <h2 className="text-xl font-bold text-slate-700">{error || 'Customer not found'}</h2>
      <button onClick={() => navigate('/reports/pending')} className="mt-4 text-primary hover:underline">← Back to Pending Payments</button>
    </div>
  );

  const activeSales = sales.filter(s => s.status !== 'cancelled');
  if (activeSales.length === 0) return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-slate-700">No active plot sales for this customer</h2>
      <button onClick={() => navigate('/reports/pending')} className="mt-4 text-primary hover:underline">← Back to Pending Payments</button>
    </div>
  );

  const st = statementData!;

  const handlePrint = () => {
    if (!company) { alert('Company settings required'); return; }
    const scopeLabel = scope === 'all' ? 'All Plots' : (plots.find(p => p.id === activeSales.find(s => s.id === scope)?.plotId)?.plotNumber || 'Plot');
    const html = generateCustomerLedgerHTML(company, st, customer, scopeLabel);
    printContent(html, 'Customer Ledger Statement');
  };

  const handleWhatsApp = () => {
    if (!customer.phone) return;
    const overdue = st.rows.filter(r => r.status === 'overdue');
    if (overdue.length === 0) { alert('No overdue installments to remind'); return; }
    let msg = `Assalam-o-Alaikum ${customer.name},\n\nAapke plot ki mad mein mandarja zail qistein overdue hain:\n\n`;
    overdue.forEach(r => {
      msg += `- ${r.plotLabel}: ${r.label} (${formatCurrency(r.outstanding)})\n`;
    });
    msg += `\nTotal Overdue: ${formatCurrency(st.kpis.overdueAmount)}\nMeherbani farma ke jald az jald payment clear karein.\n\nFaisal Homes`;
    window.open(getWhatsAppUrl(customer.phone, msg), '_blank');
  };

  // UI helpers
  const severityBadge = () => {
    if (st.kpis.overdueCount > 0) {
      if (st.summary.maxDaysOverdue >= 90) return <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">CRITICAL</span>;
      return <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">OVERDUE</span>;
    }
    if (st.kpis.pendingCount > 0) return <span className="px-2 py-1 bg-amber-500 text-white text-xs font-bold rounded">UPCOMING</span>;
    return <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded">ALL CLEAR</span>;
  };

  const displayRows = st.rows.filter(r => statusFilter === 'all' || r.status === statusFilter);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports/pending')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <div>
          <PageHeader title="Customer Ledger" subtitle="Comprehensive statement of account" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Live
          </span>
        </div>
      </div>

      {/* 2. Customer Header Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card border-0 rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #1a3c6e 0%, #102a52 100%)' }}>
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-2xl font-bold border border-white/20">
              {customer.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">{customer.name}</h2>
                {severityBadge()}
              </div>
              <p className="text-blue-200 mt-1 flex items-center gap-2">
                <span className="opacity-80">S/O</span> {customer.fatherName || '—'} &nbsp;&bull;&nbsp; 
                <span className="font-mono text-xs opacity-75">{customer.customerId}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-3 text-sm text-blue-100">
                <p>CNIC: <span className="font-medium text-white">{customer.cnic}</span></p>
                <p>Phone: <a href={`tel:${customer.phone}`} className="font-medium text-white hover:underline">{customer.phone}</a></p>
                <p>City: <span className="font-medium text-white">{customer.city || '—'}</span></p>
                {customer.phone2 && <p>Alt Phone: <a href={`tel:${customer.phone2}`} className="font-medium text-white hover:underline">{customer.phone2}</a></p>}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-2 min-w-[200px]">
            <button onClick={() => navigate(`/payments/receive?customerId=${customer.id}`)} className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-primary font-bold rounded-lg hover:bg-slate-50 transition-colors">
              <DollarSign size={16} /> Receive Payment
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleWhatsApp} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 font-semibold rounded-lg transition-colors text-xs">
                <MessageCircle size={14} /> Remind
              </button>
              <button onClick={handlePrint} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors text-xs">
                <Printer size={14} /> Print
              </button>
            </div>
            <button onClick={() => navigate(`/customers/${customer.id}`)} className="text-xs text-blue-200 hover:text-white text-center mt-1 underline">
              View full profile
            </button>
          </div>
        </div>
      </motion.div>

      {/* 3. Scope Chips */}
      {activeSales.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
          <button onClick={() => setScope('all')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${scope === 'all' ? 'bg-primary text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
            All Plots
          </button>
          {activeSales.map(s => {
            const p = plots.find(pl => pl.id === s.plotId);
            return (
              <button key={s.id} onClick={() => setScope(s.id)} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${scope === s.id ? 'bg-primary text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                {p ? `${p.plotNumber} - ${p.block}` : 'Plot'}
              </button>
            );
          })}
        </div>
      )}

      {/* 4. The 4 Tabs (Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => setStatusFilter(f => f === 'overdue' ? 'all' : 'overdue')} className={`card border-l-4 cursor-pointer transition-all ${statusFilter === 'overdue' ? 'ring-2 ring-red-500' : 'hover:bg-slate-50'}`} style={{ borderLeftColor: '#ef4444' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue</p>
            <div className="p-1.5 bg-red-100 rounded-lg text-red-600"><AlertCircle size={16} /></div>
          </div>
          <p className="text-2xl font-black text-red-600">{st.kpis.overdueCount}</p>
        </div>
        <div onClick={() => setStatusFilter(f => f === 'overdue' ? 'all' : 'overdue')} className={`card border-l-4 cursor-pointer transition-all ${statusFilter === 'overdue' ? 'ring-2 ring-red-500' : 'hover:bg-slate-50'}`} style={{ borderLeftColor: '#ef4444' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue Amount</p>
            <div className="p-1.5 bg-red-100 rounded-lg text-red-600"><TrendingDown size={16} /></div>
          </div>
          <p className="text-2xl font-black text-red-600">{formatCurrency(st.kpis.overdueAmount)}</p>
        </div>
        <div onClick={() => setStatusFilter(f => f === 'pending' ? 'all' : 'pending')} className={`card border-l-4 cursor-pointer transition-all ${statusFilter === 'pending' ? 'ring-2 ring-amber-500' : 'hover:bg-slate-50'}`} style={{ borderLeftColor: '#f59e0b' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending</p>
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><Clock size={16} /></div>
          </div>
          <p className="text-2xl font-black text-amber-600">{st.kpis.pendingCount}</p>
        </div>
        <div onClick={() => setStatusFilter(f => f === 'pending' ? 'all' : 'pending')} className={`card border-l-4 cursor-pointer transition-all ${statusFilter === 'pending' ? 'ring-2 ring-amber-500' : 'hover:bg-slate-50'}`} style={{ borderLeftColor: '#f59e0b' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Amount</p>
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><CreditCard size={16} /></div>
          </div>
          <p className="text-2xl font-black text-amber-600">{formatCurrency(st.kpis.pendingAmount)}</p>
        </div>
      </div>

      {/* 5. Financial Summary Strip */}
      <div className="card bg-slate-50 border border-slate-200">
        <div className="flex flex-wrap md:flex-nowrap justify-between gap-6 items-center">
          <div>
            <p className="text-xs text-slate-500 font-semibold mb-1">Final Price</p>
            <p className="text-lg font-bold text-slate-800">{formatCurrency(st.summary.finalPrice)}</p>
          </div>
          <div className="hidden md:block w-px h-10 bg-slate-300"></div>
          <div>
            <p className="text-xs text-slate-500 font-semibold mb-1">Total Received</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(st.summary.totalReceived)}</p>
          </div>
          <div className="hidden md:block w-px h-10 bg-slate-300"></div>
          <div>
            <p className="text-xs text-slate-500 font-semibold mb-1">Remaining Balance</p>
            <p className="text-xl font-black text-primary">{formatCurrency(st.summary.remainingBalance)}</p>
          </div>
          <div className="w-full md:w-64">
            <div className="flex justify-between text-xs mb-1 font-bold">
              <span className="text-slate-600">Progress</span>
              <span className="text-primary">{st.summary.percentPaid}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${st.summary.percentPaid}%` }} className="h-full bg-primary" />
            </div>
          </div>
          {st.reconciliation.mismatch > 0 && (
            <div className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5" title={`Mismatch of Rs. ${st.reconciliation.mismatch}`}>
              <ShieldAlert size={14} /> Check Records
            </div>
          )}
        </div>
      </div>

      {/* 6. Plot / Sale Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {st.saleBlocks.map(sb => (
          <div key={sb.saleId} className="card p-0 overflow-hidden border border-slate-200 flex flex-col">
            <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-800">{sb.plotInfo.plotNumber} - Block {sb.plotInfo.block}</h4>
                <p className="text-xs text-slate-500">{sb.plotInfo.size} {sb.plotInfo.category}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono bg-white px-2 py-1 rounded text-slate-500 border border-slate-200">{sb.saleNumber}</span>
                <p className="text-xs font-bold mt-1 text-slate-600">{formatDate(sb.saleDate)}</p>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm flex-1">
              <div>
                <p className="text-xs text-slate-500">Final Price</p>
                <p className="font-bold">{formatCurrency(sb.finalPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Booking Paid</p>
                <p className="font-bold text-green-600">{formatCurrency(sb.bookingPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Down Payment Expected</p>
                <p className="font-bold">{formatCurrency(sb.downPayment.expected)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">DP Remaining</p>
                <p className="font-bold text-amber-600">{formatCurrency(sb.downPayment.remaining)}</p>
              </div>
              {sb.onPossession.enabled && (
                <div className="col-span-2 bg-slate-50 p-2 rounded border border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600">On Possession</span>
                  <span className={`font-bold ${sb.onPossession.status === 'Paid' ? 'text-green-600' : 'text-slate-700'}`}>{formatCurrency(sb.onPossession.amount)} ({sb.onPossession.status})</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 7. Tabs for Installments vs Statement */}
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('installments')} 
            className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'installments' ? 'bg-white text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Installment Schedule ({st.rows.length})
          </button>
          <button 
            onClick={() => setActiveTab('statement')} 
            className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'statement' ? 'bg-white text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Payment Statement ({st.statement.length})
          </button>
        </div>

        <div className="p-4">
          {activeTab === 'installments' ? (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setStatusFilter('all')} className={`px-3 py-1 rounded-full text-xs font-bold ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
                <button onClick={() => setStatusFilter('overdue')} className={`px-3 py-1 rounded-full text-xs font-bold ${statusFilter === 'overdue' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>Overdue</button>
                <button onClick={() => setStatusFilter('pending')} className={`px-3 py-1 rounded-full text-xs font-bold ${statusFilter === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>Pending</button>
                <button onClick={() => setStatusFilter('partial')} className={`px-3 py-1 rounded-full text-xs font-bold ${statusFilter === 'partial' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>Partial</button>
                <button onClick={() => setStatusFilter('paid')} className={`px-3 py-1 rounded-full text-xs font-bold ${statusFilter === 'paid' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>Paid</button>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="table-th">Label</th>
                      {scope === 'all' && <th className="table-th">Plot</th>}
                      <th className="table-th">Due Date</th>
                      <th className="table-th text-right">Amount Due</th>
                      <th className="table-th text-right">Paid</th>
                      <th className="table-th text-right">Outstanding</th>
                      <th className="table-th">Status</th>
                      <th className="table-th">Days / Info</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-8 text-slate-400">No installments found</td></tr>
                    ) : (
                      displayRows.map((r, i) => {
                        const isPaid = r.status === 'paid';
                        const isOverdue = r.status === 'overdue';
                        const isFlashing = flashRow === r.id;
                        return (
                          <motion.tr 
                            initial={false}
                            animate={isFlashing ? { backgroundColor: ['#dcfce7', '#ffffff'] } : {}}
                            transition={{ duration: 1.5 }}
                            key={r.id} 
                            className={`border-b border-slate-50 ${isPaid ? 'bg-green-50/30 text-slate-500' : isOverdue ? 'bg-red-50/30' : 'hover:bg-slate-50'}`}
                          >
                            <td className="py-2.5 px-4 font-bold text-slate-700">{r.label}</td>
                            {scope === 'all' && <td className="py-2.5 px-4 text-xs">{r.plotLabel}</td>}
                            <td className="py-2.5 px-4">{formatDate(r.dueDate)}</td>
                            <td className="py-2.5 px-4 text-right">{formatCurrency(r.amountDue)}</td>
                            <td className="py-2.5 px-4 text-right font-medium text-green-600">{formatCurrency(r.amountPaid)}</td>
                            <td className={`py-2.5 px-4 text-right font-bold ${r.outstanding > 0 ? 'text-primary' : ''}`}>{formatCurrency(r.outstanding)}</td>
                            <td className="py-2.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isPaid ? 'bg-green-100 text-green-700' : 
                                isOverdue ? 'bg-red-100 text-red-700' : 
                                r.status === 'partial' ? 'bg-blue-100 text-blue-700' : 
                                'bg-slate-200 text-slate-600'
                              }`}>{r.status}</span>
                            </td>
                            <td className="py-2.5 px-4 text-xs font-medium">
                              {isOverdue ? <span className="text-red-500">{r.daysOverdue} days overdue</span> :
                               isPaid ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12}/> {formatDate(r.paymentDate)}</span> :
                               r.daysUntilDue === 0 ? <span className="text-amber-500">Due today</span> :
                               <span className="text-slate-400">in {r.daysUntilDue} days</span>
                              }
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 sticky bottom-0 border-t border-slate-200">
                    <tr>
                      <td colSpan={scope === 'all' ? 3 : 2} className="py-3 px-4 font-bold text-right">Totals</td>
                      <td className="py-3 px-4 font-bold text-right">{formatCurrency(displayRows.reduce((s, r) => s + r.amountDue, 0))}</td>
                      <td className="py-3 px-4 font-bold text-right text-green-600">{formatCurrency(displayRows.reduce((s, r) => s + r.amountPaid, 0))}</td>
                      <td className="py-3 px-4 font-black text-right text-primary">{formatCurrency(displayRows.reduce((s, r) => s + r.outstanding, 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">Reference</th>
                    <th className="table-th text-right text-red-600">Debit</th>
                    <th className="table-th text-right text-green-600">Credit</th>
                    <th className="table-th text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {st.statement.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">No transactions</td></tr>
                  ) : (
                    st.statement.map((tx, i) => (
                      <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 px-4 text-xs text-slate-500">{formatDate(tx.date)}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-800">{tx.description}</td>
                        <td className="py-2.5 px-4 text-xs font-mono text-slate-500">{tx.reference || tx.method || '—'}</td>
                        <td className="py-2.5 px-4 text-right font-medium text-red-500">{tx.debit > 0 ? formatCurrency(tx.debit) : ''}</td>
                        <td className="py-2.5 px-4 text-right font-medium text-green-600">{tx.credit > 0 ? formatCurrency(tx.credit) : ''}</td>
                        <td className="py-2.5 px-4 text-right font-bold bg-slate-50/50">{formatCurrency(tx.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 sticky bottom-0 border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="py-3 px-4 font-bold text-right uppercase text-xs">Totals</td>
                    <td className="py-3 px-4 font-bold text-right text-red-600">{formatCurrency(st.statement.reduce((s, t) => s + t.debit, 0))}</td>
                    <td className="py-3 px-4 font-bold text-right text-green-600">{formatCurrency(st.statement.reduce((s, t) => s + t.credit, 0))}</td>
                    <td className="py-3 px-4 font-black text-right text-primary bg-slate-100">{formatCurrency(st.summary.remainingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerLedger;
