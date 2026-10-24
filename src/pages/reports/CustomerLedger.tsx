import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  ArrowLeft, Printer, MessageCircle, AlertCircle, Clock,
  CreditCard, TrendingDown, DollarSign, User, ShieldAlert,
  CheckCircle, Smartphone, Calendar, Search, Filter,
  Receipt, TrendingUp, Sparkles, Phone, ChevronRight,
  Check, ArrowUpRight, Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { where } from 'firebase/firestore';

import { subscribeCollection, getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate, getWhatsAppUrl } from '../../utils/formatters';
import { buildCustomerStatement, CustomerStatement } from '../../utils/ledgerStatement';
import { generateCustomerLedgerHTML } from '../../utils/ledgerPrint';
import { printContent } from '../../utils/printUtils';
import PageHeader from '../../components/ui/PageHeader';
import { StatCardSkeleton, TableSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { expectedCounts, PlanInput } from '../../domain/plan';
import {
  getScheduleRowStatus,
  consolidateCustomerPaymentReceipts,
  buildVirtualScheduleList,
  buildChartTimeline,
  type PaymentReceiptItem,
  type VirtualScheduleItem,
} from '../../utils/ledgerUIHelpers';
import { getDemoCustomerLedgerData } from '../../utils/ledgerDemoData';
import type { Customer, Sale, Plot, Installment, DownPaymentTransaction, CompanySettings } from '../../types';

const CustomerLedger: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Data State ────────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const { data: plots } = useLiveCollection<Plot>('plots');
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [dpTransactions, setDpTransactions] = useState<DownPaymentTransaction[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ─── Interactive UI State ──────────────────────────────────────────────────
  const [scope, setScope] = useState<'all' | string>(() => searchParams.get('scope') || 'all');
  const [activeTab, setActiveTab] = useState<'schedule' | 'payments' | 'statement'>(() => {
    const t = searchParams.get('tab');
    if (t === 'payments' || t === 'statement') return t;
    return 'schedule';
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'pending' | 'due_soon' | 'paid'>('all');
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentsSearchQuery, setPaymentsSearchQuery] = useState('');

  // ─── Subscription Lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!customerId) return;

    let unsubSales: () => void;
    let unsubInsts: () => void;
    let unsubDp: () => void;

    const isDemo = customerId === 'demo' || searchParams.get('demo') === '1';

    const loadStatic = async () => {
      if (isDemo) {
        const demoData = getDemoCustomerLedgerData();
        setCustomer(demoData.customer);
        setCompany(demoData.company);
        setSales([demoData.sale]);
        setInstallments(demoData.installments);
        setDpTransactions(demoData.dpTransactions);
        setLoading(false);
        return;
      }

      try {
        const [c, comp] = await Promise.all([
          getDocument<Customer>('customers', customerId),
          getDocument<CompanySettings>('settings', 'company'),
        ]);
        if (!c) {
          setError('Customer not found');
          setLoading(false);
          return;
        }
        setCustomer(c);
        if (comp) setCompany(comp);

        unsubSales = subscribeCollection<Sale>(
          'sales',
          (data) => setSales(data),
          [where('customerId', '==', customerId)]
        );

        unsubInsts = subscribeCollection<Installment>(
          'installments',
          (data) => setInstallments(data),
          [where('customerId', '==', customerId)]
        );

        unsubDp = subscribeCollection<DownPaymentTransaction>(
          'downPaymentTransactions',
          (data) => setDpTransactions(data),
          [where('customerId', '==', customerId)]
        );

        setLoading(false);
      } catch (err) {
        console.error(err);
        if (isDemo) {
          const demoData = getDemoCustomerLedgerData();
          setCustomer(demoData.customer);
          setCompany(demoData.company);
          setSales([demoData.sale]);
          setInstallments(demoData.installments);
          setDpTransactions(demoData.dpTransactions);
          setLoading(false);
          return;
        }
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

  // ─── Memoized Core Calculations (Unconditional) ───────────────────────────
  const activeSales = useMemo(() => sales.filter(s => s.status !== 'cancelled'), [sales]);

  const effectivePlots = useMemo(() => {
    if (plots.length > 0) return plots;
    if (customerId === 'demo' || searchParams.get('demo') === '1') {
      return [getDemoCustomerLedgerData().plot];
    }
    return [];
  }, [plots, customerId, searchParams]);

  const statementData = useMemo<CustomerStatement | null>(() => {
    if (!customer || activeSales.length === 0) return null;
    return buildCustomerStatement(scope, customer, activeSales, effectivePlots, [], dpTransactions, installments);
  }, [scope, customer, activeSales, effectivePlots, dpTransactions, installments]);

  const paymentReceipts = useMemo<PaymentReceiptItem[]>(() => {
    return consolidateCustomerPaymentReceipts(activeSales, effectivePlots, dpTransactions, installments, scope);
  }, [activeSales, effectivePlots, dpTransactions, installments, scope]);

  const semiAnnualCountsBySale = useMemo(() => {
    const map: Record<string, number> = {};
    activeSales.forEach(s => {
      if (s.semiAnnualEnabled) {
        map[s.id] = s.semiAnnualCount || 0;
      }
    });
    return map;
  }, [activeSales]);

  // Schedule filtering
  const filteredScheduleRows = useMemo(() => {
    if (!statementData) return [];
    let list = statementData.rows;

    if (showUnpaidOnly) {
      list = list.filter(r => r.status !== 'paid' && r.outstanding > 0);
    }

    if (statusFilter !== 'all') {
      list = list.filter(r => {
        const rowStatus = getScheduleRowStatus(r);
        return rowStatus === statusFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const dateStr = formatDate(r.dueDate).toLowerCase();
        const amtStr = r.amountDue.toString();
        const paidStr = r.amountPaid.toString();
        const outStr = r.outstanding.toString();
        const recStr = (r.receiptNumber || '').toLowerCase();
        const lblStr = r.label.toLowerCase();
        const plotStr = r.plotLabel.toLowerCase();
        return (
          lblStr.includes(q) ||
          plotStr.includes(q) ||
          dateStr.includes(q) ||
          amtStr.includes(q) ||
          paidStr.includes(q) ||
          outStr.includes(q) ||
          recStr.includes(q)
        );
      });
    }

    return list;
  }, [statementData, showUnpaidOnly, statusFilter, searchQuery]);

  // Flattened virtual items
  const virtualScheduleItems = useMemo<VirtualScheduleItem[]>(() => {
    return buildVirtualScheduleList(filteredScheduleRows, semiAnnualCountsBySale);
  }, [filteredScheduleRows, semiAnnualCountsBySale]);

  // Recharts timeline
  const chartPoints = useMemo(() => {
    if (!statementData) return [];
    return buildChartTimeline(activeSales, statementData, paymentReceipts);
  }, [activeSales, statementData, paymentReceipts]);

  // Earliest upcoming unpaid installment for "Receive Payment" action
  const nextUnpaidInstallment = useMemo(() => {
    if (!statementData) return null;
    const unpaidRows = statementData.rows.filter(r => r.outstanding > 0);
    if (unpaidRows.length === 0) return null;
    return unpaidRows[0];
  }, [statementData]);

  // Red Banner: Incomplete Sales check
  const incompleteSales = useMemo(() => {
    return activeSales.map(sale => {
      const saleInsts = installments.filter(
        i => i.saleId === sale.id && i.type !== 'down_payment'
      );
      const rows = Array.isArray(sale.installmentRows) && sale.installmentRows.length > 0
        ? sale.installmentRows
        : [];
      const planInput: PlanInput = {
        saleId: sale.id,
        customerId: sale.customerId,
        plotId: sale.plotId,
        saleDate: sale.saleDate || new Date(),
        totalPrice: sale.totalPrice || sale.finalPrice || 0,
        discount: sale.discount || 0,
        bookingPaid: sale.bookingAmountPaid || 0,
        downPaymentAmount: sale.downPaymentAmount || sale.downPayment || 0,
        rows,
        semiAnnualEnabled: !!sale.semiAnnualEnabled,
        semiAnnualAmount: sale.semiAnnualAmount || 0,
        onPossessionEnabled: !!sale.onPossessionEnabled,
        onPossessionAmount: sale.onPossessionAmount || 0,
        includeRemainingDownPayment: false,
      };
      const exp = expectedCounts(planInput);
      const expectedTotal = exp.amountToSchedule + exp.possessionAmount;
      const actualTotal = saleInsts.reduce((sum, i) => sum + (i.amountDue || 0), 0);
      const isIncomplete = saleInsts.length !== exp.totalCount || Math.abs(actualTotal - expectedTotal) > 1;
      return {
        sale,
        isIncomplete,
        expectedCount: exp.totalCount,
        actualCount: saleInsts.length,
        expectedTotal,
        actualTotal,
      };
    }).filter(item => item.isIncomplete && (scope === 'all' || item.sale.id === scope));
  }, [activeSales, installments, scope]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    if (!paymentsSearchQuery.trim()) return paymentReceipts;
    const q = paymentsSearchQuery.toLowerCase().trim();
    return paymentReceipts.filter(p => {
      return (
        p.receiptNumber.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.paymentMethod.toLowerCase().includes(q) ||
        p.bankName.toLowerCase().includes(q) ||
        p.chequeNumber.toLowerCase().includes(q) ||
        p.plotLabel.toLowerCase().includes(q) ||
        p.amount.toString().includes(q) ||
        formatDate(p.date).toLowerCase().includes(q)
      );
    });
  }, [paymentReceipts, paymentsSearchQuery]);

  // ─── Virtualizer (Unconditional Hook) ──────────────────────────────────────
  const scheduleScrollParentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: virtualScheduleItems.length,
    getScrollElement: () => scheduleScrollParentRef.current,
    estimateSize: (index) => {
      const item = virtualScheduleItems[index];
      return item?.kind === 'year_header' ? 44 : 80;
    },
    overscan: 10,
  });

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!company) {
      alert('Company settings required');
      return;
    }
    if (!statementData || !customer) return;
    const scopeLabel = scope === 'all'
      ? 'All Plots'
      : (plots.find(p => p.id === activeSales.find(s => s.id === scope)?.plotId)?.plotNumber || 'Plot');
    const html = generateCustomerLedgerHTML(company, statementData, customer, scopeLabel);
    printContent(html, 'Customer Ledger Statement');
  };

  const handleWhatsApp = () => {
    if (!customer?.phone || !statementData) return;
    const overdue = statementData.rows.filter(r => r.status === 'overdue');
    let msg = `Assalam-o-Alaikum ${customer.name},\n\n`;
    if (overdue.length > 0) {
      msg += `Aapke plot ki mad mein mandarja zail qistein overdue hain:\n\n`;
      overdue.forEach(r => {
        msg += `- ${r.plotLabel}: ${r.label} (${formatCurrency(r.outstanding)})\n`;
      });
      msg += `\nTotal Overdue: ${formatCurrency(statementData.kpis.overdueAmount)}\n`;
    } else {
      msg += `Aapka current remaining balance ${formatCurrency(statementData.summary.remainingBalance)} hai.\n`;
    }
    msg += `Meherbani farma ke payment jald az jald clear karein.\n\nFaisal Homes`;
    window.open(getWhatsAppUrl(customer.phone, msg), '_blank');
  };

  const handleReceivePaymentClick = () => {
    if (!customer) return;
    let url = `/payments/receive?customerId=${customer.id}`;
    if (nextUnpaidInstallment) {
      url += `&saleId=${nextUnpaidInstallment.id}&installmentId=${nextUnpaidInstallment.id}`;
    } else if (activeSales.length === 1) {
      url += `&saleId=${activeSales[0].id}`;
    }
    navigate(url);
  };

  // Toggle KPI filter
  const handleToggleKpiFilter = (target: 'overdue' | 'pending') => {
    setStatusFilter(prev => (prev === target ? 'all' : target));
  };

  // ─── Loading Skeletons ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 pb-20" aria-busy="true" aria-label="Loading customer ledger">
        <div className="flex items-center gap-4">
          <Skeleton width="40px" height="40px" className="rounded-full" />
          <div className="space-y-2">
            <Skeleton width="220px" height="24px" />
            <Skeleton width="160px" height="14px" />
          </div>
        </div>

        {/* Header card skeleton */}
        <div className="rounded-2xl p-6 bg-slate-800 text-white space-y-4">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="flex items-center gap-4">
              <Skeleton width="64px" height="64px" className="rounded-2xl bg-slate-700" />
              <div className="space-y-2">
                <Skeleton width="200px" height="28px" className="bg-slate-700" />
                <Skeleton width="140px" height="16px" className="bg-slate-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton width="180px" height="42px" className="rounded-xl bg-slate-700" />
            </div>
          </div>
        </div>

        {/* KPI Skeleton Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        {/* Content Skeleton */}
        <div className="card p-6 space-y-4">
          <Skeleton width="100%" height="240px" className="rounded-xl" />
        </div>
      </div>
    );
  }

  // ─── Error & Empty States ──────────────────────────────────────────────────
  if (error || !customer) {
    return (
      <div className="p-8 text-center" role="alert">
        <AlertCircle size={44} className="mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">{error || 'Customer not found'}</h2>
        <button
          onClick={() => navigate('/reports/pending')}
          className="mt-4 inline-flex items-center gap-2 text-primary font-bold hover:underline"
        >
          <ArrowLeft size={16} /> Back to Pending Payments
        </button>
      </div>
    );
  }

  if (activeSales.length === 0) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={44} className="mx-auto text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">No active plot sales for this customer</h2>
        <p className="text-sm text-slate-500 mt-1">This customer does not have any active property sales registered.</p>
        <button
          onClick={() => navigate('/reports/pending')}
          className="mt-4 inline-flex items-center gap-2 text-primary font-bold hover:underline"
        >
          <ArrowLeft size={16} /> Back to Pending Payments
        </button>
      </div>
    );
  }

  const st = statementData!;

  // Severity badge
  const renderSeverityBadge = () => {
    if (st.kpis.overdueCount > 0) {
      if (st.summary.maxDaysOverdue >= 90) {
        return (
          <span className="px-2.5 py-1 bg-red-600 text-white text-xs font-black tracking-wide rounded-full shadow-sm">
            CRITICAL ({st.summary.maxDaysOverdue}d)
          </span>
        );
      }
      return (
        <span className="px-2.5 py-1 bg-rose-500 text-white text-xs font-bold rounded-full shadow-sm">
          OVERDUE
        </span>
      );
    }
    if (st.kpis.pendingCount > 0) {
      return (
        <span className="px-2.5 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-full shadow-sm">
          UPCOMING
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full shadow-sm">
        ALL CLEAR
      </span>
    );
  };

  return (
    <div className="space-y-5 pb-24 max-w-[1440px] mx-auto">
      {/* ─── Breadcrumb & Title Bar ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reports/pending')}
            className="p-2 hover:bg-slate-200/80 rounded-xl text-slate-600 transition-colors"
            aria-label="Back to pending payments report"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <PageHeader
              title="Customer Ledger"
              subtitle="Comprehensive account statement, installment timeline & receipts"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-time
          </span>
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
            aria-label="Print Customer Ledger Statement"
          >
            <Printer size={14} className="text-slate-500" /> Print Statement
          </button>
        </div>
      </div>

      {/* ─── Incomplete Schedule Banner (Retained from P0-1) ───────────────── */}
      {incompleteSales.length > 0 && (
        <div className="space-y-2">
          {incompleteSales.map(({ sale, actualTotal, expectedTotal, actualCount, expectedCount }) => (
            <div
              key={sale.id}
              className="p-4 rounded-xl bg-red-600 text-white font-semibold flex items-center justify-between gap-3 shadow-md"
              role="alert"
            >
              <div className="flex items-center gap-3">
                <ShieldAlert size={24} className="flex-shrink-0 text-white" />
                <div>
                  <p className="text-sm font-bold tracking-wide">
                    Schedule incomplete: scheduled Rs {actualTotal.toLocaleString('en-PK')} of Rs {expectedTotal.toLocaleString('en-PK')}
                  </p>
                  <p className="text-xs text-red-100 font-normal mt-0.5">
                    Sale {sale.saleNumber || sale.id.slice(0, 8)}: database contains {actualCount} installments (expected {expectedCount}).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/settings/data-health')}
                className="px-3.5 py-1.5 rounded-lg bg-white text-red-700 text-xs font-bold hover:bg-red-50 flex-shrink-0 transition-colors shadow-sm"
              >
                Data Health
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Requirement a: Sticky Summary Header ──────────────────────────── */}
      <header
        className="sticky top-[var(--navbar-h-mobile)] sm:top-[var(--navbar-h-desktop)] z-20 bg-gradient-to-r from-[#0d1f3c] via-[#1a3c6e] to-[#0f2a52] text-white shadow-xl rounded-2xl p-4 sm:p-6 border border-white/10 backdrop-blur-md transition-all"
        aria-label="Customer ledger summary header"
      >
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
          {/* Customer Identification */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 flex items-center justify-center text-xl sm:text-2xl font-black border border-white/20 text-white shadow-inner flex-shrink-0">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">{customer.name}</h1>
                {renderSeverityBadge()}
              </div>

              <p className="text-blue-200 text-xs sm:text-sm mt-0.5 flex flex-wrap items-center gap-x-2">
                <span>S/O {customer.fatherName || '—'}</span>
                <span>•</span>
                <span className="font-mono text-xs opacity-80">{customer.customerId}</span>
                <span>•</span>
                <span>CNIC: {customer.cnic}</span>
              </p>

              {/* Phone, WhatsApp, City contact strip */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <a
                  href={`tel:${customer.phone}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg border border-white/15 transition-colors"
                  aria-label={`Call customer at ${customer.phone}`}
                >
                  <Phone size={12} className="text-emerald-400" />
                  {customer.phone}
                </a>

                <button
                  type="button"
                  onClick={handleWhatsApp}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold rounded-lg border border-emerald-500/30 transition-colors"
                  aria-label="Send reminder via WhatsApp"
                >
                  <MessageCircle size={12} className="text-emerald-400" />
                  WhatsApp
                </button>

                <span className="text-xs text-blue-200/80 px-1">
                  City: {customer.city || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Balance, Next Due & Prominent Action Button */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 border-white/10 pt-3 lg:pt-0">
            {/* Large Remaining Balance */}
            <div className="text-left lg:text-right">
              <p className="text-[11px] uppercase tracking-wider text-blue-200 font-bold">Remaining Balance</p>
              <p className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight">
                {formatCurrency(st.summary.remainingBalance)}
              </p>
              <p className="text-[11px] text-blue-200/80 mt-0.5">
                {nextUnpaidInstallment ? (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={11} className="text-amber-300" />
                    Next: {formatDate(nextUnpaidInstallment.dueDate)} ({formatCurrency(nextUnpaidInstallment.outstanding)})
                  </span>
                ) : (
                  <span className="text-emerald-300 font-semibold">All installments cleared</span>
                )}
              </p>
            </div>

            {/* Prominent Receive Payment Button */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleReceivePaymentClick}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm transform hover:-translate-y-0.5 active:translate-y-0"
                aria-label="Receive payment for this customer"
                id="btn-ledger-receive-payment"
              >
                <DollarSign size={16} className="text-slate-950 stroke-[3]" />
                Receive Payment
              </button>

              <button
                type="button"
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="text-[11px] text-blue-200/90 hover:text-white text-center hover:underline"
              >
                View full profile
              </button>
            </div>
          </div>
        </div>

        {/* Header Secondary Row: Plot Chips & Progress Bar */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Plot Scope Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-xs text-blue-200 font-semibold mr-1">Plots:</span>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                scope === 'all'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              All Plots ({activeSales.length})
            </button>
            {activeSales.map(s => {
              const p = plots.find(pl => pl.id === s.plotId);
              const label = p ? `${p.plotNumber} - ${p.block}` : `Sale ${s.saleNumber}`;
              const isSelected = scope === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScope(s.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Progress Bar: Paid x% of Rs Total */}
          <div className="w-full md:w-80 flex-shrink-0">
            <div className="flex justify-between items-center text-xs mb-1 font-bold">
              <span className="text-blue-100">
                Paid {st.summary.percentPaid}% of {formatCurrency(st.summary.finalPrice)}
              </span>
              <span className="text-emerald-300 font-bold">
                {formatCurrency(st.summary.totalReceived)}
              </span>
            </div>
            <div className="h-2 bg-slate-950/40 rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, st.summary.percentPaid))}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ─── Requirement b: 4 KPI Tiles (Toggle Filters) ───────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Overdue Count */}
        <button
          type="button"
          onClick={() => handleToggleKpiFilter('overdue')}
          aria-pressed={statusFilter === 'overdue'}
          className={`card text-left border-l-4 cursor-pointer transition-all p-4 ${
            statusFilter === 'overdue'
              ? 'ring-2 ring-red-500 bg-red-50/40 shadow-md'
              : 'hover:bg-slate-50 hover:shadow-sm'
          }`}
          style={{ borderLeftColor: '#ef4444' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue</p>
            <div className="p-1.5 bg-red-100 rounded-lg text-red-600">
              <AlertCircle size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600">{st.kpis.overdueCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {statusFilter === 'overdue' ? 'Active filter (click to reset)' : 'Click to filter overdue rows'}
          </p>
        </button>

        {/* KPI 2: Overdue Amount */}
        <button
          type="button"
          onClick={() => handleToggleKpiFilter('overdue')}
          aria-pressed={statusFilter === 'overdue'}
          className={`card text-left border-l-4 cursor-pointer transition-all p-4 ${
            statusFilter === 'overdue'
              ? 'ring-2 ring-red-500 bg-red-50/40 shadow-md'
              : 'hover:bg-slate-50 hover:shadow-sm'
          }`}
          style={{ borderLeftColor: '#ef4444' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue Amount</p>
            <div className="p-1.5 bg-red-100 rounded-lg text-red-600">
              <TrendingDown size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600">{formatCurrency(st.kpis.overdueAmount)}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {statusFilter === 'overdue' ? 'Active filter' : 'Click to filter'}
          </p>
        </button>

        {/* KPI 3: Pending Count */}
        <button
          type="button"
          onClick={() => handleToggleKpiFilter('pending')}
          aria-pressed={statusFilter === 'pending'}
          className={`card text-left border-l-4 cursor-pointer transition-all p-4 ${
            statusFilter === 'pending'
              ? 'ring-2 ring-amber-500 bg-amber-50/40 shadow-md'
              : 'hover:bg-slate-50 hover:shadow-sm'
          }`}
          style={{ borderLeftColor: '#f59e0b' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending</p>
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600">{st.kpis.pendingCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {statusFilter === 'pending' ? 'Active filter (click to reset)' : 'Click to filter pending rows'}
          </p>
        </button>

        {/* KPI 4: Pending Amount */}
        <button
          type="button"
          onClick={() => handleToggleKpiFilter('pending')}
          aria-pressed={statusFilter === 'pending'}
          className={`card text-left border-l-4 cursor-pointer transition-all p-4 ${
            statusFilter === 'pending'
              ? 'ring-2 ring-amber-500 bg-amber-50/40 shadow-md'
              : 'hover:bg-slate-50 hover:shadow-sm'
          }`}
          style={{ borderLeftColor: '#f59e0b' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Amount</p>
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
              <CreditCard size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600">{formatCurrency(st.kpis.pendingAmount)}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {statusFilter === 'pending' ? 'Active filter' : 'Click to filter'}
          </p>
        </button>
      </div>

      {/* ─── Requirement d: Recharts Area Chart ────────────────────────────── */}
      <div className="card p-5 border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              Scheduled vs Paid Over Time
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cumulative financial trajectory from booking to plan completion
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              Scheduled ({formatCurrency(st.summary.finalPrice)})
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              Paid ({formatCurrency(st.summary.totalReceived)})
            </span>
          </div>
        </div>

        {chartPoints.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="ledgerColorScheduled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="ledgerColorPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  tickFormatter={(v) => `Rs ${(v / 1000).toLocaleString('en-PK')}k`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={75}
                />
                <RechartsTooltip
                  formatter={(value: any, name: any) => [
                    formatCurrency(Number(value) || 0),
                    name === 'paid' ? 'Cumulative Paid' : 'Cumulative Scheduled',
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                    borderColor: '#cbd5e1',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="scheduled"
                  name="scheduled"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#ledgerColorScheduled)"
                />
                <Area
                  type="monotone"
                  dataKey="paid"
                  name="paid"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#ledgerColorPaid)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 text-sm">
            No schedule milestones recorded for chart projection
          </div>
        )}
      </div>

      {/* ─── Requirement c: Tabs (3 Tabs) ──────────────────────────────────── */}
      <div className="card p-0 overflow-hidden border border-slate-200">
        {/* Tab Bar */}
        <div
          className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto"
          role="tablist"
          aria-label="Customer ledger view tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'schedule'}
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 min-w-[160px] py-3.5 px-4 font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'schedule'
                ? 'bg-white text-primary border-b-2 border-primary shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            id="tab-btn-schedule"
          >
            <Calendar size={16} />
            Installment Schedule ({st.rows.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'payments'}
            onClick={() => setActiveTab('payments')}
            className={`flex-1 min-w-[160px] py-3.5 px-4 font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'payments'
                ? 'bg-white text-primary border-b-2 border-primary shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            id="tab-btn-payments"
          >
            <Receipt size={16} />
            Payment Receipts ({paymentReceipts.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'statement'}
            onClick={() => setActiveTab('statement')}
            className={`flex-1 min-w-[160px] py-3.5 px-4 font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'statement'
                ? 'bg-white text-primary border-b-2 border-primary shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            id="tab-btn-statement"
          >
            <CreditCard size={16} />
            Financial Statement ({st.statement.length})
          </button>
        </div>

        {/* ─── TAB 1: SCHEDULE ─────────────────────────────────────────────── */}
        {activeTab === 'schedule' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search box */}
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search installments (no., due date, amount, receipt)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  aria-label="Search installments"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Status chips + Show unpaid only switch */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status chips */}
                <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('overdue')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      statusFilter === 'overdue' ? 'bg-red-600 text-white font-bold' : 'text-red-700 hover:bg-red-50'
                    }`}
                  >
                    Overdue
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('due_soon')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      statusFilter === 'due_soon' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    Due Soon
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      statusFilter === 'pending' ? 'bg-slate-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('paid')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      statusFilter === 'paid' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    Paid
                  </button>
                </div>

                {/* Show Unpaid Only switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={showUnpaidOnly}
                  onClick={() => setShowUnpaidOnly(prev => !prev)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    showUnpaidOnly
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${showUnpaidOnly ? 'bg-slate-950 text-white' : 'bg-slate-300 text-transparent'}`}>
                    ✓
                  </span>
                  Show unpaid only
                </button>
              </div>
            </div>

            {/* Virtualized Timeline Container */}
            {virtualScheduleItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Calendar size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">No installments match your filters</p>
                <button
                  onClick={() => { setStatusFilter('all'); setShowUnpaidOnly(false); setSearchQuery(''); }}
                  className="mt-2 text-xs text-primary font-bold hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div
                ref={scheduleScrollParentRef}
                className="overflow-y-auto max-h-[640px] relative border border-slate-200 rounded-xl bg-white shadow-inner divide-y divide-slate-100"
                tabIndex={0}
                role="region"
                aria-label="Virtualized installment schedule timeline"
              >
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map(vItem => {
                    const item = virtualScheduleItems[vItem.index];
                    if (!item) return null;

                    if (item.kind === 'year_header') {
                      return (
                        <div
                          key={item.id}
                          data-index={vItem.index}
                          ref={virtualizer.measureElement}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${vItem.start}px)`,
                          }}
                          className="bg-slate-100/90 backdrop-blur-xs px-4 py-2 border-y border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700 z-10"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-primary" />
                            <span className="text-sm font-black text-slate-900">Year {item.year}</span>
                            <span className="text-slate-500 font-medium">({item.count} installments)</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-semibold">
                            <span>Due: {formatCurrency(item.totalDue)}</span>
                            <span className="text-emerald-700">Paid: {formatCurrency(item.totalPaid)}</span>
                            {item.overdueCount > 0 && (
                              <span className="text-red-600 font-bold">({item.overdueCount} overdue)</span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Render Schedule Row Item
                    const r = item.row;
                    const status = item.statusKind;

                    return (
                      <div
                        key={item.id}
                        data-index={vItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${vItem.start}px)`,
                        }}
                        className={`p-3 sm:px-4 border-b border-slate-100 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          status === 'overdue'
                            ? 'bg-red-50/30 hover:bg-red-50/50'
                            : status === 'due_soon'
                            ? 'bg-amber-50/30 hover:bg-amber-50/50'
                            : status === 'paid'
                            ? 'bg-emerald-50/20 hover:bg-emerald-50/40 text-slate-600'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Month Timeline & Labels */}
                        <div className="flex items-start sm:items-center gap-3">
                          {/* Month Timeline Badge */}
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center flex-shrink-0 text-center">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              {item.monthLabel}
                            </span>
                            <span className="text-xs font-black text-slate-800">
                              {r.dueDate ? new Date(r.dueDate).getDate() : '—'}
                            </span>
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{r.label}</span>
                              {scope === 'all' && (
                                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                  {r.plotLabel}
                                </span>
                              )}
                              {item.isSemiAnnual && (
                                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-xs">
                                  <Sparkles size={11} className="text-amber-600" />
                                  {item.semiAnnualBadge || 'Semi-Annual'}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-500 mt-0.5">
                              Due: <span className="font-medium text-slate-700">{formatDate(r.dueDate)}</span>
                              {status === 'paid' && r.paymentDate && (
                                <span className="text-emerald-700 font-medium ml-2">
                                  • Paid on {formatDate(r.paymentDate)}
                                  {r.receiptNumber && ` (Rec #${r.receiptNumber})`}
                                </span>
                              )}
                              {status === 'overdue' && (
                                <span className="text-red-600 font-semibold ml-2">
                                  • {r.daysOverdue} days overdue
                                </span>
                              )}
                              {status === 'due_soon' && (
                                <span className="text-amber-700 font-semibold ml-2">
                                  • Due {r.daysUntilDue === 0 ? 'today' : `in ${r.daysUntilDue} days`}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Financial Figures & Status Chip */}
                        <div className="flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto">
                          <div className="text-left sm:text-right">
                            <div className="text-xs text-slate-500">
                              Amount: <span className="font-bold text-slate-900">{formatCurrency(r.amountDue)}</span>
                            </div>
                            {r.outstanding > 0 ? (
                              <div className="text-xs font-bold text-red-600">
                                Outstanding: {formatCurrency(r.outstanding)}
                              </div>
                            ) : (
                              <div className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1">
                                <Check size={12} /> Cleared
                              </div>
                            )}
                          </div>

                          {/* Status Chip */}
                          <div className="min-w-[90px] text-right">
                            {status === 'paid' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-full">
                                <CheckCircle size={12} className="text-emerald-600" /> Paid
                              </span>
                            )}
                            {status === 'overdue' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 text-xs font-bold rounded-full">
                                <AlertCircle size={12} className="text-red-600" /> Overdue
                              </span>
                            )}
                            {status === 'due_soon' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-full">
                                <Clock size={12} className="text-amber-700" /> Due Soon
                              </span>
                            )}
                            {status === 'upcoming' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-full">
                                Upcoming
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: PAYMENTS (Receipts) ─────────────────────────────────── */}
        {activeTab === 'payments' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Payment Summary Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Completed Payment Receipts</h3>
                  <p className="text-xs text-slate-500">
                    Total {paymentReceipts.length} receipts verified across booking advances, down payments, and installments
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-500 uppercase">Total Received</p>
                <p className="text-xl font-black text-emerald-600">{formatCurrency(st.summary.totalReceived)}</p>
              </div>
            </div>

            {/* Search Input for Payments */}
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search payments by receipt #, method, bank, amount..."
                value={paymentsSearchQuery}
                onChange={(e) => setPaymentsSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                aria-label="Search payment receipts"
              />
            </div>

            {/* Desktop Table & Mobile Cards */}
            {filteredPayments.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Receipt size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">No payment receipts found</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="table-th">Receipt #</th>
                      <th className="table-th">Date</th>
                      <th className="table-th">Type / Description</th>
                      <th className="table-th">Plot</th>
                      <th className="table-th">Method & Reference</th>
                      <th className="table-th text-right">Amount Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-slate-800">
                          {p.receiptNumber}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {formatDate(p.date)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {p.description}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {p.plotLabel}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span className="font-medium text-slate-800">{p.paymentMethod}</span>
                          {(p.bankName || p.chequeNumber) && (
                            <span className="text-slate-500 block text-[11px]">
                              {p.bankName} {p.chequeNumber ? `• ${p.chequeNumber}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600">
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 sticky bottom-0 border-t border-slate-200">
                    <tr>
                      <td colSpan={5} className="py-3 px-4 font-bold text-right uppercase text-xs">
                        Total Verified Payments
                      </td>
                      <td className="py-3 px-4 font-black text-right text-emerald-600">
                        {formatCurrency(filteredPayments.reduce((s, p) => s + p.amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: RUNNING STATEMENT ────────────────────────────────────── */}
        {activeTab === 'statement' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
              <span>Financial Ledger: Running balance calculation after each debit and credit event</span>
              <span className="font-bold text-slate-800">
                Net Ending Balance: {formatCurrency(st.summary.remainingBalance)}
              </span>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">Reference / Method</th>
                    <th className="table-th text-right text-red-600">Debit (Rs)</th>
                    <th className="table-th text-right text-emerald-600">Credit (Rs)</th>
                    <th className="table-th text-right">Running Balance (Rs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {st.statement.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400">
                        No financial transactions on record
                      </td>
                    </tr>
                  ) : (
                    st.statement.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(tx.date)}</td>
                        <td className="py-3 px-4 font-medium text-slate-800">{tx.description}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500">
                          {tx.reference || tx.method || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-red-600">
                          {tx.debit > 0 ? formatCurrency(tx.debit) : ''}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-emerald-600">
                          {tx.credit > 0 ? formatCurrency(tx.credit) : ''}
                        </td>
                        <td className="py-3 px-4 text-right font-bold bg-slate-50/50">
                          {formatCurrency(tx.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 sticky bottom-0 border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="py-3 px-4 font-bold text-right uppercase text-xs">
                      Totals
                    </td>
                    <td className="py-3 px-4 font-bold text-right text-red-600">
                      {formatCurrency(st.statement.reduce((s, t) => s + t.debit, 0))}
                    </td>
                    <td className="py-3 px-4 font-bold text-right text-emerald-600">
                      {formatCurrency(st.statement.reduce((s, t) => s + t.credit, 0))}
                    </td>
                    <td className="py-3 px-4 font-black text-right text-primary bg-slate-100">
                      {formatCurrency(st.summary.remainingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerLedger;
