import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Home, CheckCircle, Clock, BookOpen, DollarSign,
  TrendingDown, MessageCircle, AlertCircle,
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import { StatCardSkeleton } from '../components/ui/Skeleton';
import { getCollection } from '../firebase/firestore';
import {  formatCurrency, formatDate, getDaysOverdue, getWhatsAppUrl , isInstallmentOverdue, getOutstanding } from '../utils/formatters';
import type { Plot, Installment, Sale, Customer } from '../types';
import { isAfter, addDays, isBefore, addMonths, subMonths, format } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const PIE_COLORS = ['#22c55e', '#e8a020', '#3b82f6', '#ef4444'];

const Dashboard: React.FC = () => {
  const [plots,        setPlots]        = useState<Plot[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading,      setLoading]      = useState(true);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'monthly'>('overview');
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  useEffect(() => {
    gsap.fromTo(".list-item-anim", { opacity: 0, y: 15 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.4, ease: 'power2.out', delay: 0.2 });
  }, [activeTab, installments]);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, i, s, c] = await Promise.all([
          getCollection<Plot>('plots'),
          getCollection<Installment>('installments'),
          getCollection<Sale>('sales'),
          getCollection<Customer>('customers'),
        ]);
        setPlots(p);
        setInstallments(i);
        setCustomers(c);
        setSales(s);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /* ── Stats ── */
  const totalPlots     = plots.length;
  const soldPlots      = plots.filter(p => p.status === 'sold').length;
  const availablePlots = plots.filter(p => p.status === 'available').length;
  const bookedPlots    = plots.filter(p => p.status === 'booked').length;

  const activeSalesDocs = sales.filter(s => s.status !== 'cancelled');
  const activeSaleIds = activeSalesDocs.map(s => s.id);

  // Total collection includes: paid regular installments + booking amount paid + down payment received
  const paidInstCollection = installments
    .filter(i => i.status === 'paid' && i.type !== 'down_payment')
    .reduce((s, i) => s + (i.amountPaid || 0), 0);
  const bookingCollection = activeSalesDocs.reduce((s, sale) => s + (sale.bookingAmountPaid || 0), 0);
  const dpCollection = activeSalesDocs.reduce((s, sale) => s + (sale.downPaymentReceived || 0), 0);
  const totalCollection = paidInstCollection + bookingCollection + dpCollection;

  // Pending installments amount (strictly exclude down payments)
  const pendingAmount = installments
    .filter(i => (i.status === 'pending' || i.status === 'overdue') && i.type !== 'down_payment' && activeSaleIds.includes(i.saleId))
    .reduce((s, i) => s + getOutstanding(i), 0);

  const overdueInsts = installments.filter(i => activeSaleIds.includes(i.saleId) && i.type !== 'down_payment' && isInstallmentOverdue(i));
  const overdueAmount = overdueInsts.reduce((s, i) => s + getOutstanding(i), 0);

  const now   = new Date();
  const next7 = addDays(now, 7);
  const upcoming = installments.filter(i =>
    i.type !== 'down_payment' &&
    i.status === 'pending' && i.dueDate &&
    isAfter(new Date(i.dueDate), now) && isBefore(new Date(i.dueDate), next7)
  );

  /* ── Monthly bar chart ── */
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const month = d.toLocaleString('default', { month: 'short' });
    const m = d.getMonth(); const y = d.getFullYear();
    const total = installments
      .filter(inst => {
        if (inst.status !== 'paid' || !inst.paymentDate) return false;
        const pd = new Date(inst.paymentDate);
        return pd.getMonth() === m && pd.getFullYear() === y;
      })
      .reduce((s, inst) => s + (inst.amountPaid || 0), 0);
    return { month, amount: total };
  });

  /* ── Pie ── */
  const pieData = [
    { name: 'Available', value: availablePlots },
    { name: 'Booked',    value: bookedPlots },
    { name: 'Sold',      value: soldPlots },
    { name: 'Cancelled', value: plots.filter(p => p.status === 'cancelled').length },
  ].filter(d => d.value > 0);

  /* ── Recent payments ── */
  const recentPayments = [...installments]
    .filter(i => i.status === 'paid' && i.paymentDate)
    .sort((a, b) => new Date(b.paymentDate!).getTime() - new Date(a.paymentDate!).getTime())
    .slice(0, 10);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const customerPhone = (id: string) => customers.find(c => c.id === id)?.whatsapp || customers.find(c => c.id === id)?.phone;
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} · ${p.block}` : '—';
  };

  const iconStyle = { color: 'white' };

  /* ── Monthly Collection Tab ── */
  const mStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const mEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59);
  
  const monthlyInsts = installments.filter(i => {
    if (!i.dueDate) return false;
    const d = new Date(i.dueDate);
    return d >= mStart && d <= mEnd;
  }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const expectedMonthly = monthlyInsts.reduce((s, i) => s + i.amountDue, 0);
  const receivedMonthly = monthlyInsts.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amountPaid || 0), 0);
  const pendingMonthly = monthlyInsts.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amountDue - (i.amountPaid || 0)), 0);

  const semiAnnualDueMonthly = monthlyInsts.filter(i => i.type === 'semi_annual' && i.status !== 'paid');
  const downPaymentDueMonthly = monthlyInsts.filter(i => i.type === 'down_payment' && i.status !== 'paid');
  const onPossessionDueMonthly = monthlyInsts.filter(i => i.type === 'on_possession' && i.status !== 'paid');

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Dashboard</h1>
        <p className="text-slate-500 text-xs mt-0.5">Welcome back — here's your real estate overview</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'monthly' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Monthly Collection
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* ── Row 1: Plot stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Total Plots"     value={totalPlots}     icon={<Home     size={22} style={iconStyle} />} index={0} trend={`${totalPlots} registered`} trendUp />
            <StatCard title="Sold Plots"      value={soldPlots}      icon={<CheckCircle size={22} style={iconStyle} />} index={1} />
            <StatCard title="Available"       value={availablePlots} icon={<Home     size={22} style={iconStyle} />} index={2} />
            <StatCard title="Booked"          value={bookedPlots}    icon={<BookOpen size={22} style={iconStyle} />} index={3} />
          </>
        )}
      </div>

      {/* ── Row 2: Financial ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Total Collection"     value={formatCurrency(totalCollection)} icon={<DollarSign  size={22} style={iconStyle} />} index={4} trendUp trend="all time" />
            <StatCard title="Pending Installments" value={formatCurrency(pendingAmount)}   icon={<Clock       size={22} style={iconStyle} />} index={5} />
            <StatCard title="Overdue Amount"       value={formatCurrency(overdueAmount)}   icon={<TrendingDown size={22} style={iconStyle} />} index={6} trend={`${overdueInsts.length} installments`} />
          </>
        )}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="card lg:col-span-2"
        >
          <h3 className="font-bold text-primary text-sm mb-4">Monthly Collection — Last 6 Months</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v)} />
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-expect-error recharts formatter type */}
              <Tooltip formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Collection']}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Bar dataKey="amount" fill="#1a3c6e" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Pie chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="card"
        >
          <h3 className="font-bold text-primary text-sm mb-4">Plot Status</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={52} outerRadius={76} paddingAngle={4} dataKey="value">
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">No data yet</div>
          )}
        </motion.div>
      </div>

      {/* ── Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Overdue */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#fee2e2' }}>
              <AlertCircle size={15} style={{ color: '#b91c1c' }} />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Overdue Installments</h3>
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#b91c1c' }}>
              {overdueInsts.length}
            </span>
          </div>

          {overdueInsts.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-3xl"><CheckCircle size={32} className="text-green-500" /></span>
              <p className="text-slate-400 text-sm mt-2">No overdue installments!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {overdueInsts.slice(0, 8).map(inst => {
                const customer = customers.find(c => c.id === inst.customerId);
                const days = getDaysOverdue(new Date(inst.dueDate));
                const waMsg = `Assalam-o-Alaikum ${customer?.name || ''},\n\nAapki plot ${plotInfo(inst.plotId)} ki qist baqi hai:\nAmount: ${formatCurrency(inst.amountDue)}\nDue Date: ${formatDate(inst.dueDate)}\nDays Overdue: ${days} days\n\nMeherbani farma ke jald payment karein.\n\nFaisal Homes`;
                return (
                  <div key={inst.id} className="list-item-anim flex items-center justify-between p-3 rounded-xl"
                    style={{ background: '#fff5f5', border: '1px solid #fecaca' }}>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{customerName(inst.customerId)}</p>
                      <p className="text-xs text-slate-500">{plotInfo(inst.plotId)} · {formatCurrency(inst.amountDue)}</p>
                      <p className="text-[11px] font-bold mt-0.5" style={{ color: '#b91c1c' }}>{days} days overdue</p>
                    </div>
                    {customer?.whatsapp && (
                      <a href={getWhatsAppUrl(customer.whatsapp, waMsg)} target="_blank" rel="noopener noreferrer"
                        className="btn-icon hover:bg-green-50 text-green-600 flex-shrink-0" title="WhatsApp reminder">
                        <MessageCircle size={16} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#fef3c7' }}>
              <Clock size={15} style={{ color: '#b45309' }} />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Upcoming (Next 7 Days)</h3>
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#b45309' }}>
              {upcoming.length}
            </span>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-3xl"><CheckCircle size={32} className="text-green-500" /></span>
              <p className="text-slate-400 text-sm mt-2">No upcoming installments</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {upcoming.slice(0, 8).map(inst => (
                <div key={inst.id} className="list-item-anim flex items-center justify-between p-3 rounded-xl"
                  style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{customerName(inst.customerId)}</p>
                    <p className="text-xs text-slate-500">{plotInfo(inst.plotId)} · {formatCurrency(inst.amountDue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold" style={{ color: '#b45309' }}>{formatDate(inst.dueDate)}</p>
                    <p className="text-[11px] text-slate-400">#{inst.installmentNumber}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent payments ── */}
      <div className="card">
        <h3 className="font-bold text-primary text-sm mb-4">Recent Payments</h3>
        {recentPayments.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No payments recorded yet</div>
        ) : (
          <>
            {/* Mobile Card List (< md) */}
            <div className="md:hidden space-y-3">
              {recentPayments.map(p => (
                <div key={p.id} className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs text-primary font-bold">{p.receiptNumber || 'Receipt'}</span>
                    <span className="font-bold text-sm text-green-700">{formatCurrency(p.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{customerName(p.customerId)}</span>
                    <span>{plotInfo(p.plotId)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-200/60">
                    <span>Inst #{p.installmentNumber} - {formatDate(p.paymentDate)}</span>
                    <StatusBadge status={p.paymentMethod || 'cash'} size="sm" />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
              <thead>
                <tr>
                  {['Receipt #', 'Customer', 'Plot', 'Inst #', 'Amount', 'Date', 'Method'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="table-row"
                  >
                    <td className="table-td">
                      <span className="font-mono text-xs text-primary font-semibold">{p.receiptNumber || '—'}</span>
                    </td>
                    <td className="table-td font-medium">{customerName(p.customerId)}</td>
                    <td className="table-td">{plotInfo(p.plotId)}</td>
                    <td className="table-td">#{p.installmentNumber}</td>
                    <td className="table-td font-semibold" style={{ color: '#15803d' }}>{formatCurrency(p.amountPaid)}</td>
                    <td className="table-td">{formatDate(p.paymentDate)}</td>
                    <td className="table-td">
                      <StatusBadge status={p.paymentMethod || 'cash'} size="sm" />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      </div>
      )}

      {activeTab === 'monthly' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 card bg-slate-50">
            <h3 className="font-bold text-primary text-base sm:text-lg flex items-center gap-2">
              <Calendar size={20} />
              This Month's Expected Collection
            </h3>
            <div className="flex items-center justify-between sm:justify-end gap-4">
              <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="btn-icon">
                <ChevronLeft size={20} />
              </button>
              <span className="font-extrabold text-base sm:text-xl w-36 sm:w-40 text-center text-slate-800">
                {format(selectedMonth, 'MMMM yyyy')}
              </span>
              <button onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} className="btn-icon">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center border-none bg-blue-50">
              <p className="text-xs font-bold text-blue-600 mb-1 uppercase tracking-wider">Expected This Month</p>
              <p className="text-3xl font-extrabold text-blue-900">{formatCurrency(expectedMonthly)}</p>
              <p className="text-xs text-blue-500 mt-2">({monthlyInsts.length} total installments)</p>
            </div>
            <div className="card text-center border-none bg-green-50">
              <p className="text-xs font-bold text-green-600 mb-1 uppercase tracking-wider">Received So Far</p>
              <p className="text-3xl font-extrabold text-green-900">{formatCurrency(receivedMonthly)}</p>
              <p className="text-xs text-green-500 mt-2">({monthlyInsts.filter(i => i.status === 'paid').length} collected)</p>
            </div>
            <div className="card text-center border-none bg-amber-50">
              <p className="text-xs font-bold text-amber-600 mb-1 uppercase tracking-wider">Still Pending</p>
              <p className="text-3xl font-extrabold text-amber-900">{formatCurrency(pendingMonthly)}</p>
              <p className="text-xs text-amber-500 mt-2">({monthlyInsts.filter(i => i.status !== 'paid').length} remaining)</p>
            </div>
          </div>

          <div className="card p-5 bg-white border border-slate-200">
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between items-center py-1">
                <span>PLUS Semi-Annual Due:</span>
                <span className="font-semibold text-primary">
                  {formatCurrency(semiAnnualDueMonthly.reduce((s,i) => s + i.amountDue, 0))}
                  <span className="text-xs font-normal text-slate-400 ml-2">({semiAnnualDueMonthly.length} due)</span>
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>PLUS Down Payments Due:</span>
                <span className="font-semibold text-primary">
                  {formatCurrency(downPaymentDueMonthly.reduce((s,i) => s + i.amountDue, 0))}
                  <span className="text-xs font-normal text-slate-400 ml-2">({downPaymentDueMonthly.length} remaining)</span>
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>PLUS On-Possession Due:</span>
                <span className="font-semibold text-primary">
                  {formatCurrency(onPossessionDueMonthly.reduce((s,i) => s + i.amountDue, 0))}
                  <span className="text-xs font-normal text-slate-400 ml-2">({onPossessionDueMonthly.length} remaining)</span>
                </span>
              </div>
            </div>
            <div className="border-t border-slate-200 mt-3 pt-3 flex justify-between items-center">
              <span className="font-bold text-slate-800">TOTAL PENDING THIS MONTH:</span>
              <span className="text-2xl font-extrabold text-red-600">{formatCurrency(pendingMonthly)}</span>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold text-primary text-sm mb-4">Detail Table</h3>
            {monthlyInsts.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No installments due this month</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Plot</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlyInsts.map(inst => {
                      const cName = customerName(inst.customerId);
                      const phone = customerPhone(inst.customerId);
                      const waMsg = `Assalam-o-Alaikum ${cName},\n\nAapki plot ${plotInfo(inst.plotId)} ki qist due hai:\nAmount: ${formatCurrency(inst.amountDue)}\nDue Date: ${formatDate(inst.dueDate)}\n\nMeherbani farma ke jald payment karein.\n\nFaisal Homes`;
                      return (
                        <tr key={inst.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{cName}</td>
                          <td className="px-4 py-3 text-slate-600">{plotInfo(inst.plotId)}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {inst.type === 'semi_annual' ? '⭐ Semi-Annual' : 
                             inst.type === 'down_payment' ? 'Down Payment' : 
                             inst.type === 'on_possession' ? 'On-Possession' : 
                             `Monthly #${inst.installmentNumber}`}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-700">{formatCurrency(inst.amountDue)}</td>
                          <td className="px-4 py-3">
                            {inst.status === 'paid' ? (
                              <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle size={14} /> Paid</span>
                            ) : (
                              <span className="text-amber-500 font-semibold flex items-center gap-1"><Clock size={14} /> Pending</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {inst.status !== 'paid' && phone && (
                              <a 
                                href={getWhatsAppUrl(phone, waMsg)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 text-xs font-semibold rounded hover:bg-green-100"
                              >
                                <MessageCircle size={14} /> WhatsApp
                              </a>
                            )}
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
      )}
    </div>
  );
};

export default Dashboard;
