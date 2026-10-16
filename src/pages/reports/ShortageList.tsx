import React, { useEffect, useState, useMemo } from 'react';
import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';
import { AlertCircle, Search, MessageCircle, Printer, X, Filter } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { subscribeCollection, getCollection, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate, isInstallmentOverdue, daysOverdue, getOutstanding } from '../../utils/formatters';
import { printContent, generateReportHTML } from '../../utils/printUtils';
import type { Installment, Customer, Plot, Sale, CompanySettings } from '../../types';
import { BrandLoader } from '../../components/brand';

type AgeFilter = 'all' | '1-30' | '31-60' | '61-90' | '90+';

interface ShortageRow {
  id: string;
  customerId: string;
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
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [plots, setPlots]               = useState<Plot[]>([]);
  const [sales, setSales]               = useState<Sale[]>([]);
  const [company, setCompany]           = useState<CompanySettings | null>(null);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [ageFilter, setAgeFilter]       = useState<AgeFilter>('all');
  const [filterBlock, setFilterBlock]   = useState('');

  useEffect(() => {
    const loadStatic = async () => {
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
      setLoading(false);
    };
    loadStatic();

    const unsub = subscribeCollection<Installment>('installments', setInstallments);
    return () => unsub();
  }, []);

  const allRows = useMemo<ShortageRow[]>(() => {
    const rows: ShortageRow[] = [];

    installments.forEach(inst => {
      if (!isInstallmentOverdue(inst)) return;

      const sale = sales.find(s => s.id === inst.saleId);
      if (sale?.status === 'cancelled') return;

      const customer = customers.find(c => c.id === inst.customerId);
      const plot     = plots.find(p => p.id === inst.plotId);
      if (!customer || !plot) return;

      const due = new Date(inst.dueDate!);
      const dDiff = daysOverdue(inst);

      let instNum: string | number = inst.installmentNumber;
      if (inst.type === 'semi_annual')    instNum = 'Semi-Annual';
      if (inst.type === 'on_possession')  instNum = 'Possession';
      if (inst.type === 'down_payment')   instNum = 'Down Payment';

      rows.push({
        id: inst.id,
        customerId: customer.customerId,
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
      
      // We also check dateRange if it is provided
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

  const totalAmount    = filteredRows.reduce((s, r) => s + r.amountDue, 0);
  
  const c30 = allRows.filter(r => r.daysDiff >= 1 && r.daysDiff <= 30).length;
  const c60 = allRows.filter(r => r.daysDiff >= 31 && r.daysDiff <= 60).length;
  const c90 = allRows.filter(r => r.daysDiff >= 61 && r.daysDiff <= 90).length;
  const c90p = allRows.filter(r => r.daysDiff > 90).length;
  
  const uniqueBlocks   = Array.from(new Set(plots.map(p => p.block))).sort();

  const handleWhatsApp = (row: ShortageRow) => {
    let phone = row.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '92' + phone.substring(1);
    else if (!phone.startsWith('92')) phone = '92' + phone;

    const dueDateStr = formatDate(row.dueDate);
    const message = `Assalam-o-Alaikum ${row.customerName},\n\naapki Plot ${row.plotNumber} Block ${row.block} ki qist #${row.installmentNumber} Rs. ${formatCurrency(row.amountDue)} tarikh ${dueDateStr} ko due thi — ${row.daysDiff} din se overdue hain.\n\nMeherbani farma ke jald payment karein.\n\nFaisal Homes${company ? `: ${company.phone}` : ''}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handlePrint = () => {
    if (!company) { alert('Configure company settings'); return; }
    
    const rows = filteredRows.map(row => [
      row.customerId,
      `${row.customerName} (${row.fatherName})`,
      row.phone,
      `${row.plotNumber} (${row.block})`,
      row.installmentNumber.toString(),
      formatDate(row.dueDate),
      `${row.daysDiff}d overdue`,
      formatCurrency(row.amountDue)
    ]);
    
    const html = generateReportHTML(
      company,
      'Shortage List',
      ['Cust ID', 'Name / Father', 'Phone', 'Plot', 'Inst#', 'Due Date', 'Status', 'Amount'],
      rows,
      `Total Records: ${filteredRows.length} | Total Amount: ${formatCurrency(totalAmount)}`
    );
    printContent(html, 'Shortage List');
  };

  const filterBtn = (val: AgeFilter, label: string, count: number, color: string) => (
    <button
      onClick={() => setAgeFilter(val)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={ageFilter === val
        ? { background: color, color: 'white' }
        : { background: '#f1f5f9', color: '#475569' }}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shortage List"
        subtitle="Track all unpaid overdue installments"
        icon={<AlertCircle size={24} />}
      />
      <ReportFilters 
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        actions={<>
          <button onClick={handlePrint} className="btn-primary">
            <Printer size={16} /> Print List
          </button>
        </>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card border-l-4" style={{ borderLeftColor: '#dc2626' }}>
          <p className="text-xs text-slate-500">Overdue Installments</p>
          <p className="text-2xl font-extrabold animate-count" style={{ color: '#dc2626' }}>{allRows.length}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#b45309' }}>
          <p className="text-xs text-slate-500">Customers in Shortage</p>
          <p className="text-2xl font-extrabold animate-count" style={{ color: '#b45309' }}>{new Set(allRows.map(r => r.customerId)).size}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#1a3c6e' }}>
          <p className="text-xs text-slate-500">Total Overdue Amount</p>
          <p className="text-xl font-extrabold animate-count" style={{ color: '#1a3c6e' }}>{formatCurrency(allRows.reduce((a, b) => a + b.amountDue, 0))}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#16a34a' }}>
          <p className="text-xs text-slate-500">Longest Overdue</p>
          <p className="text-2xl font-extrabold animate-count" style={{ color: '#16a34a' }}>{allRows.length ? Math.max(...allRows.map(r => r.daysDiff)) : 0}d</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID, father name, phone, CNIC, plot..."
              className="input-field pl-9 pr-8"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="relative min-w-[130px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <select className="input-field pl-9" value={filterBlock} onChange={e => setFilterBlock(e.target.value)}>
              <option value="">All Blocks</option>
              {uniqueBlocks.map(b => <option key={b} value={b}>Block {b}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {filterBtn('all', 'All Overdue', allRows.length, '#1a3c6e')}
          {filterBtn('1-30', '1-30 days', c30, '#eab308')}
          {filterBtn('31-60', '31-60 days', c60, '#f97316')}
          {filterBtn('61-90', '61-90 days', c90, '#ef4444')}
          {filterBtn('90+', '90+ days', c90p, '#991b1b')}
        </div>

        {loading ? (
          <BrandLoader />
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <AlertCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p>No overdue records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  {['ID', 'Customer', 'Plot', 'Inst#', 'Due Date', 'Status', 'Amount', 'Action'].map(h => (
                    <th key={h} className="table-th text-left text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id} className="table-row">
                    <td className="table-td">
                      <span className="font-mono text-xs" style={{ color: '#1d4ed8' }}>{row.customerId}</span>
                    </td>
                    <td className="table-td">
                      <p className="font-semibold text-slate-800 text-sm">{row.customerName}</p>
                      {row.fatherName && <p className="text-xs text-slate-400">{row.fatherName}</p>}
                      <p className="text-xs text-slate-400">{row.phone}</p>
                    </td>
                    <td className="table-td">
                      <p className="font-semibold">{row.plotNumber}</p>
                      <p className="text-xs text-slate-400">Block {row.block}</p>
                    </td>
                    <td className="table-td text-sm font-medium">{row.installmentNumber}</td>
                    <td className="table-td text-sm">{formatDate(row.dueDate)}</td>
                    <td className="table-td">
                      <span className="text-xs font-bold text-red-600">{row.daysDiff}d overdue</span>
                    </td>
                    <td className="table-td">
                      <span className="font-bold text-red-600">
                        {formatCurrency(row.amountDue)}
                      </span>
                    </td>
                    <td className="table-td">
                      <button
                        onClick={() => handleWhatsApp(row)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-green-50 transition-colors"
                        style={{ color: '#16a34a' }}
                      >
                        <MessageCircle size={13} /> WA
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredRows.length > 0 && (
          <div className="mt-3 flex justify-end">
            <div className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#1a3c6e', color: 'white' }}>
              Total: {formatCurrency(totalAmount)} ({filteredRows.length} records)
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShortageList;
