import React, { useEffect, useState, useMemo } from 'react';
import { DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, CompanySettings } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';

const CollectionReport: React.FC = () => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCollection<Installment>('installments'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([i, comp]) => {
      setInstallments(i.filter(inst => inst.status === 'paid'));
      if (comp) setCompany(comp);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      toast.error('Failed to load collection report data');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return installments.filter(i => {
      if (!i.paymentDate) return false;
      const d = new Date(i.paymentDate);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
      return true;
    });
  }, [installments, dateRange]);

  const cashTotal = useMemo(() => filtered.filter(i => i.paymentMethod === 'Cash').reduce((s, i) => s + (i.amountPaid || 0), 0), [filtered]);
  const bankTotal = useMemo(() => filtered.filter(i => i.paymentMethod === 'Bank Transfer').reduce((s, i) => s + (i.amountPaid || 0), 0), [filtered]);
  const chequeTotal = useMemo(() => filtered.filter(i => i.paymentMethod === 'Cheque').reduce((s, i) => s + (i.amountPaid || 0), 0), [filtered]);
  const grandTotal = cashTotal + bankTotal + chequeTotal;

  // Monthly breakdown for last 6 months
  const monthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const monthLabel = format(d, 'MMM yy');
      const m = d.getMonth();
      const y = d.getFullYear();
      const cash = installments
        .filter(inst => inst.paymentDate && new Date(inst.paymentDate).getMonth() === m && new Date(inst.paymentDate).getFullYear() === y && inst.paymentMethod === 'Cash')
        .reduce((s, inst) => s + (inst.amountPaid || 0), 0);
      const bank = installments
        .filter(inst => inst.paymentDate && new Date(inst.paymentDate).getMonth() === m && new Date(inst.paymentDate).getFullYear() === y && inst.paymentMethod === 'Bank Transfer')
        .reduce((s, inst) => s + (inst.amountPaid || 0), 0);
      const cheque = installments
        .filter(inst => inst.paymentDate && new Date(inst.paymentDate).getMonth() === m && new Date(inst.paymentDate).getFullYear() === y && inst.paymentMethod === 'Cheque')
        .reduce((s, inst) => s + (inst.amountPaid || 0), 0);
      return { month: monthLabel, Cash: cash, 'Bank Transfer': bank, Cheque: cheque };
    });
  }, [installments]);

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = [
      ['Cash', filtered.filter(i => i.paymentMethod === 'Cash').length.toString(), formatCurrency(cashTotal)],
      ['Bank Transfer', filtered.filter(i => i.paymentMethod === 'Bank Transfer').length.toString(), formatCurrency(bankTotal)],
      ['Cheque', filtered.filter(i => i.paymentMethod === 'Cheque').length.toString(), formatCurrency(chequeTotal)],
      ['TOTAL', filtered.length.toString(), formatCurrency(grandTotal)],
    ];
    const html = generateReportHTML(company, 'Collection Report', ['Payment Method', 'Count', 'Amount'], rows);
    printContent(html, 'Collection-Report');
  };

  const handleExportCSV = () => {
    const headers = ['Payment Method', 'Transactions Count', 'Total Amount', 'Share Percentage'];
    const rows = [
      ['Cash', filtered.filter(i => i.paymentMethod === 'Cash').length, cashTotal, grandTotal ? `${((cashTotal / grandTotal) * 100).toFixed(1)}%` : '0%'],
      ['Bank Transfer', filtered.filter(i => i.paymentMethod === 'Bank Transfer').length, bankTotal, grandTotal ? `${((bankTotal / grandTotal) * 100).toFixed(1)}%` : '0%'],
      ['Cheque', filtered.filter(i => i.paymentMethod === 'Cheque').length, chequeTotal, grandTotal ? `${((chequeTotal / grandTotal) * 100).toFixed(1)}%` : '0%'],
      ['TOTAL', filtered.length, grandTotal, '100%']
    ];
    exportRowsToCsv('Collection-Report', headers, rows);
  };

  const kpis = [
    { label: 'Cash Inflow', value: cashTotal, isCurrency: true, color: 'green' as const, hint: 'Direct counter cash' },
    { label: 'Bank Transfers', value: bankTotal, isCurrency: true, color: 'blue' as const, hint: 'Online & direct bank' },
    { label: 'Cheque Clearance', value: chequeTotal, isCurrency: true, color: 'amber' as const, hint: 'Cleared instruments' },
    { label: 'Total Collections', value: grandTotal, isCurrency: true, color: 'navy' as const, hint: 'Gross collected inflow' },
  ];

  return (
    <ReportLayout
      reportName="Collection Report"
      title="Financial Collection Report"
      subtitle="Breakdown of collections by payment channel: Cash, Bank, and Cheques"
      icon={<DollarSign size={18} />}
      onPrint={handlePrint}
      onExportCsv={handleExportCSV}
      kpis={kpis}
      loading={loading}
      filterCard={
        <ReportFilters
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search collections..."
        />
      }
      topContent={
        <div className="card border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">
            Monthly Collection by Method (Last 6 Months)
          </h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`}
              />
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-expect-error recharts Tooltip formatter type */}
              <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Cash" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Bank Transfer" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Cheque" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Total Transactions: {filtered.length} paid receipts</span>
          <span className="text-emerald-700">Combined Collection: {formatCurrency(grandTotal)}</span>
        </div>
      }
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0 z-10">
          <tr>
            <th className="py-3 px-4">Payment Method</th>
            <th className="py-3 px-4">Transactions Count</th>
            <th className="py-3 px-4">Share (%)</th>
            <th className="py-3 px-4 text-right">Collected Amount</th>
          </tr>
        </thead>
        <tbody>
          {[
            { method: 'Cash', count: filtered.filter(i => i.paymentMethod === 'Cash').length, amt: cashTotal, color: 'text-emerald-700' },
            { method: 'Bank Transfer', count: filtered.filter(i => i.paymentMethod === 'Bank Transfer').length, amt: bankTotal, color: 'text-blue-700' },
            { method: 'Cheque', count: filtered.filter(i => i.paymentMethod === 'Cheque').length, amt: chequeTotal, color: 'text-amber-700' },
          ].map(row => {
            const pct = grandTotal ? ((row.amt / grandTotal) * 100).toFixed(1) : '0';
            return (
              <tr key={row.method} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="py-3 px-4 font-semibold text-slate-800">{row.method}</td>
                <td className="py-3 px-4 text-slate-600">{row.count} payments</td>
                <td className="py-3 px-4 text-slate-500 font-medium">{pct}%</td>
                <td className={`py-3 px-4 text-right font-bold text-sm ${row.color}`}>
                  {formatCurrency(row.amt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default CollectionReport;
