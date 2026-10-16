import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo';
import toast from 'react-hot-toast';
import { BookOpen, Save, X, Printer } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import PrintPrompt from '../../components/ui/PrintPrompt';
import {
  addDocument,
  updateDocument,
  getCollection,
  getDocument,
} from '../../firebase/firestore';
import {
  formatDateInput,
  parseDateInput,
  generateReceiptNumber,
  formatCurrency,
} from '../../utils/formatters';
import { printContent, generateBookingReceipt } from '../../utils/printUtils';
import type { Customer, Plot, Booking, CompanySettings } from '../../types';

const NewBooking: React.FC = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots,     setPlots]     = useState<Plot[]>([]);
  const [company,   setCompany]   = useState<CompanySettings | null>(null);

  const [form, setForm] = useState({
    customerId:      '',
    plotId:          '',
    bookingDate:     formatDateInput(new Date()),
    perMarlaRate:    '',
    totalPrice:      '',     // auto-calculated but editable
    bookingAmount:   '',
    paymentMethod:   'Cash',
    bankName:        '',
    chequeNumber:    '',
    referenceNumber: '',
    notes:           '',
  });

  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [loading,       setLoading]       = useState(false);
  const [lastBooking,   setLastBooking]   = useState<Booking | null>(null);
  const [lastCustomer,  setLastCustomer]  = useState<Customer | null>(null); // snapshot at save
  const [lastPlotSnap,  setLastPlotSnap]  = useState<Plot | null>(null);     // snapshot at save
  const [showPrint,     setShowPrint]     = useState(false);

  // ── Load data ──
  useEffect(() => {
    Promise.all([
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([c, p, comp]) => {
      setCustomers(c);
      setPlots(p.filter(pl => pl.status === 'available'));
      if (comp) setCompany(comp);
    });
  }, []);

  const selectedPlot     = plots.find(p => p.id === form.plotId);
  const selectedCustomer = customers.find(c => c.id === form.customerId);

  // ── Auto-calculate total price when perMarlaRate or plot changes ──
  useEffect(() => {
    if (!form.perMarlaRate || !selectedPlot) return;
    const rate = Number(form.perMarlaRate);
    if (isNaN(rate) || rate <= 0) return;
    const marlas =
      selectedPlot.sizeUnit === 'Kanal'
        ? selectedPlot.size * 20
        : selectedPlot.sizeUnit === 'Sq.Ft'
        ? selectedPlot.size / 272.25        // 1 marla ≈ 272.25 sq.ft
        : selectedPlot.size;                // already in Marla
    const calculated = Math.round(rate * marlas);
    setForm(f => ({ ...f, totalPrice: String(calculated) }));
  }, [form.perMarlaRate, form.plotId, selectedPlot]);

  // ── Validate ──
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customerId)                                          e.customerId    = 'Customer is required';
    if (!form.plotId)                                              e.plotId        = 'Plot is required';
    if (!form.bookingDate)                                         e.bookingDate   = 'Date is required';
    if (!form.perMarlaRate || Number(form.perMarlaRate) <= 0)      e.perMarlaRate  = 'Per Marla Rate is required';
    if (!form.totalPrice   || Number(form.totalPrice)   <= 0)      e.totalPrice    = 'Total Price is required';
    if (!form.bookingAmount || Number(form.bookingAmount) <= 0)    e.bookingAmount = 'Booking amount is required';
    if (form.paymentMethod === 'Cheque' && !form.chequeNumber)     e.chequeNumber  = 'Cheque number required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const receiptNumber = generateReceiptNumber('BK');
      const bookingData: Omit<Booking, 'id'> = {
        receiptNumber,
        customerId:      form.customerId,
        plotId:          form.plotId,
        bookingDate:     parseDateInput(form.bookingDate)!,
        perMarlaRate:    Number(form.perMarlaRate),
        totalPrice:      Number(form.totalPrice),
        bookingAmount:   Number(form.bookingAmount),
        paymentMethod:   form.paymentMethod as Booking['paymentMethod'],
        bankName:        form.bankName,
        chequeNumber:    form.chequeNumber,
        referenceNumber: form.referenceNumber,
        notes:           form.notes,
        status:          'confirmed',
        createdAt:       new Date(),
      };
      const bookingId = await addDocument('bookings', bookingData);
      await updateDocument('plots', form.plotId, { status: 'booked' });

      const saved = { ...bookingData, id: bookingId };

      // Snapshot customer + plot BEFORE resetting the form
      setLastBooking(saved);
      setLastCustomer(customers.find(c => c.id === form.customerId) || null);
      setLastPlotSnap(plots.find(p => p.id === form.plotId) || null);
      setShowPrint(true);
      toast.success(`Booking confirmed! Receipt: ${receiptNumber}`);

      // Reset form
      setForm({
        customerId: '', plotId: '', bookingDate: formatDateInput(new Date()),
        perMarlaRate: '', totalPrice: '', bookingAmount: '',
        paymentMethod: 'Cash', bankName: '', chequeNumber: '',
        referenceNumber: '', notes: '',
      });
    } catch {
      toast.error('Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  // ── Print 3-copy receipt ──
  const handlePrint = () => {
    if (!lastBooking || !lastCustomer || !lastPlotSnap || !company) return;
    const html = generateBookingReceipt(lastBooking, lastCustomer, lastPlotSnap, company);
    printContent(html, `Booking-${lastBooking.receiptNumber}`);
  };

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader
        title="New Booking"
        subtitle="Book a plot — pricing is set via per-marla rate"
        icon={<BookOpen size={20} />}
      />

      {/* ── Print Prompt ── */}
      {lastBooking && (
        <PrintPrompt
          show={showPrint}
          title="Booking Confirmed!"
          message={`Receipt #: ${lastBooking.receiptNumber} · Total Price: ${formatCurrency(lastBooking.totalPrice)} · Booking Paid: ${formatCurrency(lastBooking.bookingAmount)}`}
          options={[
            { label: 'Print 3-Copy Receipt', onClick: handlePrint }
          ]}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* ── Form card ── */}
      <div className="card max-w-2xl no-print">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Customer */}
          <FormField label="Customer" required error={errors.customerId}>
            <SearchableSelect
              value={form.customerId}
              onChange={v => setForm(f => ({ ...f, customerId: v }))}
              options={customers.map(c => ({
                value:    c.id,
                label:    c.name,
                sublabel: `${c.customerId || ''} · ${c.cnic}`,
              }))}
              placeholder="Search by name or customer ID..."
              error={!!errors.customerId}
            />
          </FormField>

          {/* Plot */}
          <FormField label="Plot (Available only)" required error={errors.plotId}>
            <SearchableSelect
              value={form.plotId}
              onChange={v => setForm(f => ({ ...f, plotId: v, perMarlaRate: '', totalPrice: '' }))}
              options={plots.map(p => ({
                value:    p.id,
                label:    `${p.plotNumber} — Block ${p.block}`,
                sublabel: `${p.size} ${p.sizeUnit} · ${p.category} · ${p.location || 'N/A'}`,
              }))}
              placeholder="Search available plots..."
              error={!!errors.plotId}
            />
          </FormField>

          {/* Plot info panel */}
          {selectedPlot && (
            <div className="p-3 rounded-xl text-sm space-y-1"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div className="flex items-center gap-2 font-semibold text-blue-800">
                <Logo size={20} variant="dark" /> {selectedPlot.plotNumber} · Block {selectedPlot.block}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-blue-700">
                <span>Size: <strong>{selectedPlot.size} {selectedPlot.sizeUnit}</strong></span>
                <span>Category: <strong>{selectedPlot.category}</strong></span>
                <span>Location: <strong>{selectedPlot.location || '—'}</strong></span>
              </div>
            </div>
          )}

          {/* ── Pricing section ── */}
          {selectedPlot && (
            <>
              <h3 className="form-section-header mt-2">Pricing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Per Marla Rate (Rs.)" required error={errors.perMarlaRate}>
                  <input
                    className={`input-field ${errors.perMarlaRate ? 'input-error' : ''}`}
                    type="number"
                    value={form.perMarlaRate}
                    onChange={set('perMarlaRate')}
                    placeholder="e.g., 500000"
                    min="0"
                  />
                </FormField>

                <FormField label="Plot Size (read-only)">
                  <input
                    className="input-field"
                    readOnly
                    value={`${selectedPlot.size} ${selectedPlot.sizeUnit}`}
                    style={{ background: '#f8fafc', color: '#64748b' }}
                  />
                </FormField>

                <FormField label="Total Price (Rs.)" required error={errors.totalPrice} hint="Auto-calculated, editable">
                  <input
                    className={`input-field font-semibold ${errors.totalPrice ? 'input-error' : ''}`}
                    type="number"
                    value={form.totalPrice}
                    onChange={set('totalPrice')}
                    placeholder="Auto-calculated"
                    min="0"
                    style={{ color: '#1a3c6e' }}
                  />
                </FormField>
              </div>

              {form.totalPrice && (
                <div className="p-2.5 rounded-lg text-xs font-medium"
                  style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                  💰 Total Price: <strong>{formatCurrency(Number(form.totalPrice))}</strong>
                  {form.perMarlaRate && selectedPlot && (
                    <span className="ml-2 opacity-70">
                      ({selectedPlot.sizeUnit === 'Kanal'
                        ? `${selectedPlot.size} Kanal = ${selectedPlot.size * 20} Marla`
                        : `${selectedPlot.size} ${selectedPlot.sizeUnit}`
                      } × {formatCurrency(Number(form.perMarlaRate))}/Marla)
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Booking details ── */}
          <h3 className="form-section-header mt-2">Booking Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Booking Date" required error={errors.bookingDate}>
              <input
                className={`input-field ${errors.bookingDate ? 'input-error' : ''}`}
                type="date"
                value={form.bookingDate}
                onChange={set('bookingDate')}
              />
            </FormField>

            <FormField label="Booking Amount (Rs.)" required error={errors.bookingAmount}>
              <input
                className={`input-field ${errors.bookingAmount ? 'input-error' : ''}`}
                type="number"
                value={form.bookingAmount}
                onChange={set('bookingAmount')}
                placeholder="Advance payment amount"
                min="0"
              />
            </FormField>

            <FormField label="Payment Method">
              <select className="input-field" value={form.paymentMethod} onChange={set('paymentMethod')}>
                {['Cash', 'Bank Transfer', 'Cheque'].map(m => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </FormField>

            {form.paymentMethod !== 'Cash' && (
              <FormField label="Bank Name">
                <input className="input-field" value={form.bankName} onChange={set('bankName')} placeholder="Bank name" />
              </FormField>
            )}

            {form.paymentMethod === 'Cheque' && (
              <FormField label="Cheque Number" required error={errors.chequeNumber}>
                <input
                  className={`input-field ${errors.chequeNumber ? 'input-error' : ''}`}
                  value={form.chequeNumber}
                  onChange={set('chequeNumber')}
                  placeholder="Cheque #"
                />
              </FormField>
            )}

            <FormField label="Reference Number">
              <input className="input-field" value={form.referenceNumber} onChange={set('referenceNumber')} placeholder="Optional" />
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea className="input-field h-20 resize-none" value={form.notes} onChange={set('notes')} />
          </FormField>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-60">
              <Save size={16} /> {loading ? 'Processing...' : 'Confirm Booking'}
            </button>
            <button type="button" onClick={() => navigate('/bookings/list')} className="btn btn-secondary">
              <X size={16} /> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewBooking;
