import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye, Printer, XCircle, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { getCollection, updateDocument, getDocument } from '../../firebase/firestore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printContent, generateBookingReceipt } from '../../utils/printUtils';
import type { Booking, Customer, Plot, CompanySettings } from '../../types';

const BookingList: React.FC = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return bookings;
    return bookings.filter(b => {
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
  }, [bookings, customers, plots, searchQuery]);

  const load = async () => {
    setLoading(true);
    const [b, c, p, comp] = await Promise.all([
      getCollection<Booking>('bookings'),
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]);
    setBookings(b.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setCustomers(c);
    setPlots(p);
    if (comp) setCompany(comp);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const customerName = (id: string) => customers.find(c => c.id === id)?.name || '—';
  const plotInfo = (id: string) => {
    const p = plots.find(pl => pl.id === id);
    return p ? `${p.plotNumber} - Block ${p.block}` : '—';
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      setCancelling(true);
      const booking = bookings.find(b => b.id === cancelId);
      await updateDocument('bookings', cancelId, { status: 'cancelled' });
      if (booking) await updateDocument('plots', booking.plotId, { status: 'available' });
      toast.success('Booking cancelled. Plot is now available.');
      await load();
    } catch { toast.error('Failed to cancel booking'); } finally { setCancelling(false); setCancelId(null); }
  };

  const handlePrint = async (booking: Booking) => {
    if (!company) { toast.error('Company settings not configured'); return; }
    const customer = customers.find(c => c.id === booking.customerId);
    const plot = plots.find(p => p.id === booking.plotId);
    if (!customer || !plot) { toast.error('Customer or plot data missing'); return; }
    const html = generateBookingReceipt(booking, customer, plot, company);
    printContent(html, `Booking-${booking.receiptNumber}`);
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
      render: r => (
        <div className="flex items-center gap-1">
          <button onClick={() => handlePrint(r as unknown as Booking)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title="Print Receipt"><Printer size={15} /></button>
          {(r.status as string) !== 'cancelled' && (
            <button onClick={() => setCancelId(r.id as string)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Cancel Booking"><XCircle size={15} /></button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader title="Booking List" subtitle={`${bookings.length} bookings`} icon={<BookOpen size={20} />}
        actions={<button onClick={() => navigate('/bookings/new')} className="btn-primary">+ New Booking</button>} />
      <div className="card">
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
