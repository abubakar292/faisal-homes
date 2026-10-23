import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Users, Search, X, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { deleteDocument } from '../../firebase/firestore';
import { useLiveCollection } from '../../data/liveStore';
import { useAuth } from '../../contexts/AuthContext';
import type { Customer } from '../../types';

const CustomerList: React.FC = () => {
  const navigate  = useNavigate();
  const { isAdmin } = useAuth();
  const { data: rawCustomers, loading } = useLiveCollection<Customer>('customers');
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const customers = useMemo(() => {
    const list = [...rawCustomers];
    list.sort((a, b) => {
      const na = parseInt((a.customerId || '').split('-')[2] || '0');
      const nb = parseInt((b.customerId || '').split('-')[2] || '0');
      return nb - na; // newest first
    });
    return list;
  }, [rawCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.customerId || '').toLowerCase().includes(q) ||
      (c.fatherName || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.cnic || '').includes(q) ||
      (c.city || '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      await deleteDocument('customers', deleteId);
      toast.success('Customer deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: 'customerId',
      label: 'Customer ID',
      render: r => (
        <span
          className="font-mono font-bold text-xs px-2 py-1 rounded-lg"
          style={{ background: '#eff6ff', color: '#1d4ed8' }}
        >
          {(r.customerId as string) || '—'}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Full Name',
      render: r => <span className="font-semibold text-slate-800">{r.name}</span>,
    },
    {
      key: 'cnic',
      label: 'CNIC',
      render: r => <span className="font-mono text-xs">{r.cnic}</span>,
    },
    { key: 'phone', label: 'Phone' },
    { key: 'city',  label: 'City'  },
    {
      key: 'nominee',
      label: 'Nominee',
      render: r => {
        const nom = r.nominee as { nomineeName?: string; nomineeRelation?: string } | undefined;
        return nom?.nomineeName
          ? <span className="text-xs text-slate-500">{nom.nomineeName} ({nom.nomineeRelation})</span>
          : <span className="text-xs text-slate-300">—</span>;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: r => (
        <div className="flex items-center gap-1 row-actions">
          <button
            onClick={() => navigate(`/reports/pending/customer/${r.id}`)}
            className="btn-icon hover:bg-emerald-50 text-emerald-600"
            title="Customer Ledger"
          >
            <BookOpen size={15} />
          </button>
          <button
            onClick={() => navigate(`/customers/${r.id}`)}
            className="btn-icon hover:bg-slate-100 text-slate-500"
            title="View"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={() => navigate(`/customers/edit/${r.id}`)}
            className="btn-icon hover:bg-blue-50 text-blue-500"
            title="Edit"
          >
            <Pencil size={15} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setDeleteId(r.id as string)}
              className="btn-icon hover:bg-red-50 text-red-400"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customer List"
        subtitle={`${customers.length} customers`}
        icon={<Users size={20} />}
        actions={
          <button onClick={() => navigate('/customers/add')} className="btn btn-primary">
            <Plus size={16} /> Add Customer
          </button>
        }
      />
      <div className="card">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, ID, father name, phone, CNIC, city..."
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
          data={filteredCustomers}
          keyField="id"
          loading={loading}
          emptyMessage="No customers found"
          onRowClick={row => navigate(`/customers/${row.id}`)}
        />
      </div>
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        message="Delete this customer? Their bookings and payment records will remain."
        loading={deleting}
      />
    </div>
  );
};

export default CustomerList;
