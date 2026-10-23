import React, { useEffect, useState, useMemo } from 'react';
import { History, Printer, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { getDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generatePaymentReceipt } from '../../utils/printUtils';
import type { Installment, Customer, Plot, Sale, CompanySettings } from '../../types';

const PaymentHistory: React.FC = () => {
  const { data: rawInstallments, loading: loadingInst } = useLiveCollection<Installment>('installments');
  const { data: customers, loading: loadingCust } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: loadingPlots } = useLiveCollection<Plot>('plots');
  const { data: sales, loading: loadingSales } = useLiveCollection<Sale>('sales');
  const [company, setCompany] = useState<CompanySettings | null>(null);

  const installments = useMemo(() => {
    return [...rawInstallments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rawInstallments]);

  const loading = loadingInst || loadingCust || loadingPlots || loadingSales;
  const [filterMethod, setFilterMethod] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [printInst, setPrintInst]     = useState<Installment | null>(null);
  const [printSale, setPrintSale]     = useState<Sale | null>(null);
  const [printCust, setPrintCust]     = useState<Customer | null>(null);
  const [printPlot, setPrintPlot]     = useState<Plot | null>(null);
  const [showPrint, setShowPrint]     = useState(false);

  useEffect(() => {
    let active = true;
    getDocument<CompanySettings>('settings', 'company').then(comp => {
      if (active && comp) setCompany(comp);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return installments.filter(i => {
      if (filterMethod && i.paymentMethod !== filterMethod) return false;
      if (filterStatus && i.status !== filterStatus) return false;
      if (dateFrom && i.paymentDate && new Date(i.paymentDate) < new Date(dateFrom)) return false;
      if (dateTo && i.paymentDate && new Date(i.paymentDate) > new Date(dateTo)) return false;
      if (q) {
        const customer = customers.find(c => c.id === i.customerId);
        const plot = plots.find(p => p.id === i.plotId);
        return (
          (i.receiptNumber || '').toLowerCase().includes(q) ||
          (customer?.name || '').toLowerCase().includes(q) ||
          (customer?.customerId || '').toLowerCase().includes(q) ||
          (customer?.fatherName || '').toLowerCase().includes(q) ||
          (customer?.phone || '').includes(q) ||
          (plot?.plotNumber || '').toLowerCase().includes(q) ||
          (plot?.block || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [installments, customers, plots, filterMethod, filterStatus, dateFrom, dateTo, searchQuery]);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber}-${p.block}` : '—';
  };

  // ── Print 3-copy receipt via browser print dialog ──
  const handlePrintReceipt = (inst: Installment) => {
    const customer = customers.find(c => c.id === inst.customerId);
    const plot = plots.find(p => p.id === inst.plotId);
    const sale = sales.find(s => s.id === inst.saleId);
    if (!customer || !plot || !sale || !company) { toast.error('Data not found'); return; }
    
    // Calculate paid to date BEFORE this installment (or up to this installment)
    const allInstsPaid = installments
      .filter(i => i.saleId === sale.id && i.status === 'paid' && new Date(i.paymentDate!).getTime() <= new Date(inst.paymentDate!).getTime())
      .reduce((s, i) => s + (i.amountPaid || 0), 0);

    const html = generatePaymentReceipt(inst, customer, plot, company, sale.remainingAmount, allInstsPaid);
    printContent(html, 'Payment Receipt');
  };

  const columns: Column<Installment>[] = [
    { key: 'receiptNumber', label: 'Receipt #', render: r => <span className="font-mono text-xs text-primary">{r.receiptNumber || '—'}</span> },
    { key: 'customerId', label: 'Customer', render: r => <span className="font-medium">{customerName(r.customerId as string)}</span> },
    { key: 'plotId', label: 'Plot', render: r => plotInfo(r.plotId as string) },
    { key: 'installmentNumber', label: 'Inst #', render: r => `#${r.installmentNumber}` },
    { key: 'dueDate', label: 'Due Date', render: r => formatDate(r.dueDate as Date) },
    { key: 'amountDue', label: 'Amount Due', render: r => formatCurrency(r.amountDue as number) },
    { key: 'amountPaid', label: 'Amount Paid', render: r => <span className="font-semibold text-green-600">{formatCurrency(r.amountPaid as number)}</span> },
    { key: 'paymentDate', label: 'Paid Date', render: r => formatDate(r.paymentDate as Date) },
    { key: 'paymentMethod', label: 'Method' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status as string} size="sm" /> },
    {
      key: 'actions', label: '', sortable: false,
      render: r => r.status === 'paid' ? (
        <button onClick={() => handlePrintReceipt(r as unknown as Installment)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title="Print Receipt">
          <Printer size={14} />
        </button>
      ) : null
    }
  ];

  return (
    <div>
      <PageHeader title="Payment History" subtitle={`${installments.length} total installments`} icon={<History size={20} />} />

      {/* Success banner */}
      {showPrint && printInst && (
        <div className="mb-5 p-4 rounded-xl flex items-center justify-between no-print"
          style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
          <div>
            <p className="font-bold text-sm" style={{ color: '#15803d' }}>Receipt ready!</p>
            <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
              Receipt: {printInst.receiptNumber} &middot; Paid: {formatCurrency(printInst.amountPaid)}
            </p>
          </div>
        </div>
      )}

      <div className="card no-print">
        {/* Multi-field search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by receipt#, customer name, ID, father name, phone, plot..."
            className="input-field pl-9 pr-8"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          keyField="id"
          loading={loading}
          extraFilters={
            <div className="flex flex-wrap gap-2">
              <input type="date" className="input-field w-38" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
              <input type="date" className="input-field w-38" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
              <select className="input-field w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                {['paid','pending','overdue'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input-field w-40" value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
                <option value="">All Methods</option>
                {['Cash','Bank Transfer','Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default PaymentHistory;
