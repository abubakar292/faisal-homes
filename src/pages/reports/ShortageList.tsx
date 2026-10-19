import React, { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ReportLayout, { exportRowsToCsv } from '../../components/reports/ReportLayout';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { subscribeCollection, getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, isInstallmentOverdue, daysOverdue, getOutstanding } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, Customer, Plot, Sale, CompanySettings } from '../../types';

type AgeFilter = 'all' | '1-30' | '31-60' | '61-90' | '90+';

interface ShortageRow {
  id: string;
  customerId: string;
  rawCustomerId: string;
  customerName: string;
  fatherName: string;
  phone: string;
  cnic: string;
  plotNumber: string;
  block: string;
  installmentNumber: string | number;
  dueDate: Date;
  amountDue: number;
  daysDiff: number;
}

const ShortageList: React.FC = () => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [filterBlock, setFilterBlock] = useState('');

  useEffect(() => {
    const loadStatic = async () => {
      try {
        const [c, p, s] = await Promise.all([
          getCollection<Customer>('customers'),
          getCollection<Plot>('plots'),
          getCollection<Sale>('sales'),
        ]);
        setCustomers(c);
        setPlots(p);
        setSales(s);
        const comp = await getDocument<CompanySettings>('settings', 'company');
        if (comp) setCompany(comp);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load shortage list metadata');
      } finally {
        setLoading(false);
      }
    };
    loadStatic();

    const unsub = subscribeCollection<Installment>('installments', setInstallments);
    return () => unsub();
  }, []);

  const allRows = useMemo<ShortageRow[]>(() => {
    const rows: ShortageRow[] = [];

    installments.forEach(inst => {
      // Down payments are managed separately, never as regular shortage installments
      if (inst.type === 'down_payment') return;
      if (!isInstallmentOverdue(inst)) return;

      const sale = sales.find(s => s.id === inst.saleId);
      if (sale?.status === 'cancelled') return;

      const customer = customers.find(c => c.id === inst.customerId);
      const plot = plots.find(p => p.id === inst.plotId);
      if (!customer || !plot) return;

      const due = new Date(inst.dueDate!);
      const dDiff = daysOverdue(inst);

      let instNum: string | number = inst.installmentNumber;
      if (inst.type === 'semi_annual')   instNum = 'Semi-Annual';
      if (inst.type === 'on_possession') instNum = 'Possession';

      rows.push({
        id: inst.id,
        customerId: customer.customerId,
        rawCustomerId: customer.id,
        customerName: customer.name,
        fatherName: customer.fatherName || '',
        phone: customer.phone,
        cnic: customer.cnic,
        plotNumber: plot.plotNumber,
        block: plot.block,
        installmentNumber: instNum,
        dueDate: due,
        amountDue: getOutstanding(inst),
        daysDiff: dDiff,
      });
    });

    return rows.sort((a, b) => b.daysDiff - a.daysDiff || a.dueDate.getTime() - b.dueDate.getTime());
  }, [installments, customers, plots, sales]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();

    return allRows.filter(row => {
      if (ageFilter === '1-30' && (row.daysDiff < 1 || row.daysDiff > 30)) return false;
      if (ageFilter === '31-60' && (row.daysDiff < 31 || row.daysDiff > 60)) return false;
      if (ageFilter === '61-90' && (row.daysDiff < 61 || row.daysDiff > 90)) return false;
      if (ageFilter === '90+' && row.daysDiff <= 90) return false;

      if (filterBlock && row.block !== filterBlock) return false;

      if (dateRange.start && row.dueDate < dateRange.start) return false;
      if (dateRange.end && row.dueDate > dateRange.end) return false;

      if (q) {
        const match = (
          row.customerName.toLowerCase().includes(q) ||
          row.customerId.toLowerCase().includes(q) ||
          row.fatherName.toLowerCase().includes(q) ||
          row.phone.includes(q) ||
          row.cnic.includes(q) ||
          row.plotNumber.toLowerCase().includes(q) ||
          row.block.toLowerCase().includes(q)
        );
        if (!match) return false;
      }

      return true;
    });
  }, [allRows, ageFilter, filterBlock, search, dateRange]);

  const totalAmount = useMemo(() => filteredRows.reduce((s, r) => s + r.amountDue, 0), [filteredRows]);

  const c30 = useMemo(() => allRows.filter(r => r.daysDiff >= 1 && r.daysDiff <= 30).length, [allRows]);
  const c60 = useMemo(() => allRows.filter(r => r.daysDiff >= 31 && r.daysDiff <= 60).length, [allRows]);
  const c90 = useMemo(() => allRows.filter(r => r.daysDiff >= 61 && r.daysDiff <= 90).length, [allRows]);
  const c90p = useMemo(() => allRows.filter(r => r.daysDiff > 90).length, [allRows]);

  const uniqueBlocks = useMemo(() => Array.from(new Set(plots.map(p => p.block))).sort(), [plots]);

  const handleWhatsApp = (row: ShortageRow) => {
    let phone = row.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '92' + phone.substring(1);
    else if (!phone.startsWith('92')) phone = '92' + phone;

    const dueDateStr = formatDate(row.dueDate);
    const message = `Assalam-o-Alaikum ${row.customerName},\n\naapki Plot ${row.plotNumber} Block ${row.block} ki qist #${row.installmentNumber} ${formatCurrency(row.amountDue)} tarikh ${dueDateStr} ko due thi - ${row.daysDiff} din se overdue hain.\n\nMeherbani farma ke jald payment karein.\n\nFaisal Homes${company ? `: ${company.phone}` : ''}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handlePrint = () => {
    if (!company) { toast.error('Configure company settings first'); return; }

    const rows = filteredRows.map(row => [
      row.customerId,
      `${row.customerName} (${row.fatherName})`,
      row.phone,
      `${row.plotNumber} (${row.block})`,
      row.installmentNumber.toString(),
      formatDate(row.dueDate),
      formatCurrency(row.amountDue),
      `${row.daysDiff} days`,
    ]);

    const html = generateReportHTML(
      company,
      'Shortage List (Overdue Payments Only)',
      ['Cust ID', 'Customer Name', 'Phone', 'Plot', 'Inst #', 'Due Date', 'Amount Due', 'Overdue Days'],
      rows,
      `Total Overdue: ${formatCurrency(totalAmount)} | ${filteredRows.length} overdue installments`
    );
    printContent(html, 'Shortage-List');
  };

  const handleExportCsv = () => {
    const headers = ['Customer ID', 'Customer Name', 'Father Name', 'Phone', 'CNIC', 'Plot Number', 'Block', 'Installment #', 'Due Date', 'Amount Due', 'Days Overdue'];
    const rows = filteredRows.map(r => [
      r.customerId,
      r.customerName,
      r.fatherName,
      r.phone,
      r.cnic,
      r.plotNumber,
      r.block,
      r.installmentNumber,
      formatDate(r.dueDate),
      r.amountDue,
      r.daysDiff
    ]);
    exportRowsToCsv('Shortage-List', headers, rows);
  };

  const kpis = [
    { label: 'Total Overdue', value: filteredRows.length, color: 'red' as const, hint: 'Overdue installments' },
    { label: 'Overdue Amount', value: totalAmount, isCurrency: true, color: 'red' as const, hint: 'Total recovery target' },
    { label: 'Critical (>90 Days)', value: c90p, color: 'red' as const, hint: 'High risk defaulters' },
    { label: '30-90 Days Due', value: c60 + c90, color: 'amber' as const, hint: 'Moderate overdue' },
  ];

  return (
    <ReportLayout
      reportName="Shortage List"
      title="Overdue Recovery Shortage List"
      subtitle="Urgent recovery shortlist of all overdue installments with WhatsApp reminder links"
      icon={<AlertTriangle size={18} />}
      onPrint={handlePrint}
      onExportCsv={handleExportCsv}
      kpis={kpis}
      loading={loading}
      topContent={
        <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-xs">
          <span className="font-bold text-slate-600 mr-1">Overdue Aging:</span>
          {(['all', '1-30', '31-60', '61-90', '90+'] as const).map(f => (
            <button
              key={f}
              onClick={() => setAgeFilter(f)}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                ageFilter === f
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'all' ? `All (${allRows.length})` : f === '90+' ? `90+ Days (${c90p})` : `${f} Days`}
            </button>
          ))}
        </div>
      }
      filterCard={
        <ReportFilters
          search={search}
          onSearchChange={setSearch}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search customer, CNIC, phone, or plot..."
          extraFilters={
            <select
              className="input-field w-36 text-xs"
              value={filterBlock}
              onChange={e => setFilterBlock(e.target.value)}
            >
              <option value="">All Blocks</option>
              {uniqueBlocks.map(b => (
                <option key={b} value={b}>Block {b}</option>
              ))}
            </select>
          }
        />
      }
      footerContent={
        <div className="flex justify-between items-center font-bold">
          <span>Overdue Count: {filteredRows.length} installments</span>
          <span className="text-rose-700">Total Defaulter Balance: {formatCurrency(totalAmount)}</span>
        </div>
      }
    >
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
            <th className="py-3 px-3 text-center">Remind</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-slate-400">
                No overdue installments found! All payments up to date.
              </td>
            </tr>
          ) : (
            filteredRows.map(row => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-red-50/30 transition-colors">
                <td className="py-2.5 px-3">
                  <button
                    onClick={() => navigate(`/reports/pending/customer/${row.rawCustomerId}`)}
                    className="font-bold text-primary hover:underline text-left block"
                    title="Open Customer Ledger"
                  >
                    {row.customerName}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {row.customerId} {row.fatherName ? `· s/o ${row.fatherName}` : ''}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{row.phone}</td>
                <td className="py-2.5 px-3 text-slate-700 font-medium">
                  {row.plotNumber} <span className="text-[10px] text-slate-400">({row.block})</span>
                </td>
                <td className="py-2.5 px-3 text-slate-600">#{row.installmentNumber}</td>
                <td className="py-2.5 px-3 text-slate-500">{formatDate(row.dueDate)}</td>
                <td className="py-2.5 px-3 font-bold text-rose-700">{formatCurrency(row.amountDue)}</td>
                <td className="py-2.5 px-3 font-extrabold text-red-600">
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[11px]">
                    {row.daysDiff} days
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <button
                    onClick={() => handleWhatsApp(row)}
                    className="p-1 hover:bg-emerald-50 rounded text-emerald-600 inline-flex transition-colors"
                    title="Send WhatsApp Reminder"
                  >
                    <MessageCircle size={15} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportLayout>
  );
};

export default ShortageList;
