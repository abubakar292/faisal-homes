import { db } from '../../firebase/config';
import { writeBatch, doc, collection } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Receipt, Save, X, Printer, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import PrintPrompt from '../../components/ui/PrintPrompt';
import {
  getCollection, getDocument, updateDocument,
} from '../../firebase/firestore';
import {
  formatDateInput, parseDateInput, generateReceiptNumber,
  formatCurrency, formatDate, getDaysOverdue,
} from '../../utils/formatters';
import { printContent, generatePaymentReceipt } from '../../utils/printUtils';
import type { Customer, Sale, Plot, Installment, CompanySettings } from '../../types';

interface Props { possessionMode?: boolean; embedded?: boolean; }

const ReceivePayment: React.FC<Props> = ({ possessionMode = false, embedded = false }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [sales,        setSales]        = useState<Sale[]>([]);
  const [plots,        setPlots]        = useState<Plot[]>([]);
  const [allInsts,     setAllInsts]     = useState<Installment[]>([]);
  const [pendingInsts, setPendingInsts] = useState<Installment[]>([]);
  const [company,      setCompany]      = useState<CompanySettings | null>(null);

  const [customerId,    setCustomerId]    = useState('');
  const [customerIdInput, setCustomerIdInput] = useState('');
  const [saleId,        setSaleId]        = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [amountPaid,    setAmountPaid]    = useState('');
  
  const [paymentDate,   setPaymentDate]   = useState(formatDateInput(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankName,      setBankName]      = useState('');
  const [chequeNumber,  setChequeNumber]  = useState('');
  const [notes,         setNotes]         = useState('');

  const [loading,          setLoading]          = useState(false);
  const [lastInstallment,  setLastInstallment]  = useState<Installment | null>(null);
  const [lastSale,         setLastSale]         = useState<Sale | null>(null);
  const [lastCustomer,     setLastCustomer]     = useState<Customer | null>(null);
  const [lastPlot,         setLastPlot]         = useState<Plot | null>(null);
  const [showPrint,        setShowPrint]        = useState(false);

  // ── Load ──
  useEffect(() => {
    Promise.all([
      getCollection<Customer>('customers'),
      getCollection<Sale>('sales'),
      getCollection<Plot>('plots'),
      getCollection<Installment>('installments'),
      getDocument<CompanySettings>('settings', 'company'),
    ]).then(([c, s, p, i, comp]) => {
      setCustomers(c);
      setSales(s.filter(sa => sa.status === 'active'));
      setPlots(p);
      setAllInsts(i);
      if (comp) setCompany(comp);

      const qCust = searchParams.get('customerId');
      const qSale = searchParams.get('saleId');
      const qInst = searchParams.get('installmentId');
      if (qCust) setCustomerId(qCust);
      if (qSale) setSaleId(qSale);
      if (qInst) setInstallmentId(qInst);
    });
  }, [searchParams]);

  // ── Customer ID auto-fill ──
  const handleCustomerIdInput = (value: string) => {
    setCustomerIdInput(value);
    const clean = value.trim().toUpperCase();
    if (clean.length >= 12) {
      const match = customers.find(c => c.customerId && c.customerId.toUpperCase() === clean);
      if (match) {
        setCustomerId(match.id);
        setSaleId('');
        setInstallmentId('');
      }
    }
  };

  // Keep customer ID input in sync when customer is selected via dropdown
  useEffect(() => {
    if (customerId) {
      const c = customers.find(cu => cu.id === customerId);
      if (c?.customerId) setCustomerIdInput(c.customerId);
    } else {
      setCustomerIdInput('');
    }
  }, [customerId, customers]);

  // ── When sale changes — load pending installments ──
  useEffect(() => {
    if (!saleId) { setPendingInsts([]); setInstallmentId(''); return; }
    const pending = allInsts
      .filter(i => i.saleId === saleId && i.status !== 'paid')
      .sort((a, b) => {
        const dateA = new Date(a.dueDate).getTime();
        const dateB = new Date(b.dueDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        if (a.type === 'monthly' && b.type !== 'monthly') return -1;
        if (b.type === 'monthly' && a.type !== 'monthly') return 1;
        return a.installmentNumber - b.installmentNumber;
      });
    setPendingInsts(pending);
    if (pending.length > 0) {
      const next = pending[0];
      const days = getDaysOverdue(new Date(next.dueDate));
      const comp = company;
      setInstallmentId(next.id);
      setAmountPaid(String(next.amountDue - (next.amountPaid || 0)));
      
    }
  }, [saleId, allInsts, company]);

  // ── When installment changes ──
  const onInstallmentChange = (id: string) => {
    const inst = pendingInsts.find(i => i.id === id);
    if (!inst) return;
    const days = getDaysOverdue(new Date(inst.dueDate));
    setInstallmentId(id);
    setAmountPaid(String(inst.amountDue - (inst.amountPaid || 0)));
    
  };

  const selectedInstallment = pendingInsts.find(i => i.id === installmentId);
  const selectedSale        = sales.find(s => s.id === saleId);
  const selectedPlot        = selectedSale ? plots.find(p => p.id === selectedSale.plotId) : null;
  const selectedCustomer    = customers.find(c => c.id === customerId);

  // ── Paid so far (excluding current) ──
  const paidSoFar = allInsts
    .filter(i => i.saleId === saleId && i.id !== installmentId) // exclude current so we can just add the new total or current payment cleanly
    .reduce((s, i) => s + (i.amountPaid || 0), 0) + (selectedInstallment?.amountPaid || 0); // Include what was already paid on THIS installment before this transaction

  const totalToPay = (Number(amountPaid) || 0);
  const remainingBefore       = selectedSale?.remainingAmount ?? 0;
  const remainingAfterPayment = Math.max(0, remainingBefore - (Number(amountPaid) || 0));

  // ── Down Payment Blocking Logic ──
  const dpRequired  = selectedSale?.remainingDownPayment || 0;
  const dpReceived  = selectedSale?.downPaymentReceived || 0;
  const dpPending   = dpRequired > 0 ? Math.max(0, dpRequired - dpReceived) : 0;
  const isBlocked   = dpPending > 0;

  // ── Submit ──
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installmentId || !amountPaid) {
      toast.error('Please select installment and enter amount');
      return;
    }
    if (!selectedInstallment || !selectedSale) {
      toast.error('Invalid selection');
      return;
    }
    try {
      setLoading(true);
      const receiptNumber = generateReceiptNumber('PAY');
      const paidDate      = parseDateInput(paymentDate) || new Date();

      const currentAmountPaid = Number(amountPaid);
      const outstanding = selectedInstallment.amountDue - (selectedInstallment.amountPaid || 0);
      
      if (currentAmountPaid > outstanding) {
        toast.error(`Cannot pay more than outstanding amount (Rs. ${formatCurrency(outstanding)})`);
        setLoading(false);
        return;
      }

      const totalAmountPaidNow = (selectedInstallment.amountPaid || 0) + currentAmountPaid;
      const isFullyPaid = totalAmountPaidNow >= selectedInstallment.amountDue;
      const newStatus = isFullyPaid ? 'paid' : 'partial';

      const batch = writeBatch(db);

      // Update Installment
      const instRef = doc(db, 'installments', installmentId);
      batch.update(instRef, {
        status:        newStatus,
        amountPaid:    totalAmountPaidNow,
        paymentDate:   paidDate,
        paymentMethod,
        bankName,
        chequeNumber,
        notes,
        receiptNumber,
      });

      // Update Sale
      const newRemaining = Math.max(0, selectedSale.remainingAmount - currentAmountPaid);
      const saleUpdates: Record<string, unknown> = { remainingAmount: newRemaining };
      if (possessionMode) saleUpdates.possessionGiven = true;
      if (newRemaining === 0) saleUpdates.status = 'completed';
      const saleRef = doc(db, 'sales', saleId);
      batch.update(saleRef, saleUpdates);

      await batch.commit();

      const updatedInst: Installment = {
        ...selectedInstallment,
        status:        newStatus,
        amountPaid:    totalAmountPaidNow,
        paymentDate:   paidDate,
        paymentMethod: paymentMethod as Installment['paymentMethod'],
        bankName,
        chequeNumber,
        receiptNumber,
      };

      setLastInstallment(updatedInst);
      setLastSale({ ...selectedSale, remainingAmount: newRemaining });
      setLastCustomer(selectedCustomer || null);
      setLastPlot(selectedPlot || null);
      setShowPrint(true);

      toast.success(`✅ Payment recorded! Receipt: ${receiptNumber}`);

      // Refresh installments
      const refreshed = await getCollection<Installment>('installments');
      setAllInsts(refreshed);
      setSales(prev => prev.map(s =>
        s.id === saleId ? { ...s, remainingAmount: newRemaining, status: newRemaining === 0 ? 'completed' : s.status } : s
      ));
      setInstallmentId('');
      setAmountPaid('');
      
      setNotes('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  // ── Print 3-copy receipt ──
  const handlePrint = () => {
    if (!lastInstallment || !lastCustomer || !lastPlot || !company || !lastSale) return;
    const html = generatePaymentReceipt(lastInstallment, lastCustomer, lastPlot, company, lastSale.remainingAmount, paidSoFar + Number(amountPaid)); // paidSoFar already includes prev payments on this inst
    printContent(html, `Payment-${lastInstallment.receiptNumber}`);
  };

  return (
    <div>
      {!embedded && (
        <PageHeader
          title={possessionMode ? 'On-Possession Payment' : 'Receive Payment'}
          subtitle={possessionMode ? 'Record possession payment' : 'Record installment payment'}
          icon={<Receipt size={20} />}
        />
      )}



      {/* ── Print Prompt ── */}
      {lastInstallment && lastCustomer && lastSale && (
        <PrintPrompt
          show={showPrint}
          title="Payment Recorded!"
          message={`Receipt: ${lastInstallment.receiptNumber} · Paid: ${formatCurrency(lastInstallment.amountPaid)} · Remaining: ${formatCurrency(lastSale.remainingAmount)}`}
          options={[
            { label: 'Print 3-Copy Receipt', onClick: handlePrint }
          ]}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* ── Form ── */}
      <div className="card max-w-2xl no-print">
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

          {/* Customer */}
          <FormField label="Customer" required>
            <SearchableSelect
              value={customerId}
              onChange={v => { setCustomerId(v); setSaleId(''); setInstallmentId(''); }}
              options={customers.map(c => ({
                value:    c.id,
                label:    c.name,
                sublabel: `${c.customerId || ''} · ${c.cnic}`,
              }))}
              placeholder="Search by name or customer ID..."
            />
          </FormField>

          {/* Sale / Plot */}
          {customerId && (
            <FormField label="Sale / Plot" required>
              <SearchableSelect
                value={saleId}
                onChange={v => { setSaleId(v); setInstallmentId(''); }}
                options={sales.filter(s => s.customerId === customerId).map(s => {
                  const p = plots.find(pl => pl.id === s.plotId);
                  return {
                    value:    s.id,
                    label:    s.saleNumber,
                    sublabel: p
                      ? `${p.plotNumber} Block ${p.block} · Rem: ${formatCurrency(s.remainingAmount)}`
                      : '',
                  };
                })}
                placeholder="Select sale..."
              />
            </FormField>
          )}

          {/* Installment selector */}
          {saleId && pendingInsts.length > 0 && (
            <FormField label="Installment #" required>
              <select
                className="input-field"
                value={installmentId}
                onChange={e => onInstallmentChange(e.target.value)}
              >
                <option value="">Select installment...</option>
                {pendingInsts.map(i => (
                  <option key={i.id} value={i.id}>
                    #{i.installmentNumber} — Due: {formatDate(i.dueDate)} — {formatCurrency(i.amountDue - (i.amountPaid || 0))} outstanding
                    {i.status === 'overdue' ? ' ⚠ OVERDUE' : ''}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {saleId && pendingInsts.length === 0 && (
            <div className="p-3 rounded-xl text-sm text-center"
              style={{ background: '#dcfce7', color: '#15803d' }}>
              ✅ All installments for this sale are paid!
            </div>
          )}

          {/* ── Balance info panel ── */}
          {selectedInstallment && selectedSale && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
                style={{ background: '#1a3c6e', color: 'white' }}>
                Payment Summary
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  ['Amount Due (this installment)', formatCurrency(selectedInstallment.amountDue), '#0f172a'],
                  ['Due Date',                       formatDate(selectedInstallment.dueDate),       '#64748b'],
                  
                  ['Total Paid So Far',              formatCurrency(paidSoFar),                     '#15803d'],
                  ['Remaining Balance (before)',     formatCurrency(remainingBefore),               '#1d4ed8'],
                  ['Remaining Balance (after pay)',  formatCurrency(remainingAfterPayment),         remainingAfterPayment === 0 ? '#15803d' : '#b91c1c'],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-slate-500">{label as string}</span>
                    <span className="text-sm font-bold" style={{ color: color as string }}>{value as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Down Payment Blocking Alert ── */}
          {saleId && isBlocked && (
            <div className="rounded-xl border-2 p-4 mb-2" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={22} style={{ color: '#b91c1c', flexShrink: 0, marginTop: 2 }} />
                <div className="flex-1">
                  <p className="font-bold text-base" style={{ color: '#b91c1c' }}>Installments Locked</p>
                  <p className="text-sm mt-1" style={{ color: '#7f1d1d' }}>
                    This customer has a pending down payment of{' '}
                    <strong>{formatCurrency(dpPending)}</strong>.
                    Please collect the remaining down payment first before accepting installments.
                  </p>
                  <Link
                    to={`/payments/down-payment-ledger?saleId=${saleId}`}
                    className="inline-flex items-center gap-1 mt-3 px-3 py-1.5 rounded-lg text-sm font-semibold"
                    style={{ background: '#b91c1c', color: 'white' }}
                  >
                    Go to Down Payments &gt;
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Payment fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Amount Paid (Rs.)" required>
              <input
                className="input-field font-semibold"
                type="number"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                min="0"
                style={{ color: '#1a3c6e' }}
              />
            </FormField>

            

            <FormField label="Payment Date" required>
              <input
                className="input-field"
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </FormField>

            <FormField label="Payment Method">
              <select
                className="input-field"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                {['Cash', 'Bank Transfer', 'Cheque'].map(m => (
                  <option key={m}>{m}</option>
                ))}
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

          {/* Total to collect */}
          {totalToPay > 0 && (
            <div className="flex justify-between items-center p-3 rounded-xl"
              style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
              <span className="text-sm font-semibold" style={{ color: '#15803d' }}>Total to Collect</span>
              <span className="text-lg font-extrabold" style={{ color: '#15803d' }}>{formatCurrency(totalToPay)}</span>
            </div>
          )}

          <FormField label="Notes">
            <textarea
              className="input-field h-16 resize-none"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </FormField>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || isBlocked} className="btn btn-primary disabled:opacity-60">
              <Save size={16} /> {loading ? 'Processing...' : 'Record Payment'}
            </button>
            <button type="button" onClick={() => navigate('/payments/history')} className="btn btn-secondary">
              <X size={16} /> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReceivePayment;
