import React, { useEffect, useState } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { DollarSign, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import { getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, formatDateInput } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, CompanySettings } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';

const CollectionReport: React.FC = () => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    Promise.all([
      getCollection<Installment>('installments'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([i, comp]) => {
      setInstallments(i.filter(inst => inst.status === 'paid'));
      if (comp) setCompany(comp);
    });
  }, []);

  const filtered = installments.filter(i => {
    if (!i.paymentDate) return false;
    const d = new Date(i.paymentDate);
    if (dateRange.start && d < dateRange.start) return false;
    if (dateRange.end && d > dateRange.end) return false;
    return true;
  });

  const cashTotal = filtered.filter(i => i.paymentMethod === 'Cash').reduce((s, i) => s + i.amountPaid, 0);
  const bankTotal = filtered.filter(i => i.paymentMethod === 'Bank Transfer').reduce((s, i) => s + i.amountPaid, 0);
  const chequeTotal = filtered.filter(i => i.paymentMethod === 'Cheque').reduce((s, i) => s + i.amountPaid, 0);
  const grandTotal = cashTotal + bankTotal + chequeTotal;

  // Monthly breakdown
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const monthLabel = format(d, 'MMM yy');
    const m = d.getMonth(); const y = d.getFullYear();
    const cash = installments.filter(i => i.paymentDate && new Date(i.paymentDate).getMonth() === m && new Date(i.paymentDate).getFullYear() === y && i.paymentMethod === 'Cash').reduce((s, i) => s + i.amountPaid, 0);
    const bank = installments.filter(i => i.paymentDate && new Date(i.paymentDate).getMonth() === m && new Date(i.paymentDate).getFullYear() === y && i.paymentMethod === 'Bank Transfer').reduce((s, i) => s + i.amountPaid, 0);
    const cheque = installments.filter(i => i.paymentDate && new Date(i.paymentDate).getMonth() === m && new Date(i.paymentDate).getFullYear() === y && i.paymentMethod === 'Cheque').reduce((s, i) => s + i.amountPaid, 0);
    return { month: monthLabel, Cash: cash, 'Bank Transfer': bank, Cheque: cheque };
  });

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings'); return; }
    const rows = [
      ['Cash', filtered.filter(i => i.paymentMethod === 'Cash').length.toString(), formatCurrency(cashTotal)],
      ['Bank Transfer', filtered.filter(i => i.paymentMethod === 'Bank Transfer').length.toString(), formatCurrency(bankTotal)],
      ['Cheque', filtered.filter(i => i.paymentMethod === 'Cheque').length.toString(), formatCurrency(chequeTotal)],
      ['TOTAL', filtered.length.toString(), formatCurrency(grandTotal)],
    ];
    const html = generateReportHTML(company, 'Collection Report', ['Payment Method', 'Count', 'Amount'], rows);
    printContent(html, 'Report');
  };

  return (
    <div>
      <PageHeader
        title="Collection Report"
        subtitle="Breakdown by payment method"
        icon={<DollarSign size={20} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
            
            
            
            <button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>
            
          </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Cash', amount: cashTotal, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Bank Transfer', amount: bankTotal, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Cheque', amount: chequeTotal, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Grand Total', amount: grandTotal, color: 'text-primary', bg: 'bg-slate-50' },
        ].map(item => (
          <div key={item.label} className={`card ${item.bg} border-0 text-center`}>
            <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.amount)}</p>
            <p className="text-xs text-slate-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <div className="card mb-5">
        <h3 className="font-semibold text-slate-700 mb-4">Monthly Collection by Method (Last 6 Months)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`} />
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-expect-error recharts ValueType includes arrays */}
            <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0))} />
            <Legend />
            <Bar dataKey="Cash" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Bank Transfer" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Cheque" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="card">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>{['Payment Method', 'Transactions', 'Amount'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {[
              ['Cash', filtered.filter(i => i.paymentMethod === 'Cash').length, cashTotal],
              ['Bank Transfer', filtered.filter(i => i.paymentMethod === 'Bank Transfer').length, bankTotal],
              ['Cheque', filtered.filter(i => i.paymentMethod === 'Cheque').length, chequeTotal],
            ].map(([method, count, amt]) => (
              <tr key={method as string} className="table-row">
                <td className="table-td font-medium">{method}</td>
                <td className="table-td">{count}</td>
                <td className="table-td font-semibold text-primary">{formatCurrency(amt as number)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td className="table-td font-bold">Grand Total</td>
              <td className="table-td font-bold">{filtered.length}</td>
              <td className="table-td font-bold text-green-600">{formatCurrency(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default CollectionReport;
