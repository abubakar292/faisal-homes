import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Handshake } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { getCollection, deleteDocument } from '../../firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { Dealer } from '../../types';

const DealerList: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => { setLoading(true); const d = await getCollection<Dealer>('dealers'); setDealers(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const columns: Column<Dealer>[] = [
    { key: 'name', label: 'Name', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'cnic', label: 'CNIC', render: r => <span className="font-mono text-xs">{r.cnic}</span> },
    { key: 'phone', label: 'Phone' },
    
    
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: r => (
        <div className="flex gap-1">
          <button onClick={() => navigate(`/dealers/edit/${r.id}`)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500"><Pencil size={14} /></button>
          {isAdmin && <button onClick={() => setDeleteId(r.id as string)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><Trash2 size={14} /></button>}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader title="Dealer List" icon={<Handshake size={20} />}
        actions={<button onClick={() => navigate('/dealers/add')} className="btn-primary"><Plus size={16} /> Add Dealer</button>} />
      <div className="card">
        <DataTable columns={columns} data={dealers} keyField="id"
          searchKeys={['name', 'cnic', 'phone'] as never[]} loading={loading} />
      </div>
      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await deleteDocument('dealers', deleteId); toast.success('Deleted'); await load(); setDeleteId(null); }}} message="Delete this dealer?" />
    </div>
  );
};

export default DealerList;
