import { db } from '../../firebase/config';
import { writeBatch, doc, collection } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import {
  getCollection, getDocument, addDocument, updateDocument,
} from '../../firebase/firestore';
import {
  formatDateInput, parseDateInput, generateReceiptNumber, formatCurrency,
} from '../../utils/formatters';
import { printInNewWindow, generateDownPaymentReceiptHTML } from '../../utils/printUtils';
import type { Sale, Customer, Plot, DownPaymentTransaction, CompanySettings } from '../../types';

const ReceiveDownPayment: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledSaleId = searchParams.get('saleId') || '';

  const [sales, setSales]         = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots]         = useState<Plot[]>([]);
  const [company, setCompany]     = useState<CompanySettings | null>(null);

  // Customer selection
  const [customerIdInput, setCustomerIdInput] = useState('');
  const [customerId, setCustomerId]           = useState('');
  const [saleId, setSaleId]                   = useState(prefilledSaleId);

  // Form fields
  const [amount, setAmount]               = useState('');
  const [paymentDate, setPaymentDate]     = useState(formatDateInput(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankName, setBankName]           = useState('');
  const [chequeNumber, setChequeNumber]   = useState('');
  const [notes, setNotes]                 = useState('');
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    const load = async () => {
      const [s, c, p, comp] = await Promise.all([
        getCollection<Sale>('sales'),
        getCollection<Customer>('customers'),
        getCollection<Plot>('plots'),
        getDocument<CompanySettings>('settings', 'company'),
      ]);
      setSales(s.filter(sa => sa.status === 'active'));
      setCustomers(c);
      setPlots(p);
      if (comp) setCompany(comp);
    };
    load();
  }, []);

  // Pre-fill from URL
  useEffect(() => {
    if (prefilledSaleId && sales.length > 0) {
      const sale = sales.find(s => s.id === prefilledSaleId);
      if (sale) {
        setSaleId(prefilledSaleId);
        setCustomerId(sale.customerId);
        const customer = customers.find(c => c.id === sale.customerId);
        if (customer) setCustomerIdInput(customer.customerId);
        const remaining = Math.max(0, (sale.remainingDownPayment || 0) - (sale.downPaymentReceived || 0));
        setAmount(String(remaining));
      }
    }
  }, [prefilledSaleId, sales, customers]);

  // Customer ID quick-fill
  const handleCustomerIdInput = (val: string) => {
    setCustomerIdInput(val);
    const clean = val.trim().toUpperCase();
    if (clean.length >= 12) {
      const match = customers.find(c => c.customerId?.toUpperCase() === clean);
      if (match) {
        setCustomerId(match.id);
        setSaleId('');
      }
    }
  };

  // Keep input in sync
  useEffect(() => {
    if (customerId) {
      const c = customers.find(cu => cu.id === customerId);
      if (c?.customerId) setCustomerIdInput(c.customerId);
    }
  }, [customerId, customers]);

  // Auto-select sale when only one for customer
  useEffect(() => {
    if (!customerId || prefilledSaleId) return;
    const customerSales = sales.filter(s => s.customerId === customerId && (s.remainingDownPayment || 0) > 0);
    if (customerSales.length === 1) setSaleId(customerSales[0].id);
  }, [customerId, sales, prefilledSaleId]);

  const selectedSale     = sales.find(s => s.id === saleId);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const selectedPlot     = selectedSale ? plots.find(p => p.id === selectedSale.plotId) : null;

  const remainingRequired = selectedSale?.remainingDownPayment || 0;
  const receivedSoFar     = selectedSale?.downPaymentReceived || 0;
  const stillPending      = Math.max(0, remainingRequired - receivedSoFar);

  const amountNum = Number(amount) || 0;
  const amountExceedsMax = amountNum > stillPending;

  const customerSalesWithDP = sales
    .filter(s => s.customerId === customerId && (s.remainingDownPayment || 0) > 0)
    .map(s => {
      const p = plots.find(pl => pl.id === s.plotId);
      return {
        value: s.id,
        label: s.saleNumber,
        sublabel: p ? `${p.plotNumber} Block ${p.block} — Pending: Rs. ${formatCurrency(Math.max(0, (s.remainingDownPayment || 0) - (s.downPaymentReceived || 0)))}` : '',
      };
    });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleId || !selectedSale || !selectedCustomer || !selectedPlot) {
      toast.error('Please select customer and sale');
      return;
    }
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (amountExceedsMax) {
      toast.error(`Amount cannot exceed Rs. ${formatCurrency(stillPending)}`);
      return;
    }

    try {
      setLoading(true);
      const receiptNumber = generateReceiptNumber('DPR');
      const paidDate      = parseDateInput(paymentDate) || new Date();

      const tx: Omit<DownPaymentTransaction, 'id'> = {
        saleId,
        customerId: selectedCustomer.id,
        plotId: selectedPlot.id,
        amount: amountNum,
        paymentDate: paidDate,
        paymentMethod: paymentMethod as DownPaymentTransaction['paymentMethod'],
        bankName: bankName.trim(),
        chequeNumber: chequeNumber.trim(),
        receiptNumber,
        notes: notes.trim(),
        createdAt: new Date(),
      };

      const batch = writeBatch(db);
      
      const txRef = doc(collection(db, 'downPaymentTransactions'));
      batch.set(txRef, { ...tx, id: txRef.id });

      const newReceived = receivedSoFar + amountNum;
      const newPending  = Math.max(0, remainingRequired - newReceived);
      const newStatus: Sale['downPaymentStatus'] = newPending === 0 ? 'complete' : 'partial';

      const saleRef = doc(db, 'sales', saleId);
      batch.update(saleRef, {
        downPaymentReceived: newReceived,
        downPaymentStatus:   newStatus,
      });

      await batch.commit();

      // Print receipt
      if (company) {
        const updatedSale: Sale = {
          ...selectedSale,
          downPaymentReceived: newReceived,
          downPaymentStatus: newStatus,
        };
        const html = generateDownPaymentReceiptHTML(
          { ...tx, id: '' } as DownPaymentTransaction,
          selectedCustomer,
          selectedPlot,
          updatedSale,
          company
        );
        printInNewWindow(html, `Down Payment Receipt — ${receiptNumber}`);
      }

      toast.success(`✅ Down payment received! Receipt: ${receiptNumber}`);

      // Reset form
      setAmount('');
      setNotes('');
      if (!prefilledSaleId) {
        setSaleId('');
        setCustomerId('');
        setCustomerIdInput('');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Receive Down Payment"
        subtitle="Record remaining down payment from customer"
        icon={<CreditCard size={20} />}
      />

      <div className="card max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">

          {/* Customer ID quick search */}
          <FormField label="Customer ID (Quick Search)" hint="Type full ID like CUST-2026-001">
            <input
              className="input-field font-mono"
              value={customerIdInput}
              onChange={e => handleCustomerIdInput(e.target.value)}
              placeholder="CUST-2026-001"
              maxLength={14}
            />
          </FormField>

          {/* Customer dropdown */}
          <FormField label="Customer" required>
            <SearchableSelect
              value={customerId}
              onChange={v => { setCustomerId(v); setSaleId(''); }}
              options={customers.map(c => ({
                value: c.id,
                label: c.name,
                sublabel: `${c.customerId || ''} · ${c.phone}`,
              }))}
              placeholder="Search by name or ID..."
            />
          </FormField>

          {/* Sale selector */}
          {customerId && customerSalesWithDP.length > 0 && (
            <FormField label="Sale / Plot" required>
              <SearchableSelect
                value={saleId}
                onChange={v => {
                  setSaleId(v);
                  const s = sales.find(sa => sa.id === v);
                  if (s) {
                    const remaining = Math.max(0, (s.remainingDownPayment || 0) - (s.downPaymentReceived || 0));
                    setAmount(String(remaining));
                  }
                }}
                options={customerSalesWithDP}
                placeholder="Select sale..."
              />
            </FormField>
          )}

          {customerId && customerSalesWithDP.length === 0 && (
            <div className="p-3 rounded-xl text-sm text-center" style={{ background: '#dcfce7', color: '#15803d' }}>
              ✅ All down payments cleared for this customer!
            </div>
          )}

          {/* Summary panel */}
          {selectedSale && selectedCustomer && selectedPlot && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider" style={{ background: '#1a3c6e', color: 'white' }}>
                Down Payment Summary
              </div>
              <div className="divide-y divide-slate-100 text-sm">
                {[
                  ['Customer', selectedCustomer.name, '#0f172a'],
                  ['Plot', `${selectedPlot.plotNumber}, Block ${selectedPlot.block}`, '#0f172a'],
                  ['Total Down Payment', `Rs. ${formatCurrency(selectedSale.downPaymentAmount || 0)}`, '#1a3c6e'],
                  ['Booking Already Paid', `Rs. ${formatCurrency(selectedSale.bookingAmountPaid || 0)}`, '#64748b'],
                  ['Previously Received (DP)', `Rs. ${formatCurrency(receivedSoFar)}`, '#16a34a'],
                  ['Still Remaining (Max)', `Rs. ${formatCurrency(stillPending)}`, stillPending > 0 ? '#b91c1c' : '#16a34a'],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-bold" style={{ color: color as string }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amount field */}
          {selectedSale && stillPending > 0 && (
            <>
              <FormField
                label={`Amount Receiving (Rs.) — Max: Rs. ${formatCurrency(stillPending)}`}
                required
                error={amountExceedsMax ? `Cannot exceed Rs. ${formatCurrency(stillPending)}` : undefined}
              >
                <input
                  className={`input-field font-semibold ${amountExceedsMax ? 'border-red-400' : ''}`}
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="1"
                  max={stillPending}
                  style={{ color: '#1a3c6e' }}
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Payment Date" required>
                  <input
                    className="input-field"
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                  />
                </FormField>

                <FormField label="Payment Method">
                  <select className="input-field" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {['Cash', 'Bank Transfer', 'Cheque'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </FormField>

                {paymentMethod !== 'Cash' && (
                  <FormField label="Bank Name">
                    <input className="input-field" value={bankName} onChange={e => setBankName(e.target.value)} />
                  </FormField>
                )}

                {paymentMethod === 'Cheque' && (
                  <FormField label="Cheque Number">
                    <input className="input-field" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} />
                  </FormField>
                )}
              </div>

              <FormField label="Notes">
                <textarea className="input-field h-16 resize-none" value={notes} onChange={e => setNotes(e.target.value)} />
              </FormField>

              {amountNum > 0 && !amountExceedsMax && (
                <div className="flex justify-between items-center p-3 rounded-xl" style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
                  <span className="text-sm font-semibold" style={{ color: '#15803d' }}>Amount to Receive</span>
                  <span className="text-lg font-extrabold" style={{ color: '#15803d' }}>Rs. {formatCurrency(amountNum)}</span>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !selectedSale || stillPending === 0 || amountExceedsMax}
              className="btn btn-primary disabled:opacity-60"
            >
              <Save size={16} /> {loading ? 'Processing...' : 'Receive & Print Receipt'}
            </button>
            <button type="button" onClick={() => navigate('/payments/down-payments')} className="btn btn-secondary">
              <X size={16} /> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReceiveDownPayment;
