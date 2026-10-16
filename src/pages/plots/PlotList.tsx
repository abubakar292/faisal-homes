import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { getCollection, deleteDocument } from '../../firebase/firestore';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import type { Plot } from '../../types';

const PlotList: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterBlock, setFilterBlock] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    setLoading(true);
    const data = await getCollection<Plot>('plots');
    setPlots(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const blocks = [...new Set(plots.map(p => p.block))].sort();
  const categories = [...new Set(plots.map(p => p.category))].sort();

  const filtered = plots.filter(p =>
    (!filterBlock || p.block === filterBlock) &&
    (!filterCategory || p.category === filterCategory) &&
    (!filterStatus || p.status === filterStatus)
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      await deleteDocument('plots', deleteId);
      toast.success('Plot deleted');
      await load();
    } catch {
      toast.error('Failed to delete plot');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const columns: Column<Plot>[] = [
    { key: 'plotNumber', label: 'Plot #', render: r => <span className="font-mono font-semibold text-primary">{r.plotNumber}</span> },
    { key: 'block', label: 'Block/Phase' },
    { key: 'size', label: 'Size', render: r => `${r.size} ${r.sizeUnit}` },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status as string} /> },
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: r => (
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(`/plots/${r.id}`)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title="View">
            <Eye size={15} />
          </button>
          <button onClick={() => navigate(`/plots/edit/${r.id}`)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title="Edit">
            <Pencil size={15} />
          </button>
          {isAdmin && (
            <button onClick={() => setDeleteId(r.id as string)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Delete">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Plot List"
        subtitle={`${filtered.length} plots`}
        icon={<Home size={20} />}
        actions={
          <button onClick={() => navigate('/plots/add')} className="btn-primary">
            <Plus size={16} /> Add Plot
          </button>
        }
      />
      <div className="card">
        <DataTable
          columns={columns}
          data={filtered}
          keyField="id"
          searchKeys={['plotNumber', 'block', 'location'] as never[]}
          searchPlaceholder="Search by plot#, block, location..."
          loading={loading}
          emptyMessage="No plots found"
          extraFilters={
            <div className="flex gap-2">
              <select className="input-field w-36" value={filterBlock} onChange={e => setFilterBlock(e.target.value)}>
                <option value="">All Blocks</option>
                {blocks.map(b => <option key={b}>{b}</option>)}
              </select>
              <select className="input-field w-40" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
              <select className="input-field w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                {['available', 'booked', 'sold', 'cancelled', 'reserved'].map(s =>
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                )}
              </select>
            </div>
          }
        />
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        message="Are you sure you want to delete this plot? This action cannot be undone."
        loading={deleting}
      />
    </div>
  );
};

export default PlotList;
