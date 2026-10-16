import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { getCollection } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { Sale, Customer, Plot } from '../../types';

const AssignedPlotsList: React.FC = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSales = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sales;
    return sales.filter(s => {
      const customer = customers.find(c => c.id === s.customerId);
      const plot = plots.find(p => p.id === s.plotId);
      return (
        (s.saleNumber || '').toLowerCase().includes(q) ||
        (customer?.name || '').toLowerCase().includes(q) ||
        (customer?.customerId || '').toLowerCase().includes(q) ||
        (customer?.fatherName || '').toLowerCase().includes(q) ||
        (customer?.phone || '').includes(q) ||
        (plot?.plotNumber || '').toLowerCase().includes(q) ||
        (plot?.block || '').toLowerCase().includes(q)
      );
    });
  }, [sales, customers, plots, searchQuery]);

  useEffect(() => {
    Promise.all([
      getCollection<Sale>('sales'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
    ]).then(([s, c, p]) => {
      setSales(s.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setCustomers(c);
      setPlots(p);
      setLoading(false);
    });
  }, []);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? { number: p.plotNumber, block: p.block, size: `${p.size} ${p.sizeUnit}` } : null;
  };

  const columns: Column<Sale>[] = [
    { key: 'saleNumber', label: 'Sale #', render: r => <span className="font-mono text-xs text-primary font-semibold">{r.saleNumber}</span> },
    { key: 'customerId', label: 'Customer', render: r => (
      <div>
        <span className="font-medium">{customerName(r.customerId as string)}</span>
        {r.paymentPlanName && (
          <div className="text-[11px] text-slate-400">Plan: {r.paymentPlanName}</div>
        )}
      </div>
    ) },
    { key: 'plotId', label: 'Plot', render: r => { const p = plotInfo(r.plotId as string); return p ? `${p.number} - ${p.block}` : '—'; }},
    { key: 'size', label: 'Size', render: r => { const p = plotInfo(r.plotId as string); return p?.size || '—'; }},
    { key: 'saleDate', label: 'Sale Date', render: r => formatDate(r.saleDate as Date) },
    { key: 'finalPrice', label: 'Final Price', render: r => formatCurrency(r.finalPrice as number) },
    { key: 'downPayment', label: 'Down Payment', render: r => formatCurrency(r.downPayment as number) },
    { key: 'remainingAmount', label: 'Remaining', render: r => <span className="font-semibold text-red-600">{formatCurrency(r.remainingAmount as number)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status as string} /> },
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: r => (
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(`/sales/${r.id}`)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title="View"><Eye size={15} /></button>
          <button onClick={() => navigate(`/sales/agreement?saleId=${r.id}`)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title="Agreement"><FileText size={15} /></button>
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader title="Assigned Plots" subtitle={`${sales.length} sales`} icon={<FileText size={20} />}
        actions={<button onClick={() => navigate('/sales/new')} className="btn-primary">+ Assign Plot</button>} />
      <div className="card">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by sale#, customer name, ID, father name, phone, plot..."
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
          data={filteredSales}
          keyField="id"
          loading={loading}
        />
      </div>
    </div>
  );
};

export default AssignedPlotsList;
