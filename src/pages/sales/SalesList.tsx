import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import {
  FileText, Printer, Search, Eye, Plus, BookOpen,
  Receipt, X, ChevronRight, User, Home, DollarSign,
  Calendar, Phone, ShieldCheck, Handshake, Filter,
  ArrowUpDown, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection, getDocument } from '../../firebase/firestore';
import { where } from 'firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { consolidateSaleInstallments } from '../../utils/saleCalc';
import { printContent, generatePlotAgreement, generateInstallmentSchedule } from '../../utils/printUtils';
import type { Sale, Customer, Plot, Installment, CompanySettings, Dealer } from '../../types';
import { useScrollLock } from '../../hooks/useScrollLock';

export default function SalesList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const querySaleId = searchParams.get('saleId') || '';

  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'price_desc' | 'price_asc'>('date_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Drawer state
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useScrollLock(!!selectedSale);

  useEffect(() => {
    if (!selectedSale) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSale]);

  // Load all data
  useEffect(() => {
    Promise.all([
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getCollection<Dealer>('dealers'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([s, c, p, d, comp]) => {
      setSales(s);
      setCustomers(c);
      setPlots(p);
      setDealers(d);
      if (comp) setCompany(comp);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      toast.error('Failed to load sales data');
      setLoading(false);
    });
  }, []);

  // When sales load, if querySaleId is provided, open drawer
  useEffect(() => {
    if (querySaleId && sales.length > 0) {
      const match = sales.find(s => s.id === querySaleId);
      if (match) {
        setSelectedSale(match);
      }
    }
  }, [querySaleId, sales]);

  // Drawer animation
  useEffect(() => {
    if (selectedSale && drawerRef.current && backdropRef.current) {
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.25, ease: 'power2.out' }
      );
      gsap.fromTo(
        drawerRef.current,
        { x: '100%' },
        { x: '0%', duration: 0.35, ease: 'power3.out' }
      );
    }
  }, [selectedSale]);

  const closeDrawer = () => {
    if (drawerRef.current && backdropRef.current) {
      gsap.to(backdropRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' });
      gsap.to(drawerRef.current, {
        x: '100%',
        duration: 0.25,
        ease: 'power3.in',
        onComplete: () => {
          setSelectedSale(null);
          if (searchParams.has('saleId')) {
            const next = new URLSearchParams(searchParams);
            next.delete('saleId');
            setSearchParams(next, { replace: true });
          }
        }
      });
    } else {
      setSelectedSale(null);
    }
  };

  // Helper lookups
  const getCustomer = (id: string) => customers.find(c => c.id === id);
  const getPlot = (id: string) => plots.find(p => p.id === id);
  const getDealer = (id?: string) => id ? dealers.find(d => d.id === id) : undefined;

  const planSummary = (sale: Sale): string => {
    if (sale.paymentPlanName) {
      return sale.paymentPlanName + (sale.paymentPlanModified ? ' (customized)' : '');
    }
    const rows = Array.isArray(sale.installmentRows) ? sale.installmentRows : [];
    if (rows.length === 0) return 'No plan';
    const months = rows.reduce((s, r) => s + (r.months || 0), 0);
    const count = rows.reduce((s, r) => {
      const interval = r.intervalMonths && r.intervalMonths > 0 ? r.intervalMonths : 1;
      return s + Math.floor((r.months || 0) / interval);
    }, 0);
    return `${count} inst. (${months} mos)`;
  };

  // Printing
  const handlePrintAgreement = (sale: Sale) => {
    const customer = getCustomer(sale.customerId);
    const plot = getPlot(sale.plotId);
    if (!company) { toast.error('Company settings missing'); return; }
    if (!customer || !plot) { toast.error('Customer or plot details missing'); return; }
    const html = generatePlotAgreement(sale, customer, plot, company);
    printContent(html, `Agreement-${sale.saleNumber || sale.id}`);
  };

  const handlePrintSchedule = async (sale: Sale) => {
    const customer = getCustomer(sale.customerId);
    const plot = getPlot(sale.plotId);
    if (!company) { toast.error('Company settings missing'); return; }
    if (!customer || !plot) { toast.error('Customer or plot details missing'); return; }

    try {
      setLoadingActionId(sale.id);
      const rawInsts = await getCollection<Installment>('installments', [
        where('saleId', '==', sale.id)
      ]);
      const cleanInsts = consolidateSaleInstallments(rawInsts);
      const html = generateInstallmentSchedule(sale, customer, plot, cleanInsts, company);
      printContent(html, `Schedule-${sale.saleNumber || sale.id}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load installment schedule');
    } finally {
      setLoadingActionId(null);
    }
  };

  // Filtered & sorted table data
  const filteredSales = useMemo(() => {
    let list = [...sales];

    // Status chip filter
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(sale => {
        const cust = getCustomer(sale.customerId);
        const plot = getPlot(sale.plotId);
        return (
          (sale.saleNumber || '').toLowerCase().includes(q) ||
          (cust?.name || '').toLowerCase().includes(q) ||
          (cust?.cnic || '').includes(q) ||
          (cust?.phone || '').includes(q) ||
          (plot?.plotNumber || '').toLowerCase().includes(q) ||
          (plot?.block || '').toLowerCase().includes(q)
        );
      });
    }

    // Sorting
    list.sort((a, b) => {
      const dateA = new Date(a.saleDate || a.createdAt).getTime();
      const dateB = new Date(b.saleDate || b.createdAt).getTime();
      if (sortBy === 'date_desc') return dateB - dateA;
      if (sortBy === 'date_asc')  return dateA - dateB;
      if (sortBy === 'price_desc') return (b.finalPrice || 0) - (a.finalPrice || 0);
      if (sortBy === 'price_asc')  return (a.finalPrice || 0) - (b.finalPrice || 0);
      return 0;
    });

    return list;
  }, [sales, customers, plots, statusFilter, searchTerm, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredSales.length / pageSize) || 1;
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales List"
        subtitle={`${sales.length} total sales recorded`}
        icon={<FileText size={20} />}
        actions={
          <button
            onClick={() => navigate('/sales/new')}
            className="btn-primary flex items-center gap-2"
            id="new-sale-header-btn"
          >
            <Plus size={16} /> + New Sale
          </button>
        }
      />

      <div className="card">
        {/* Controls: Search, Presets, Sort */}
        <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center mb-5">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by sale #, customer, CNIC, plot..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-8 input-field text-sm"
              id="sales-search-input"
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Preset chips & sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg p-1 bg-slate-100 text-xs font-semibold">
              {(['all', 'active', 'completed', 'cancelled'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setStatusFilter(tab); setCurrentPage(1); }}
                  className={`px-3 py-1 rounded-md capitalize transition-colors ${
                    statusFilter === tab
                      ? 'bg-white text-slate-900 shadow-sm font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 ml-auto text-xs text-slate-500">
              <ArrowUpDown size={14} />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as never)}
                className="input-field text-xs py-1 px-2 w-auto bg-slate-50 border-slate-200"
              >
                <option value="date_desc">Newest Sale</option>
                <option value="date_asc">Oldest Sale</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="price_asc">Price: Low to High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile Cards View (for phones & small screens) */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              Loading sales records...
            </div>
          ) : paginatedSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              No sales matched your criteria.
            </div>
          ) : (
            paginatedSales.map(sale => {
              const customer = getCustomer(sale.customerId);
              const plot = getPlot(sale.plotId);
              const received = (sale.finalPrice || 0) - (sale.remainingAmount || 0);
              const isHighlighted = sale.id === querySaleId;

              return (
                <div
                  key={sale.id}
                  className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${
                    isHighlighted ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Bar: Sale #, Date, Status */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="font-mono font-bold text-sm text-[#1a3c6e]">
                        {sale.saleNumber || sale.id.substring(0, 8)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDate(sale.saleDate || sale.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={sale.status} />
                  </div>

                  {/* Customer & Plot Info */}
                  <div className="grid grid-cols-2 gap-3 py-3 border-b border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-semibold block">Customer</span>
                      <span className="font-bold text-slate-800 text-sm block mt-0.5 truncate">{customer?.name || '-'}</span>
                      <span className="text-slate-500 text-[11px] font-mono block">{customer?.phone || customer?.cnic || ''}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-semibold block">Plot</span>
                      {plot ? (
                        <>
                          <span className="font-bold text-[#1a3c6e] text-sm block mt-0.5">
                            {plot.plotNumber} <span className="text-xs font-normal text-slate-600">Block {plot.block}</span>
                          </span>
                          <span className="text-slate-500 text-[11px] block">{plot.size} {plot.sizeUnit}</span>
                        </>
                      ) : (
                        <span className="text-slate-400 mt-0.5 block">-</span>
                      )}
                    </div>
                  </div>

                  {/* Financial Metrics */}
                  <div className="grid grid-cols-2 gap-2 py-3 border-b border-slate-100 text-xs bg-slate-50/60 -mx-4 px-4">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Final Price</span>
                      <span className="font-bold text-slate-800">{formatCurrency(sale.finalPrice)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Down Payment</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(sale.downPayment)}</span>
                      {sale.downPaymentStatus === 'complete' ? (
                        <span className="text-[10px] text-emerald-600 font-bold ml-1">Paid</span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-bold ml-1">Pending</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Received</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(received)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Remaining</span>
                      <span className="font-bold text-rose-600">{formatCurrency(sale.remainingAmount)}</span>
                    </div>
                  </div>

                  {/* Action Buttons: 100% visible, easy to tap */}
                  <div className="pt-3 flex flex-wrap items-center justify-between gap-1.5">
                    <button
                      onClick={() => setSelectedSale(sale)}
                      className="flex-1 min-w-[70px] py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                      title="View Details"
                    >
                      <Eye size={15} />
                      <span>Details</span>
                    </button>
                    <button
                      onClick={() => handlePrintAgreement(sale)}
                      className="flex-1 min-w-[70px] py-2.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-blue-200"
                      title="Print Agreement"
                    >
                      <FileText size={15} />
                      <span>Agreement</span>
                    </button>
                    <button
                      onClick={() => handlePrintSchedule(sale)}
                      disabled={loadingActionId === sale.id}
                      className="flex-1 min-w-[70px] py-2.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer border border-emerald-200"
                      title="Print Schedule"
                    >
                      <Printer size={15} />
                      <span>Schedule</span>
                    </button>
                    <button
                      onClick={() => navigate(`/payments/receive?customerId=${sale.customerId}&saleId=${sale.id}`)}
                      className="flex-1 min-w-[70px] py-2.5 px-2 bg-[#1a3c6e] hover:bg-[#0f2444] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      title="Receive Payment"
                    >
                      <Receipt size={15} />
                      <span>Pay</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Sales Table */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-3 px-3">Sale #</th>
                <th className="py-3 px-3">Sale Date</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Plot</th>
                <th className="py-3 px-3">Size</th>
                <th className="py-3 px-3">Final Price</th>
                <th className="py-3 px-3">Down Payment</th>
                <th className="py-3 px-3">Received</th>
                <th className="py-3 px-3">Remaining</th>
                <th className="py-3 px-3">Plan</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right min-w-[195px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    Loading sales records...
                  </td>
                </tr>
              ) : paginatedSales.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    No sales matched your criteria.
                  </td>
                </tr>
              ) : (
                paginatedSales.map(sale => {
                  const customer = getCustomer(sale.customerId);
                  const plot = getPlot(sale.plotId);
                  const isHighlighted = sale.id === querySaleId;
                  const received = (sale.finalPrice || 0) - (sale.remainingAmount || 0);

                  return (
                    <tr
                      key={sale.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${
                        isHighlighted ? 'bg-amber-50/60 font-medium' : ''
                      }`}
                    >
                      {/* Sale # */}
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-xs" style={{ color: '#1a3c6e' }}>
                          {sale.saleNumber || sale.id.substring(0, 8)}
                        </span>
                      </td>

                      {/* Sale Date */}
                      <td className="py-2.5 px-3 text-slate-600">
                        {formatDate(sale.saleDate || sale.createdAt)}
                      </td>

                      {/* Customer */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{customer?.name || '—'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{customer?.cnic || customer?.phone || ''}</div>
                      </td>

                      {/* Plot */}
                      <td className="py-2.5 px-3">
                        {plot ? (
                          <div className="font-medium text-slate-800">
                            {plot.plotNumber} <span className="text-[11px] text-slate-500 font-normal">Block {plot.block}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Size */}
                      <td className="py-2.5 px-3 text-slate-600">
                        {plot ? `${plot.size} ${plot.sizeUnit}` : '—'}
                      </td>

                      {/* Final Price */}
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {formatCurrency(sale.finalPrice)}
                      </td>

                      {/* Down Payment */}
                      <td className="py-2.5 px-3 text-slate-700">
                        <div>{formatCurrency(sale.downPayment)}</div>
                        {(sale.bookingAmountPaid || 0) > 0 && (
                          <div className="text-[10px] text-emerald-600 font-medium">
                            Bk: {formatCurrency(sale.bookingAmountPaid || 0)}
                          </div>
                        )}
                      </td>

                      {/* Received */}
                      <td className="py-2.5 px-3 font-medium text-emerald-700">
                        {formatCurrency(received)}
                      </td>

                      {/* Remaining */}
                      <td className="py-2.5 px-3 font-semibold text-rose-600">
                        {formatCurrency(sale.remainingAmount)}
                      </td>

                      {/* Plan */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-[130px] truncate" title={planSummary(sale)}>
                        {planSummary(sale)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        <StatusBadge status={sale.status} />
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            onClick={() => setSelectedSale(sale)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>

                          {/* Print Agreement */}
                          <button
                            onClick={() => handlePrintAgreement(sale)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Print Agreement"
                          >
                            <FileText size={16} />
                          </button>

                          {/* Print Schedule */}
                          <button
                            onClick={() => handlePrintSchedule(sale)}
                            disabled={loadingActionId === sale.id}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 shadow-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                            title="Print Installment Schedule"
                          >
                            <Printer size={16} />
                          </button>

                          {/* Customer Ledger */}
                          <button
                            onClick={() => navigate(`/reports/pending/customer/${sale.customerId}`)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Open Customer Ledger"
                          >
                            <BookOpen size={16} />
                          </button>

                          {/* Receive Payment */}
                          <button
                            onClick={() => navigate(`/payments/receive?customerId=${sale.customerId}&saleId=${sale.id}`)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a3c6e]/10 hover:bg-[#1a3c6e] text-[#1a3c6e] hover:text-white border border-[#1a3c6e]/20 shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Receive Payment"
                          >
                            <Receipt size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
            <div>
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredSales.length)} of {filteredSales.length} sales
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Slide-over Sale Details Drawer ── */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            ref={backdropRef}
            onClick={closeDrawer}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Drawer container */}
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Sale details"
              className="w-full sm:w-screen sm:max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto"
              style={{ paddingBottom: 'var(--safe-bottom)' }}
            >
              {/* Drawer Header */}
              <div
                className="p-5 flex items-center justify-between text-white flex-shrink-0"
                style={{ background: '#1a3c6e' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold tracking-tight">
                      Sale #{selectedSale.saleNumber || selectedSale.id.substring(0, 8)}
                    </h2>
                    <StatusBadge status={selectedSale.status} />
                  </div>
                  <p className="text-white/60 text-xs mt-0.5">
                    Recorded on {formatDate(selectedSale.saleDate || selectedSale.createdAt)}
                  </p>
                </div>
                <button
                  onClick={closeDrawer}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
                  title="Close Drawer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 p-5 space-y-5 text-xs text-slate-700">
                {/* Quick actions strip */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(`/payments/receive?customerId=${selectedSale.customerId}&saleId=${selectedSale.id}`)}
                    className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-white font-semibold text-xs shadow-sm"
                    style={{ background: '#1a3c6e' }}
                  >
                    <Receipt size={14} /> Receive Payment
                  </button>
                  <button
                    onClick={() => navigate(`/reports/pending/customer/${selectedSale.customerId}`)}
                    className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-300 font-semibold text-xs hover:bg-slate-50 text-slate-700"
                  >
                    <BookOpen size={14} /> Customer Ledger
                  </button>
                  <button
                    onClick={() => handlePrintAgreement(selectedSale)}
                    className="p-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                    title="Print Agreement"
                  >
                    <FileText size={15} />
                  </button>
                  <button
                    onClick={() => handlePrintSchedule(selectedSale)}
                    className="p-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                    title="Print Schedule"
                  >
                    <Printer size={15} />
                  </button>
                </div>

                {/* Financial Summary Box */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} style={{ color: '#1a3c6e' }} /> Pricing & Financials
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Price</span>
                      <span className="font-medium text-slate-800">{formatCurrency(selectedSale.totalPrice || selectedSale.finalPrice)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Discount</span>
                      <span className="font-medium text-slate-800">{formatCurrency(selectedSale.discount || 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Final Price</span>
                      <span className="font-bold text-slate-900">{formatCurrency(selectedSale.finalPrice)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Down Payment</span>
                      <span className="font-medium text-slate-800">{formatCurrency(selectedSale.downPayment)} ({selectedSale.downPaymentPercent || 0}%)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Booking Paid</span>
                      <span className="font-medium text-emerald-600">{formatCurrency(selectedSale.bookingAmountPaid || 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Remaining Balance</span>
                      <span className="font-bold text-rose-600">{formatCurrency(selectedSale.remainingAmount)}</span>
                    </div>
                    {Boolean(selectedSale.onPossessionAmount) && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">On Possession</span>
                        <span className="font-medium text-slate-800">{formatCurrency(selectedSale.onPossessionAmount || 0)}</span>
                      </div>
                    )}
                    {Boolean(selectedSale.semiAnnualAmount) && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Semi-Annual Payment</span>
                        <span className="font-medium text-slate-800">{formatCurrency(selectedSale.semiAnnualAmount || 0)} / 6 mos</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Details */}
                {(() => {
                  const cust = getCustomer(selectedSale.customerId);
                  if (!cust) return null;
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <User size={14} style={{ color: '#1a3c6e' }} /> Customer Information
                        </h4>
                        <button
                          onClick={() => navigate(`/customers/${cust.id}`)}
                          className="text-[11px] font-semibold hover:underline flex items-center gap-0.5"
                          style={{ color: '#1a3c6e' }}
                        >
                          View Profile <ChevronRight size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Full Name</span>
                          <span className="font-medium text-slate-800">{cust.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Father / Husband</span>
                          <span className="text-slate-700">{cust.fatherName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">CNIC</span>
                          <span className="font-mono text-slate-700">{cust.cnic}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Phone</span>
                          <span className="text-slate-700">{cust.phone}</span>
                        </div>
                        {cust.whatsapp && (
                          <div>
                            <span className="text-slate-400 block text-[10px]">WhatsApp</span>
                            <span className="text-slate-700">{cust.whatsapp}</span>
                          </div>
                        )}
                        {cust.city && (
                          <div>
                            <span className="text-slate-400 block text-[10px]">City</span>
                            <span className="text-slate-700">{cust.city}</span>
                          </div>
                        )}
                        {cust.address && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[10px]">Address</span>
                            <span className="text-slate-700">{cust.address}</span>
                          </div>
                        )}
                      </div>

                      {/* Nominee */}
                      {cust.nominee?.nomineeName && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <span className="text-slate-500 font-bold block text-[11px] mb-1">Nominee</span>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Name</span>
                              <span>{cust.nominee.nomineeName} ({cust.nominee.nomineeRelation || '—'})</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">CNIC</span>
                              <span className="font-mono">{cust.nominee.nomineeCnic || '—'}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Plot Details */}
                {(() => {
                  const plot = getPlot(selectedSale.plotId);
                  if (!plot) return null;
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <Home size={14} style={{ color: '#1a3c6e' }} /> Plot Information
                        </h4>
                        <button
                          onClick={() => navigate(`/plots/${plot.id}`)}
                          className="text-[11px] font-semibold hover:underline flex items-center gap-0.5"
                          style={{ color: '#1a3c6e' }}
                        >
                          View Plot <ChevronRight size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Plot #</span>
                          <span className="font-bold text-slate-800">{plot.plotNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Block</span>
                          <span className="font-medium text-slate-800">{plot.block}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Size</span>
                          <span className="font-medium text-slate-800">{plot.size} {plot.sizeUnit}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Category</span>
                          <span className="text-slate-700 capitalize">{plot.category || 'Standard'}</span>
                        </div>
                        {plot.location && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[10px]">Location</span>
                            <span className="text-slate-700">{plot.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Payment Plan Rows Table */}
                {Array.isArray(selectedSale.installmentRows) && selectedSale.installmentRows.length > 0 && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar size={14} style={{ color: '#1a3c6e' }} /> Plan Rows Structure
                    </h4>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="p-2">Duration</th>
                            <th className="p-2">Interval</th>
                            <th className="p-2">Amount / Inst.</th>
                            <th className="p-2 text-right">Row Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSale.installmentRows.map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-0">
                              <td className="p-2">{row.months} months</td>
                              <td className="p-2">Every {row.intervalMonths} mo.</td>
                              <td className="p-2 font-medium">{formatCurrency(row.monthlyAmount)}</td>
                              <td className="p-2 text-right font-semibold">{formatCurrency(row.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dealer Information (if any) */}
                {(Boolean(selectedSale.dealerName) || Boolean(selectedSale.dealerCommissionAmount)) && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Handshake size={14} style={{ color: '#1a3c6e' }} /> Dealer & Commission
                    </h4>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Dealer Name</span>
                        <span className="font-medium text-slate-800">{selectedSale.dealerName || 'Assigned Dealer'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Phone</span>
                        <span className="text-slate-700">{selectedSale.dealerPhone || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Commission Rate</span>
                        <span>{selectedSale.dealerCommissionPercent ? `${selectedSale.dealerCommissionPercent}%` : 'Fixed'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Commission Amount</span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(selectedSale.dealerCommissionAmount || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
