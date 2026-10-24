import React, { useEffect, useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, Booking, Sale, Customer, Plot, CompanySettings, DownPaymentTransaction } from '../../types';
import {
  computeTotalCollected,
  computeCollectedToday,
  isDateInRangeKarachi,
  isDateTodayKarachi,
  startOfDayKarachi,
  endOfDayKarachi,
} from '../../domain/metrics';

interface DailyPaymentItem {
  id: string;
  receiptNumber: string;
  customerId: string;
  plotId: string;
  label: string;
  amount: number;
  paymentMethod: string;
  date: Date;
}

const DailyReport: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const { data: installments, loading: loadingInst } = useLiveCollection<Installment>('installments');
  const { data: bookings, loading: loadingBookings } = useLiveCollection<Booking>('bookings');
  const { data: sales, loading: loadingSales } = useLiveCollection<Sale>('sales');
  const { data: customers, loading: loadingCust } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: loadingPlots } = useLiveCollection<Plot>('plots');
  const { data: dpTransactions, loading: loadingDp } = useLiveCollection<DownPaymentTransaction>('downPaymentTransactions');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const loading = loadingInst || loadingBookings || loadingSales || loadingCust || loadingPlots || loadingDp;

  useEffect(() => {
    let active = true;
    getDocument<CompanySettings>('settings', 'company')
      .then(comp => {
        if (active && comp) setCompany(comp);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const activeSales = useMemo(() => sales.filter(s => s.status !== 'cancelled'), [sales]);
  const activeSaleIds = useMemo(() => new Set(activeSales.map(s => s.id)), [activeSales]);

  // Combined collection entries for the day/range
  const allCollectionItems = useMemo<DailyPaymentItem[]>(() => {
    const items: DailyPaymentItem[] = [];

    // 1. Regular Installments
    installments.forEach(inst => {
      if (!activeSaleIds.has(inst.saleId)) return;
      if (inst.type === 'down_payment') return;
      if (inst.status !== 'paid' || !inst.paymentDate) return;
      const d = new Date(inst.paymentDate);
      if (dateRange.start && dateRange.end) {
        if (!isDateInRangeKarachi(d, dateRange.start, dateRange.end)) return;
      } else if (dateRange.start) {
        if (d.getTime() < startOfDayKarachi(dateRange.start).getTime()) return;
      } else if (dateRange.end) {
        if (d.getTime() > endOfDayKarachi(dateRange.end).getTime()) return;
      } else {
        // Default to Today in Karachi
        if (!isDateTodayKarachi(d)) return;
      }

      items.push({
        id: `inst-${inst.id}`,
        receiptNumber: inst.receiptNumber || '—',
        customerId: inst.customerId,
        plotId: inst.plotId,
        label: inst.type === 'semi_annual' ? `Semi-Annual #${inst.installmentNumber}` : `#${inst.installmentNumber}`,
        amount: Number(inst.amountPaid) || 0,
        paymentMethod: inst.paymentMethod || 'Cash',
        date: d,
      });
    });

    // 2. Down Payment Transactions
    dpTransactions.forEach(tx => {
      if (!activeSaleIds.has(tx.saleId)) return;
      const d = new Date(tx.paymentDate);
      if (dateRange.start && dateRange.end) {
        if (!isDateInRangeKarachi(d, dateRange.start, dateRange.end)) return;
      } else if (dateRange.start) {
        if (d.getTime() < startOfDayKarachi(dateRange.start).getTime()) return;
      } else if (dateRange.end) {
        if (d.getTime() > endOfDayKarachi(dateRange.end).getTime()) return;
      } else {
        if (!isDateTodayKarachi(d)) return;
      }

      items.push({
        id: `dp-${tx.id}`,
        receiptNumber: tx.receiptNumber || '—',
        customerId: tx.customerId,
        plotId: tx.plotId,
        label: 'Down Payment',
        amount: Number(tx.amount) || 0,
        paymentMethod: tx.paymentMethod || 'Bank Transfer',
        date: d,
      });
    });

    // 3. Booking collections
    activeSales.forEach(s => {
      const bAmt = Number(s.bookingAmountPaid) || 0;
      if (bAmt <= 0) return;
      const sDate = s.saleDate ? new Date(s.saleDate) : s.createdAt ? new Date(s.createdAt) : null;
      if (!sDate) return;

      if (dateRange.start && dateRange.end) {
        if (!isDateInRangeKarachi(sDate, dateRange.start, dateRange.end)) return;
      } else if (dateRange.start) {
        if (sDate.getTime() < startOfDayKarachi(dateRange.start).getTime()) return;
      } else if (dateRange.end) {
        if (sDate.getTime() > endOfDayKarachi(dateRange.end).getTime()) return;
      } else {
        if (!isDateTodayKarachi(sDate)) return;
      }

      items.push({
        id: `booking-${s.id}`,
        receiptNumber: s.saleNumber || '—',
        customerId: s.customerId,
        plotId: s.plotId,
        label: 'Booking Advance',
        amount: bAmt,
        paymentMethod: 'Cash',
        date: sDate,
      });
    });

    // 4. Possession payments
    activeSales.forEach(s => {
      if (s.onPossessionStatus !== 'Paid') return;
      const pAmt = Number(s.onPossessionAmount) || 0;
      if (pAmt <= 0) return;
      const pDate = s.onPossessionPaidDate ? new Date(s.onPossessionPaidDate) : s.saleDate ? new Date(s.saleDate) : null;
      if (!pDate) return;

      if (dateRange.start && dateRange.end) {
        if (!isDateInRangeKarachi(pDate, dateRange.start, dateRange.end)) return;
      } else if (dateRange.start) {
        if (pDate.getTime() < startOfDayKarachi(dateRange.start).getTime()) return;
      } else if (dateRange.end) {
        if (pDate.getTime() > endOfDayKarachi(dateRange.end).getTime()) return;
      } else {
        if (!isDateTodayKarachi(pDate)) return;
      }

      items.push({
        id: `poss-${s.id}`,
        receiptNumber: `POSS-${s.saleNumber}`,
        customerId: s.customerId,
        plotId: s.plotId,
        label: 'Possession Payment',
        amount: pAmt,
        paymentMethod: 'Bank Transfer',
        date: pDate,
      });
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [installments, dpTransactions, activeSales, activeSaleIds, dateRange]);

  const totalCollection = useMemo(() => {
    return allCollectionItems.reduce((s, i) => s + i.amount, 0);
  }, [allCollectionItems]);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} - ${p.block}` : '—';
  };

  // Search filtered payments
  const filteredPayments = useMemo(() => {
    if (!search.trim()) return allCollectionItems;
    const q = search.toLowerCase().trim();
    return allCollectionItems.filter(i => {
      const cName = customerName(i.customerId).toLowerCase();
      const pInfo = plotInfo(i.plotId).toLowerCase();
      const rec = (i.receiptNumber || '').toLowerCase();
      return cName.includes(q) || pInfo.includes(q) || rec.includes(q) || i.label.toLowerCase().includes(q);
    });
  }, [allCollectionItems, search, customers, plots]);

  const dayBookings = useMemo(() => {
    return bookings.filter(b => {
      const d = new Date(b.bookingDate);
      if (dateRange.start && dateRange.end) {
        return isDateInRangeKarachi(d, dateRange.start, dateRange.end);
      } else if (dateRange.start) {
        return d.getTime() >= startOfDayKarachi(dateRange.start).getTime();
      } else if (dateRange.end) {
        return d.getTime() <= endOfDayKarachi(dateRange.end).getTime();
      }
      return isDateTodayKarachi(d);
    });
  }, [bookings, dateRange]);

  const daySales = useMemo(() => {
    return activeSales.filter(s => {
      const d = new Date(s.saleDate || s.createdAt);
      if (dateRange.start && dateRange.end) {
        return isDateInRangeKarachi(d, dateRange.start, dateRange.end);
      } else if (dateRange.start) {
        return d.getTime() >= startOfDayKarachi(dateRange.start).getTime();
      } else if (dateRange.end) {
        return d.getTime() <= endOfDayKarachi(dateRange.end).getTime();
      }
      return isDateTodayKarachi(d);
    });
  }, [activeSales, dateRange]);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings first'); return; }
    const rows = filteredPayments.map(i => [
      i.receiptNumber || '—',
      customerName(i.customerId),
      plotInfo(i.plotId),
      i.label,
      formatCurrency(i.amount),
      i.paymentMethod || '—'
    ]);
    const html = generateReportHTML(
      company,
      `Daily Collection Report - ${dateRange.start ? formatDate(dateRange.start) : 'Today'}`,
      ['Receipt #', 'Customer', 'Plot', 'Description', 'Amount', 'Method'],
      rows,
      `Total Collection: ${formatCurrency(totalCollection)}`
    );
    printContent(html, 'Daily Collection Report');
  };

  const handleExportCsv = () => {
    const headers = ['Receipt #', 'Customer', 'Plot', 'Description', 'Amount', 'Method', 'Date'];
    const rows = filteredPayments.map(i => [
      i.receiptNumber || '—',
      customerName(i.customerId),
      plotInfo(i.plotId),
      i.label,
      i.amount || 0,
      i.paymentMethod || '—',
      formatDate(i.date)
    ]);
    exportRowsToCsv('Daily-Report', headers, rows);
  };

  const kpis = [
    { label: 'Payments Received', value: allCollectionItems.length, color: 'green' as const, hint: 'Total collections' },
    { label: 'Total Collection', value: totalCollection, isCurrency: true, color: 'green' as const, hint: 'Cash & Bank inflows' },
    { label: 'New Bookings', value: dayBookings.length, color: 'blue' as const, hint: 'Bookings recorded' },
    { label: 'New Sales', value: daySales.length, color: 'navy' as const, hint: 'Plot allocations' },
  ];

  return (
    <ReportLayout
      reportName="Daily Report"
      title="Daily Operations Report"
      subtitle="Comprehensive daily transaction snapshot of payments, bookings, and sales"
      icon={<Calendar size={18} />}
      onPrint={handlePrint}
      onExportCsv={handleExportCsv}
      kpis={kpis}
      loading={loading}
      filterCard={
        <ReportFilters
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search customer, plot, or receipt..."
        />
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Total Filtered Payments: {filteredPayments.length}</span>
          <span className="text-emerald-700">Total Inflow: {formatCurrency(totalCollection)}</span>
        </div>
      }
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
          <tr>
            <th className="py-3 px-3">Receipt #</th>
            <th className="py-3 px-3">Customer</th>
            <th className="py-3 px-3">Plot</th>
            <th className="py-3 px-3">Description</th>
            <th className="py-3 px-3">Amount</th>
            <th className="py-3 px-3">Method</th>
          </tr>
        </thead>
        <tbody>
          {filteredPayments.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-slate-400">
                No payments recorded for this period.
              </td>
            </tr>
          ) : (
            filteredPayments.map(i => (
              <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="py-2.5 px-3 font-mono font-medium text-primary">{i.receiptNumber || '—'}</td>
                <td className="py-2.5 px-3 font-semibold text-slate-800">{customerName(i.customerId)}</td>
                <td className="py-2.5 px-3 text-slate-700">{plotInfo(i.plotId)}</td>
                <td className="py-2.5 px-3 text-slate-600">{i.label}</td>
                <td className="py-2.5 px-3 font-bold text-emerald-700">{formatCurrency(i.amount)}</td>
                <td className="py-2.5 px-3 text-slate-600">{i.paymentMethod || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default DailyReport;
