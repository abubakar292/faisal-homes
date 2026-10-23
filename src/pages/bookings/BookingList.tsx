import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye, Printer, XCircle, Search, X, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { updateDocument } from '../../firebase/firestore';
import { useLiveCollection, useLiveDocument } from '../../data/liveStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateBookingReceipt } from '../../utils/printUtils';
import type { Booking, Customer, Plot, CompanySettings } from '../../types';

const BookingList: React.FC = () => {
  const navigate = useNavigate();
  const { data: rawBookings, loading: l1 } = useLiveCollection<Booking>('bookings');
  const { data: customers, loading: l2 } = useLiveCollection<Customer>('customers');
  const { data: plots, loading: l3 } = useLiveCollection<Plot>('plots');
  const { data: company } = useLiveDocument<CompanySettings>('settings', 'company');
  const loading = l1 || l2 || l3;

  const bookings = useMemo(() => {
    return [...rawBookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rawBookings]);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return bookings.filter(b => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (!q) return true;
      const customer = customers.find(c => c.id === b.customerId);
      const plot = plots.find(p => p.id === b.plotId);
      return (
        (b.receiptNumber || '').toLowerCase().includes(q) ||
        (customer?.name || '').toLowerCase().includes(q) ||
        (customer?.customerId || '').toLowerCase().includes(q) ||
        (customer?.fatherName || '').toLowerCase().includes(q) ||
        (customer?.phone || '').includes(q) ||
        (plot?.plotNumber || '').toLowerCase().includes(q) ||
        (plot?.block || '').toLowerCase().includes(q)
      );
    });
  }, [bookings, customers, plots, searchQuery, statusFilter]);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '-';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} - Block ${p.block}` : '-';
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      setCancelling(true);
      await updateDocument('bookings', cancelId, { status: 'cancelled' });
      const targetBooking = bookings.find(b => b.id === cancelId);
      if (targetBooking) await updateDocument('plots', targetBooking.plotId, { status: 'available' });
      toast.success('Booking cancelled. Plot is now available.');
    } catch { toast.error('Failed to cancel booking'); } finally { setCancelling(false); setCancelId(null); }
  };

  const handlePrint = async (booking: Booking) => {
    if (!company) { toast.error('Company settings not configured'); return; }
    const customer = customers.find(c => c.id === booking.customerId);
    const plot = plots.find(p => p.id === booking.plotId);
    if (!customer || !plot) { toast.error('Customer or plot data missing'); return; }
    const html = generateBookingReceipt(booking, customer, plot, company);
    printContent(html, 'Booking Form');
  };

  const columns: Column<Booking>[] = [
    { key: 'receiptNumber', label: 'Receipt #', render: r => <span className="font-mono text-xs text-primary font-semibold">{r.receiptNumber}</span> },
    { key: 'customerId', label: 'Customer', render: r => customerName(r.customerId as string) },
    { key: 'plotId', label: 'Plot', render: r => plotInfo(r.plotId as string) },
    { key: 'bookingDate', label: 'Date', render: r => formatDate(r.bookingDate as Date) },
    { key: 'bookingAmount', label: 'Amount', render: r => formatCurrency(r.bookingAmount as number) },
    { key: 'paymentMethod', label: 'Method' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status as string} /> },
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: r => {
        const isConfirmed = (r.status as string) === 'confirmed';
        return (
          <div className="flex items-center gap-1">
            {isConfirmed && (
              <button
                onClick={() => navigate(`/sales/new?bookingId=${r.id}`)}
                className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600"
                title="Complete Sale"
              >
                <UserCheck size={15} />
              </button>
            )}
            <button onClick={() => handlePrint(r as unknown as Booking)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title="Print Receipt"><Printer size={15} /></button>
            {((r.status as string) === 'confirmed' || (r.status as string) === 'pending') && (
              <button onClick={() => setCancelId(r.id as string)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Cancel Booking"><XCircle size={15} /></button>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div>
      <PageHeader title="Booking List" subtitle={`${bookings.length} bookings`} icon={<BookOpen size={20} />}
        actions={<button onClick={() => navigate('/sales/new?mode=booking')} className="btn-primary">+ New Sale</button>} />
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
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
          <div className="flex flex-wrap gap-1 items-center">
            {(['', 'confirmed', 'converted', 'pending', 'cancelled'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st ? st : 'All'}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          columns={columns}
          data={filteredBookings}
          keyField="id"
          loading={loading}
        />
      </div>
      <ConfirmDialog isOpen={!!cancelId} onClose={() => setCancelId(null)} onConfirm={handleCancel}
        title="Cancel Booking" message="Cancel this booking? The plot will return to Available status."
        confirmLabel="Cancel Booking" loading={cancelling} />
    </div>
  );
};

export default BookingList;
