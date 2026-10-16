import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserCheck, Save, X, Plus, Trash2, AlertTriangle, CheckCircle, ClipboardList, RefreshCw, Info, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addMonths } from 'date-fns';
import { db } from '../../firebase/config';
import { writeBatch, doc, collection } from 'firebase/firestore';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import PrintPrompt from '../../components/ui/PrintPrompt';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
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
import type { Dealer, 
  Customer, Plot, Sale, Installment, Booking, InstallmentRow, PaymentPlan,
 } from '../../types';

// ── Helpers ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

const makeRow = (): InstallmentRow => ({
  id:            uid(),
  months:        36,
  intervalMonths: 1,
  monthlyAmount: 0,
  totalAmount:   0,
});

// Installment frequency helpers (rows can be monthly, quarterly, semi-annual or annual)
const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1,  label: 'Month' },
  { value: 3,  label: '3 Months - Quarterly' },
  { value: 6,  label: '6 Months - Semi-Annual' },
  { value: 12, label: '12 Months - Annual' },
];
const INTERVAL_FREQUENCY: Record<number, string> = {
  1: 'Monthly', 3: 'Quarterly', 6: 'Semi-Annual', 12: 'Annual',
};
const PLAN_INTERVAL: Record<string, number> = {
  Monthly: 1, Quarterly: 3, 'Semi-Annual': 6, Annual: 12,
};
const rowInterval = (r: InstallmentRow): number =>
  r.intervalMonths && r.intervalMonths > 0 ? r.intervalMonths : 1;
const rowCount = (r: InstallmentRow): number =>
  r.months > 0 ? Math.floor(r.months / rowInterval(r)) : 0;
const rowMisaligned = (r: InstallmentRow): boolean =>
  r.months > 0 && r.months % rowInterval(r) !== 0;
const planDurationMonths = (p: PaymentPlan): number =>
  p.durationUnit === 'years' ? (p.duration || 0) * 12 : (p.duration || 0);
const planOptionLabel = (p: PaymentPlan): string => {
  const unit = p.durationUnit === 'years'
    ? (p.duration === 1 ? 'year' : 'years')
    : (p.duration === 1 ? 'month' : 'months');
  return `${p.name} - ${p.duration} ${unit}, ${p.installmentType}, ${p.numberOfInstallments} installments, ${p.downPaymentPercent}% down`;
};

// ── Component ──────────────────────────────────────────────────────────────────
const AssignPlot: React.FC = () => {
  const navigate = useNavigate();

  // ── Data from Firestore ──
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [plots,     setPlots]     = useState<Plot[]>([]);
  const [bookings,  setBookings]  = useState<Booking[]>([]);

  // ── Form state ──
  const [customerId,    setCustomerId]    = useState('');
  const [plotId,        setPlotId]        = useState('');
  const [bookingId,     setBookingId]     = useState('');
  const [saleDate,      setSaleDate]      = useState(formatDateInput(new Date()));
  const [totalPrice,    setTotalPrice]    = useState(0);
  const [bookingPaid,   setBookingPaid]   = useState(0);     // from booking record
  const [discount,      setDiscount]      = useState(0);
  const [downPaymentPercent, setDownPaymentPercent] = useState(0);
  const [downPaymentAmount, setDownPaymentAmount]   = useState(0);
  const [dpLastEdited, setDpLastEdited]             = useState<'percent'|'amount'>('percent');
  const [planMonths, setPlanMonths]                 = useState(36);
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [savedSaleId, setSavedSaleId] = useState('');
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Custom installment rows ──
  const [rows, setRows] = useState<InstallmentRow[]>([makeRow()]);

  // Saved payment plans
  const [paymentPlans, setPaymentPlans]       = useState<PaymentPlan[]>([]);
  const [plansLoading, setPlansLoading]       = useState(true);
  const [paymentPlanId, setPaymentPlanId]     = useState('');
  const [paymentPlanName, setPaymentPlanName] = useState('');
  const [pendingPlanId, setPendingPlanId]     = useState('');

  // ── Semi-Annual ──
  const [semiAnnualEnabled, setSemiAnnualEnabled] = useState(false);
  const [semiAnnualAmount, setSemiAnnualAmount] = useState(0);

  // ── On-Possession ──
  const [onPossessionEnabled, setOnPossessionEnabled] = useState(false);
  const [onPossessionAmount, setOnPossessionAmount] = useState(0);
  const [onPossessionDate, setOnPossessionDate] = useState(formatDateInput(new Date()));
  const [onPossessionNotes, setOnPossessionNotes] = useState('');

  // ── Inline dealer ──
  const [dealerName,             setDealerName]             = useState('');
  const [dealerPhone,            setDealerPhone]            = useState('');
  const [dealerCommissionPct,    setDealerCommissionPct]    = useState(0);
  const [dealerCommissionAmt,    setDealerCommissionAmt]    = useState(0);
  const [dealerCommissionStatus, setDealerCommissionStatus] = useState<'pending'|'paid'>('pending');
  const [includeRemainingDownPayment, setIncludeRemainingDownPayment] = useState(false);

  // ── Derived amounts ──
  const finalPrice              = Math.max(0, totalPrice - discount);
  const balanceAfterBooking     = Math.max(0, finalPrice - bookingPaid);
  
  const remainingDownPayment = downPaymentAmount - bookingPaid;
  
  const onPossessionDeduction = onPossessionEnabled ? onPossessionAmount : 0;
  const remainingForInstallments = Math.max(0, finalPrice - downPaymentAmount - onPossessionDeduction);

  // ── Grand total of exact generated installment plan ──
  const totalMonths = rows.reduce((s, r) => s + r.months, 0);
  // Number of regular installments (a row of 24 months every 3 months = 8 installments)
  const regularCount = rows.reduce((s, r) => s + rowCount(r), 0);

  // Semi-annual payments are EXTRA payments on every 6th month, in addition to the regular installment
  const semiAnnualCount = semiAnnualEnabled ? Math.floor(totalMonths / 6) : 0;
  const semiAnnualTotal = semiAnnualCount * (semiAnnualEnabled ? semiAnnualAmount : 0);

  // Each row sums exactly to its totalAmount (the last installment of a row absorbs rounding)
  const exactMonthlyTotal = rows.reduce((s, r) => s + (rowCount(r) > 0 ? r.totalAmount : 0), 0);
  
  const remainingForMonthly = remainingForInstallments - semiAnnualTotal;
  const grandTotal = exactMonthlyTotal;
  const remainingToAllocate = remainingForMonthly - grandTotal;
  const difference = Math.abs(remainingToAllocate);
  const isExact = difference < 1;
  const isRounding = difference >= 1 && difference <= 100;
  const isMismatch = difference > 100;
  const planValid = isExact || isRounding;
  const misalignedRow = rows.find(rowMisaligned);

  // Saved plan helpers
  const selectedPlan = paymentPlans.find(p => p.id === paymentPlanId);
  const planIsAuto = !!paymentPlanId && rows.length === 1 && rows[0].planAuto === true;
  const planIntervalOf = (p: PaymentPlan) => PLAN_INTERVAL[p.installmentType] || 1;
  const planComputedMonths = selectedPlan
    ? Math.max(1, selectedPlan.numberOfInstallments || 1) * planIntervalOf(selectedPlan)
    : 0;
  const planDurationMismatch = !!selectedPlan &&
    planDurationMonths(selectedPlan) > 0 &&
    planDurationMonths(selectedPlan) !== planComputedMonths;
  const allMonthly = rows.every(r => rowInterval(r) === 1);

  // ── Load data ──
  useEffect(() => {
    Promise.all([
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getCollection<Booking>('bookings'),
      getCollection<Dealer>('dealers'),
    ]).then(([c, p, b, d]) => {
      setDealers(d);
      setCustomers(c);
      setPlots(p.filter(pl => pl.status === 'available' || pl.status === 'booked'));
      setBookings(b.filter(bk => bk.status === 'confirmed'));
    });
  }, []);

  // Load saved payment plans once
  useEffect(() => {
    let active = true;
    getCollection<PaymentPlan>('paymentPlans')
      .then(list => {
        if (!active) return;
        setPaymentPlans([...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      })
      .catch(err => {
        console.error(err);
        toast.error('Failed to load saved payment plans');
      })
      .finally(() => { if (active) setPlansLoading(false); });
    return () => { active = false; };
  }, []);

  // Auto-follow: while the plan row is still automatic, keep it in sync with the price inputs
  useEffect(() => {
    if (!paymentPlanId) return;
    setRows(prev => {
      if (prev.length !== 1 || prev[0].planAuto !== true) return prev;
      const r = prev[0];
      const count = rowCount(r);
      const semi = semiAnnualEnabled ? Math.floor(r.months / 6) * semiAnnualAmount : 0;
      const target = Math.max(0, remainingForInstallments - semi);
      const amount = count > 0 ? Math.round(target / count) : 0;
      if (r.totalAmount === target && r.monthlyAmount === amount) return prev;
      return [{ ...r, monthlyAmount: amount, totalAmount: target }];
    });
  }, [paymentPlanId, finalPrice, downPaymentAmount, onPossessionDeduction, remainingForInstallments, semiAnnualEnabled, semiAnnualAmount]);

  // ── When customer + plot selected, auto-find matching booking ──
  useEffect(() => {
    if (!customerId || !plotId) return;
    const match = bookings.find(
      b => b.customerId === customerId && b.plotId === plotId
    );
    if (match) {
      setBookingId(match.id);
      setTotalPrice(match.totalPrice || 0);
      setBookingPaid(match.bookingAmount || 0);
    } else {
      setBookingId('');
      // If no booking, let user enter price manually
    }
  }, [customerId, plotId, bookings]);

  // ── Auto-calculate dealer commission ──
  useEffect(() => {
    if (dealerCommissionPct > 0 && finalPrice > 0) {
      setDealerCommissionAmt(
        Math.round((finalPrice * dealerCommissionPct) / 100)
      );
    }
  }, [dealerCommissionPct, finalPrice]);

  // ── Down Payment calculations ──
  useEffect(() => {
    if (finalPrice > 0) {
      if (dpLastEdited === 'percent') {
        setDownPaymentAmount(Math.round((finalPrice * downPaymentPercent) / 100));
      } else {
        setDownPaymentPercent(Number(((downPaymentAmount / finalPrice) * 100).toFixed(2)));
      }
    }
  }, [finalPrice, dpLastEdited]);

  const onPercentChange = (v: number) => {
    const clamped = Math.max(0, Math.min(100, v));
    setDownPaymentPercent(clamped);
    setDownPaymentAmount(Math.round((finalPrice * clamped) / 100));
    setDpLastEdited('percent');
  };

  const onAmountChange = (v: number) => {
    const clamped = Math.max(0, Math.min(finalPrice, v));
    setDownPaymentAmount(clamped);
    setDownPaymentPercent(finalPrice > 0 ? Number(((clamped / finalPrice) * 100).toFixed(2)) : 0);
    setDpLastEdited('amount');
  };

  // ── Row helpers ──
  // Any manual edit of a row detaches it from the saved plan (planAuto = false)
  const updateRow = useCallback((id: string, field: 'months' | 'intervalMonths' | 'monthlyAmount' | 'totalAmount', value: number) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        const updated: InstallmentRow = { ...row, [field]: value, planAuto: false };
        const count = rowCount(updated);
        if (field === 'months' || field === 'intervalMonths' || field === 'monthlyAmount') {
          updated.totalAmount = count * updated.monthlyAmount;
        } else if (field === 'totalAmount') {
          updated.monthlyAmount = count > 0 ? Math.round(updated.totalAmount / count) : 0;
        }
        return updated;
      })
    );
  }, []);

  const addRow = () => {
    setRows(prev => {
      const usedMonths = prev.reduce((sum, r) => sum + r.months, 0);
      const usedAmount = prev.reduce((sum, r) => sum + r.totalAmount, 0);
      
      const newMonths = Math.max(1, planMonths - usedMonths);
      const totalRemaining = Math.max(0, remainingForInstallments - (semiAnnualEnabled ? Math.floor(planMonths / 6) * semiAnnualAmount : 0) - usedAmount);
      
      const newRow = makeRow();
      newRow.months = newMonths;
      newRow.intervalMonths = 1;
      newRow.planAuto = false;
      const count = rowCount(newRow);
      newRow.totalAmount = totalRemaining;
      newRow.monthlyAmount = count > 0 ? Math.round(totalRemaining / count) : 0;
      return [...prev.map(r => ({ ...r, planAuto: false })), newRow];
    });
  };

  const balanceLastRow = () => {
    setRows(prev => {
      if (prev.length === 0) return prev;
      const copy = prev.map(r => ({ ...r, planAuto: false }));
      const usedAmountExceptLast = copy.slice(0, -1).reduce((sum, r) => sum + r.totalAmount, 0);
      const totalMonths = copy.reduce((sum, r) => sum + r.months, 0);
      const semiTotal = semiAnnualEnabled ? Math.floor(totalMonths / 6) * semiAnnualAmount : 0;
      const target = Math.max(0, remainingForInstallments - semiTotal - usedAmountExceptLast);
      
      const last = { ...copy[copy.length - 1] };
      const count = rowCount(last);
      last.totalAmount = target;
      last.monthlyAmount = count > 0 ? Math.round(target / count) : 0;
      copy[copy.length - 1] = last;
      return copy;
    });
  };

  const removeRow = (id: string) =>
    setRows(prev => prev.filter(r => r.id !== id).map(r => ({ ...r, planAuto: false })));

  // ── Saved payment plans ──
  const applyPlan = (plan: PaymentPlan) => {
    const interval = planIntervalOf(plan);
    const count = Math.max(1, plan.numberOfInstallments || 1);
    const months = count * interval;
    setPlanMonths(months);

    // Down payment through the existing percent handler (fills the Rs amount, dpLastEdited = 'percent')
    const pct = Math.max(0, Math.min(100, plan.downPaymentPercent || 0));
    onPercentChange(pct);

    // Same math the page uses, with the new down payment applied immediately
    const newDp = Math.round((finalPrice * pct) / 100);
    const remaining = Math.max(0, finalPrice - newDp - onPossessionDeduction);
    const semi = semiAnnualEnabled ? Math.floor(months / 6) * semiAnnualAmount : 0;
    const target = Math.max(0, remaining - semi);

    setRows([{
      id: uid(),
      months,
      intervalMonths: interval,
      monthlyAmount: Math.round(target / count),
      totalAmount: target,
      planAuto: true,
    }]);
    setPaymentPlanId(plan.id);
    setPaymentPlanName(plan.name);
  };

  const onPlanSelect = (id: string) => {
    if (!id) {
      // Detach: keep rows as they are
      setPaymentPlanId('');
      setPaymentPlanName('');
      return;
    }
    const plan = paymentPlans.find(p => p.id === id);
    if (!plan) return;
    const editedByHand = rows.length > 1 || rows.some(r => r.planAuto === false);
    if (editedByHand) {
      setPendingPlanId(id);
      return;
    }
    applyPlan(plan);
  };

  const pendingPlan = paymentPlans.find(p => p.id === pendingPlanId);

  // ── Validate ──
  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId)            e.customerId  = 'Customer is required';
    if (!plotId)                e.plotId      = 'Plot is required';
    if (!saleDate)              e.saleDate    = 'Sale date is required';
    if (totalPrice <= 0)        e.totalPrice  = 'Total price must be > 0';
    
    if (downPaymentAmount < bookingPaid) e.downPaymentAmount = 'Down payment cannot be less than booking paid';
    if (downPaymentAmount > finalPrice) e.downPaymentAmount = 'Down payment cannot exceed final price';

    if (rows.length === 0)      e.rows        = 'Add at least one installment row';
    if (rows.some(r => r.months <= 0 || r.monthlyAmount <= 0))
      e.rows = 'All installment rows must have valid months and amount';
    const badRow = rows.find(rowMisaligned);
    if (badRow) e.rows = `Months must be a multiple of ${rowInterval(badRow)}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Generate installment schedule from rows ──
  const generateInstallments = async (saleId: string, saleDateObj: Date) => {
    const allInsts: Omit<Installment, 'id'>[] = [];
    let instNum     = 1;
    const totalInsts  = regularCount;
    
    // Remaining Down Payment
    if (remainingDownPayment > 0 && includeRemainingDownPayment) {
      allInsts.push({
        receiptNumber: '',
        saleId, customerId, plotId,
        installmentNumber: 0,
        totalInstallments: totalInsts,
        type: 'down_payment',
        dueDate: saleDateObj, // Due immediately
        amountDue: remainingDownPayment,
        amountPaid: 0, paymentDate: null,
        paymentMethod: '', bankName: '', chequeNumber: '',
        status: 'pending', notes: 'Remaining Down Payment',
        createdAt: new Date(),
      });
    }

    // On Possession
    if (onPossessionEnabled && onPossessionAmount > 0) {
      allInsts.push({
        receiptNumber: '',
        saleId, customerId, plotId,
        installmentNumber: 0,
        totalInstallments: totalInsts,
        type: 'on_possession',
        dueDate: parseDateInput(onPossessionDate) || saleDateObj,
        amountDue: onPossessionAmount,
        amountPaid: 0, paymentDate: null,
        paymentMethod: '', bankName: '', chequeNumber: '',
        status: 'pending', notes: onPossessionNotes || 'On Possession Payment',
        createdAt: new Date(),
      });
    }

    // Regular installments: one per interval inside each row, on calendar months
    let offset = 0;
    for (const row of rows) {
      const interval = rowInterval(row);
      const count = rowCount(row);
      const frequency = INTERVAL_FREQUENCY[interval] || `Every ${interval} months`;
      for (let k = 1; k <= count; k++) {
        const isLast = k === count;
        const amount = isLast
          ? row.monthlyAmount + (row.totalAmount - row.monthlyAmount * count)
          : row.monthlyAmount;
        allInsts.push({
          receiptNumber:     '',
          saleId,
          customerId,
          plotId,
          installmentNumber: instNum++,
          totalInstallments: totalInsts,
          type:              'monthly',
          frequency,
          dueDate:           addMonths(saleDateObj, offset + k * interval),
          amountDue:         amount,
          amountPaid: 0,
          paymentDate:       null,
          paymentMethod:     '',
          bankName:          '',
          chequeNumber:      '',
          status:            'pending',
          notes:             '',
          createdAt:         new Date(),
        });
      }
      offset += row.months;
    }

    // Semi-annual EXTRA payments on months 6, 12, 18, ... (in addition to the regular installment)
    if (semiAnnualEnabled && semiAnnualAmount > 0) {
      for (let j = 1; j <= semiAnnualCount; j++) {
        const month = j * 6;
        allInsts.push({
          receiptNumber:     '',
          saleId,
          customerId,
          plotId,
          installmentNumber: month,
          totalInstallments: totalInsts,
          type:              'semi_annual',
          dueDate:           addMonths(saleDateObj, month),
          amountDue:         semiAnnualAmount,
          amountPaid: 0,
          paymentDate:       null,
          paymentMethod:     '',
          bankName:          '',
          chequeNumber:      '',
          status:            'pending',
          notes:             `Semi-Annual Payment ${j}`,
          createdAt:         new Date(),
        });
      }
    }

    // Save with writeBatch (chunks stay below the 500 writes per batch limit)
    const CHUNK = 450;
    for (let i = 0; i < allInsts.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const inst of allInsts.slice(i, i + CHUNK)) {
        batch.set(doc(collection(db, 'installments')), inst);
      }
      await batch.commit();
    }
    return allInsts.length;
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setLoading(true);
      const saleDateObj = parseDateInput(saleDate)!;
      const saleNumber  = generateReceiptNumber('SALE');

      const saleData: Omit<Sale, 'id'> = {
        saleNumber,
        customerId,
        plotId,
        bookingId,
        saleDate:              saleDateObj,
        totalPrice,
        bookingAmountPaid:     bookingPaid,
        discount,
        finalPrice,
        downPayment:           downPaymentAmount, // legacy mapped to new calc
        downPaymentPercent,
        downPaymentAmount,
        remainingDownPayment,
        semiAnnualEnabled,
        semiAnnualAmount,
        semiAnnualCount,
        semiAnnualTotal,
        onPossessionEnabled,
        onPossessionAmount,
        onPossessionDate:      onPossessionEnabled ? parseDateInput(onPossessionDate) : null,
        onPossessionStatus:    'Pending',
        onPossessionPaidDate:  null,
        onPossessionNotes,
        balanceAfterBooking,
        remainingAmount:       remainingForInstallments,
        installmentRows:       rows,
        ...(paymentPlanId ? {
          paymentPlanId,
          paymentPlanName,
          paymentPlanModified: !planIsAuto,
        } : {}),
        dealerName:            dealerName.trim(),
        dealerPhone:           dealerPhone.trim(),
        dealerCommissionPercent: dealerCommissionPct,
        dealerCommissionAmount:  dealerCommissionAmt,
        dealerCommissionStatus,
        status:               'active',
        possessionGiven:      false,
        downPaymentReceived:  0,
        downPaymentStatus:    remainingDownPayment > 0 ? 'pending' : 'complete',
        createdAt:            new Date(),
      };

      const saleId     = await addDocument('sales', saleData);
      const instCount  = await generateInstallments(saleId, saleDateObj);

      // Update plot status → sold
      await updateDocument('plots', plotId, { status: 'sold' });

      // Save dealer commission to ledger if dealer provided
      if (dealerName.trim()) {
        await addDocument('dealerLedger', {
          dealerName:    dealerName.trim(),
          dealerPhone:   dealerPhone.trim(),
          type:          'commission_earned',
          amount:        dealerCommissionAmt,
          saleId,
          plotInfo:      (() => {
            const p = plots.find(pl => pl.id === plotId);
            return p ? `${p.plotNumber} B${p.block}` : '';
          })(),
          paymentMethod: '',
          note:          '',
          date:          saleDateObj,
          createdAt:     new Date(),
        });

        // Also create a dealerCommissions record for reports
        await addDocument('dealerCommissions', {
          dealerId:        '',
          dealerName:      dealerName.trim(),
          dealerPhone:     dealerPhone.trim(),
          saleId,
          saleAmount:      finalPrice,
          downPayment: downPaymentAmount,
          commissionPercent: dealerCommissionPct,
          commissionAmount:  dealerCommissionAmt,
          paymentStatus:   dealerCommissionStatus,
          paymentDate:     dealerCommissionStatus === 'paid' ? new Date() : null,
          notes:           '',
        });
      }

      toast.success(
        `✅ Plot assigned! Sale #: ${saleNumber} · ${instCount} installments generated.`
      );
      setSavedSaleId(saleId);
      setShowPrintPrompt(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to assign plot. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlot     = plots.find(p => p.id === plotId);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const matchedBooking   = bookings.find(b => b.id === bookingId);

  return (
    <div>
      <PageHeader
        title="Assign Plot — Full Sale"
        subtitle="Complete plot sale with custom installment schedule"
        icon={<UserCheck size={20} />}
      />

      <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">

        {/* ── Customer & Plot ── */}
        <div className="card space-y-4">
          <h3 className="form-section-header">Customer & Plot</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Customer" required error={errors.customerId}>
              <SearchableSelect
                value={customerId}
                onChange={v => { setCustomerId(v); setPlotId(''); setBookingId(''); setTotalPrice(0); setBookingPaid(0); }}
                options={customers.map(c => ({
                  value:    c.id,
                  label:    c.name,
                  sublabel: `${c.customerId || ''} · ${c.cnic}`,
                }))}
                placeholder="Select customer..."
                error={!!errors.customerId}
              />
            </FormField>

            <FormField label="Plot" required error={errors.plotId}>
              <SearchableSelect
                value={plotId}
                onChange={v => { setPlotId(v); setBookingId(''); setTotalPrice(0); setBookingPaid(0); }}
                options={plots.map(p => ({
                  value:    p.id,
                  label:    `${p.plotNumber} — Block ${p.block}`,
                  sublabel: `${p.size} ${p.sizeUnit} · ${p.category} · ${p.status}`,
                }))}
                placeholder="Select plot..."
                error={!!errors.plotId}
              />
            </FormField>

            <FormField label="Sale Date" required>
              <input
                className="input-field"
                type="date"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
              />
            </FormField>
          </div>

          {/* Booking match indicator */}
          {customerId && plotId && (
            <div
              className="p-3 rounded-xl text-xs flex items-center gap-2"
              style={matchedBooking
                ? { background: '#dcfce7', border: '1px solid #86efac', color: '#15803d' }
                : { background: '#fef3c7', border: '1px solid #fde68a', color: '#b45309' }
              }
            >
              {matchedBooking ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {matchedBooking
                ? `Booking found: ${matchedBooking.receiptNumber} · Booking paid: ${formatCurrency(matchedBooking.bookingAmount)}`
                : 'No confirmed booking found for this customer + plot combination. You can still proceed.'
              }
            </div>
          )}
        </div>

        {/* ── Pricing Breakdown ── */}
        <div className="card space-y-4">
          <h3 className="form-section-header">Pricing Breakdown</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Total Price (Rs.)" required error={errors.totalPrice}
              hint={matchedBooking ? 'Auto-filled from booking' : 'Enter manually'}>
              <input
                className={`input-field font-semibold ${errors.totalPrice ? 'input-error' : ''}`}
                type="number"
                value={totalPrice || ''}
                onChange={e => setTotalPrice(Number(e.target.value))}
                placeholder="e.g., 5000000"
                min="0"
                readOnly={!!matchedBooking}
                style={matchedBooking ? { background: '#f8fafc', color: '#64748b' } : undefined}
              />
            </FormField>

            <FormField label="Booking Amount Already Paid (Rs.)" hint="From booking receipt — locked">
              <input
                className="input-field"
                type="number"
                value={bookingPaid || ''}
                onChange={e => setBookingPaid(Number(e.target.value))}
                placeholder="0"
                readOnly={!!matchedBooking}
                style={{ background: '#f8fafc', color: '#64748b' }}
              />
            </FormField>

            <FormField label="Discount (Rs.)">
              <input
                className="input-field"
                type="number"
                value={discount || ''}
                onChange={e => setDiscount(Number(e.target.value))}
                placeholder="0"
                min="0"
              />
            </FormField>
          </div>

          {/* Calculation summary */}
          {totalPrice > 0 && (
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['Total Price',              formatCurrency(totalPrice),              '#0f172a', false],
                    ['− Booking Amount Paid',    `− ${formatCurrency(bookingPaid)}`,      '#b45309', false],
                    ['− Discount',               `− ${formatCurrency(discount)}`,         '#b45309', false],
                    ['= Balance After Booking',  formatCurrency(balanceAfterBooking),     '#1d4ed8', false],
                  ].map(([label, value, color]) => (
                    <tr key={label as string} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{label as string}</td>
                      <td className="px-4 py-2.5 font-semibold text-right" style={{ color: color as string }}>{value as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Down payment Section */}
          <div className="border-t border-slate-200 pt-4 mt-2">
            <h4 className="font-semibold text-sm text-slate-700 mb-3 uppercase tracking-wider">Down Payment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Down Payment %" required error={errors.downPaymentPercent}>
                <div className="relative">
                  <input
                    className={`input-field ${errors.downPaymentPercent ? 'input-error' : ''}`}
                    type="number"
                    value={downPaymentPercent || ''}
                    onChange={e => onPercentChange(Number(e.target.value))}
                    min="0" max="100" step="0.1"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                </div>
              </FormField>

              <FormField label="Down Payment Amount (Rs.)" required error={errors.downPaymentAmount}>
                <input
                  className={`input-field font-semibold ${errors.downPaymentAmount ? 'input-error' : ''}`}
                  type="number"
                  value={downPaymentAmount || ''}
                  onChange={e => onAmountChange(Number(e.target.value))}
                  min="0" max={finalPrice}
                />
                {downPaymentAmount > 0 && <div className="text-xs text-slate-500 mt-1">{formatCurrency(downPaymentAmount)}</div>}
              </FormField>
            </div>
            
            {downPaymentPercent > 0 && (
              <div className="mt-3 p-3 rounded-xl text-xs font-medium space-y-1.5" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                <div className="flex justify-between">
                  <span>Booking Amount (included):</span>
                  <span>{formatCurrency(bookingPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm">
                  <span>Remaining Down Payment:</span>
                  <span>{formatCurrency(remainingDownPayment)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Remaining for installments */}
          {totalPrice > 0 && (
            <div
              className="flex items-center justify-between p-4 rounded-xl mt-4"
              style={{ background: '#1a3c6e' }}
            >
              <div>
                <p className="text-white/70 text-xs font-medium">Remaining for Installments</p>
                <p className="text-xs text-white/50 mt-0.5">
                  Total − Down Payment {onPossessionEnabled ? '− On Possession' : ''}
                </p>
              </div>
              <p className="text-2xl font-extrabold text-white">
                {formatCurrency(remainingForInstallments)}
              </p>
            </div>
          )}
        </div>

        {/* ── On-Possession Details ── */}
        <div className="card space-y-4">
          <h3 className="form-section-header">On-Possession Details <span className="text-slate-400 font-normal normal-case">(Optional)</span></h3>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded border-gray-300"
                checked={onPossessionEnabled}
                onChange={e => setOnPossessionEnabled(e.target.checked)}
              />
              <span className="text-sm font-semibold text-slate-700">Include On-Possession Payment</span>
            </label>
            
            {onPossessionEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 pt-2">
                <FormField label="On-Possession Amount (Rs.)">
                  <input
                    type="number"
                    className="input-field"
                    value={onPossessionAmount || ''}
                    onChange={e => setOnPossessionAmount(Number(e.target.value))}
                    placeholder="e.g., 500000"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Separate from installments. Due when possession is given.</p>
                </FormField>
                
                <FormField label="Estimated Possession Date">
                  <input
                    type="date"
                    className="input-field"
                    value={onPossessionDate}
                    onChange={e => setOnPossessionDate(e.target.value)}
                  />
                </FormField>

                <div className="sm:col-span-2">
                  <FormField label="Notes">
                    <input
                      type="text"
                      className="input-field"
                      value={onPossessionNotes}
                      onChange={e => setOnPossessionNotes(e.target.value)}
                      placeholder="Optional notes"
                    />
                  </FormField>
                </div>
              </div>
            )}
          </div>
        </div>


        {/* ── Custom Installment Plan ── */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="form-section-header mb-0" style={{ border: 'none', paddingBottom: 0 }}>
              Installment Plan
            </h3>
            <button type="button" onClick={addRow} className="btn btn-primary btn-sm">
              <Plus size={14} /> Add Row
            </button>
          </div>

          {/* Saved payment plan */}
          <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="payment-plan-select" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ClipboardList size={13} style={{ color: '#1a3c6e' }} /> Payment Plan
              </label>
              <Link to="/payment-plans/list" id="manage-plans-link" className="text-xs font-semibold hover:underline" style={{ color: '#1a3c6e' }}>
                Manage plans
              </Link>
            </div>
            <select
              id="payment-plan-select"
              aria-label="Payment Plan"
              className="input-field"
              value={paymentPlanId}
              disabled={plansLoading}
              onChange={e => onPlanSelect(e.target.value)}
            >
              <option value="">{plansLoading ? 'Loading plans...' : 'Custom (no plan)'}</option>
              {paymentPlans.map(p => (
                <option key={p.id} value={p.id}>{planOptionLabel(p)}</option>
              ))}
            </select>

            {!plansLoading && paymentPlans.length === 0 && (
              <p className="text-xs text-slate-500">
                No saved plans yet. Create one in{' '}
                <Link to="/payment-plans/new" id="create-plan-link" className="font-semibold hover:underline" style={{ color: '#1a3c6e' }}>
                  Payments -&gt; Create Plan
                </Link>
              </p>
            )}

            <AnimatePresence>
              {paymentPlanId && (
                <motion.div
                  key={paymentPlanId}
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={planIsAuto
                        ? { background: '#e0e7ff', color: '#1a3c6e', border: '1px solid #c7d2fe' }
                        : { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}
                    >
                      <CheckCircle size={12} />
                      Plan: {paymentPlanName} {planIsAuto ? '(auto)' : '(edited)'}
                    </span>
                    {selectedPlan && (
                      <button
                        type="button"
                        id="reapply-plan-btn"
                        onClick={() => applyPlan(selectedPlan)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 10px', fontSize: '11px' }}
                      >
                        <RefreshCw size={12} /> Re-apply plan
                      </button>
                    )}
                  </div>
                  {selectedPlan?.notes && (
                    <p className="text-[11px] text-slate-500">{selectedPlan.notes}</p>
                  )}
                  {selectedPlan && planDurationMismatch && (
                    <p className="text-[11px] text-sky-700 flex items-center gap-1">
                      <Info size={12} />
                      Plan duration says {planDurationMonths(selectedPlan)} months but installments x interval = {planComputedMonths} months. Using {planComputedMonths}.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Semi-Annual toggle */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded border-gray-300"
                checked={semiAnnualEnabled}
                onChange={e => setSemiAnnualEnabled(e.target.checked)}
              />
              <span className="text-sm font-semibold text-slate-700">Enable Semi-Annual Payments</span>
            </label>
            
            {semiAnnualEnabled && (
              <div className="pl-6 space-y-2">
                <FormField label="Semi-Annual Amount (Rs.)">
                  <input
                    type="number"
                    className="input-field"
                    value={semiAnnualAmount || ''}
                    onChange={e => setSemiAnnualAmount(Number(e.target.value))}
                    placeholder="e.g., 300000"
                  />
                </FormField>
                
                {semiAnnualAmount > 0 && (
                  <div className="text-xs text-slate-600 bg-white p-2 rounded border">
                    <strong>Summary:</strong> Total Months: {totalMonths} <br/>
                    Semi-Annual Payments: {semiAnnualCount} times × {formatCurrency(semiAnnualAmount)} = <strong>{formatCurrency(semiAnnualTotal)}</strong><br/>
                    Remaining for Monthly: <strong>{formatCurrency(remainingForMonthly)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {errors.rows && (
            <p className="text-xs text-red-500 font-medium flex items-center gap-1">
              <AlertTriangle size={12} /> {errors.rows}
            </p>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-1">
            <div className="col-span-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Months</div>
            <div className="col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Every</div>
            <div className="col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {allMonthly ? 'Monthly Amount (Rs.)' : 'Amount per installment (Rs.)'}
            </div>
            <div className="col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Amount</div>
            <div className="col-span-1" />
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {rows.map((row, idx) => {
              const interval = rowInterval(row);
              const count = rowCount(row);
              const misaligned = rowMisaligned(row);
              return (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-2">
                    <input
                      type="number"
                      aria-label={`Row ${idx + 1} months`}
                      className={`input-field text-center ${misaligned ? 'input-error' : ''}`}
                      value={row.months || ''}
                      onChange={e => updateRow(row.id, 'months', Number(e.target.value))}
                      placeholder="12"
                      min="1"
                    />
                  </div>
                  <div className="col-span-3">
                    <select
                      aria-label={`Row ${idx + 1} every`}
                      className="input-field"
                      value={interval}
                      onChange={e => updateRow(row.id, 'intervalMonths', Number(e.target.value))}
                    >
                      {INTERVAL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-0.5 pl-1">
                      = {count} {count === 1 ? 'installment' : 'installments'}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      aria-label={interval === 1 ? `Row ${idx + 1} monthly amount` : `Row ${idx + 1} amount per installment`}
                      className="input-field"
                      value={row.monthlyAmount || ''}
                      onChange={e => updateRow(row.id, 'monthlyAmount', Number(e.target.value))}
                      placeholder="e.g., 50000"
                      min="0"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5 pl-1">
                      {interval === 1 ? 'Monthly amount' : 'Amount per installment'}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      aria-label={`Row ${idx + 1} total amount`}
                      className="input-field font-semibold"
                      value={row.totalAmount || ''}
                      onChange={e => updateRow(row.id, 'totalAmount', Number(e.target.value))}
                      min="0"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center pt-1">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove row ${idx + 1}`}
                        onClick={() => removeRow(row.id)}
                        className="btn-icon hover:bg-red-50 text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <AnimatePresence>
                  {misaligned && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, x: -6 }}
                      animate={{ opacity: 1, height: 'auto', x: [0, -4, 4, -2, 0] }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-xs text-red-600 font-medium flex items-center gap-1 pl-1"
                      role="alert"
                    >
                      <AlertTriangle size={12} /> Months must be a multiple of {interval}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              );
            })}
          </div>

          {/* Grand total */}
          <div className={`rounded-xl p-4 border-2 ${planValid && remainingForInstallments > 0 ? 'border-green-400' : 'border-amber-400'}`}
            style={{ background: planValid && remainingForInstallments > 0 ? '#f0fdf4' : '#fffbeb' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-600">
                  Monthly Total: {formatCurrency(grandTotal)}
                </p>
                {semiAnnualEnabled && (
                  <p className="text-xs font-semibold text-slate-600">
                    Semi-Annual Total: {formatCurrency(semiAnnualTotal)}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1 pt-1 border-t border-slate-300">
                  Required: {formatCurrency(remainingForInstallments)}
                </p>
                <p className={`text-xs font-bold mt-1 ${isExact ? 'text-green-600' : isRounding ? 'text-amber-600' : 'text-red-600'}`}>
                  Remaining to allocate: {formatCurrency(isExact ? 0 : remainingToAllocate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Grand Total</p>
                <p className={`text-xl font-extrabold ${planValid ? 'text-green-600' : 'text-amber-600'}`}>
                  {formatCurrency(grandTotal + semiAnnualTotal)}
                </p>
              </div>
            </div>
            {remainingForInstallments > 0 && !isExact && (
              <div className={`mt-2 flex items-center justify-between gap-1.5 text-xs font-medium ${isMismatch ? 'text-red-600' : 'text-amber-600'}`}>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  {isRounding 
                    ? `${formatCurrency(difference)} rounding difference (acceptable)`
                    : `Difference: ${formatCurrency(difference)} - please adjust. (Grand total: ${formatCurrency(grandTotal + semiAnnualTotal)}, Required: ${formatCurrency(remainingForInstallments)})`
                  }
                </div>
                <button
                  type="button"
                  id="balance-last-row-btn"
                  onClick={() => {
                    balanceLastRow();
                    toast.success('Last row balanced');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '10px' }}
                >
                  <Scale size={12} /> Balance last row
                </button>
              </div>
            )}
            {remainingForInstallments > 0 && isExact && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-600">
                <CheckCircle size={13} />
                ✅ Perfect match
              </div>
            )}
          </div>
        </div>

        {/* ── Dealer Information (inline, optional) ── */}
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="form-section-header mb-0">Dealer Information <span className="text-slate-400 font-normal normal-case">(Optional)</span></h3>
            {selectedDealerId && (
              <button 
                type="button" 
                onClick={() => {
                  setSelectedDealerId('');
                  setDealerName('');
                  setDealerPhone('');
                  setDealerCommissionPct(0);
                  setDealerCommissionAmt(0);
                }} 
                className="text-xs text-red-500 hover:underline"
              >
                ✕ Clear Dealer
              </button>
            )}
          </div>

          <FormField label="Select Dealer">
            <SearchableSelect
              options={[
                { value: '', label: 'No Dealer' },
                ...dealers.map(d => ({ value: d.id, label: `${d.name} — ${d.phone}` }))
              ]}
              value={selectedDealerId}
              onChange={(val) => {
                setSelectedDealerId(val);
                const d = dealers.find(x => x.id === val);
                if (d) {
                  setDealerName(d.name);
                  setDealerPhone(d.phone);
                  setDealerCommissionPct(d.commissionRate || 0);
                  setDealerCommissionAmt((finalPrice * (d.commissionRate || 0)) / 100);
                } else {
                  setDealerName('');
                  setDealerPhone('');
                  setDealerCommissionPct(0);
                  setDealerCommissionAmt(0);
                }
              }}
              placeholder="Search dealer by name or phone..."
            />
          </FormField>

          {selectedDealerId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <FormField label="Dealer Name">
                <input className="input-field bg-slate-100" value={dealerName} readOnly />
              </FormField>

              <FormField label="Dealer Phone">
                <input className="input-field bg-slate-100" value={dealerPhone} readOnly />
              </FormField>

              <FormField label="Commission %">
                <input className="input-field bg-slate-100" type="number" value={dealerCommissionPct || ''} readOnly />
              </FormField>

              <FormField label="Commission Amount (Rs.)">
                <input className="input-field bg-slate-100 font-semibold" type="number" value={dealerCommissionAmt || ''} readOnly style={{ color: '#1a3c6e' }} />
              </FormField>

              <FormField label="Commission Status">
                <select
                  className="input-field"
                  value={dealerCommissionStatus}
                  onChange={e => setDealerCommissionStatus(e.target.value as 'paid' | 'pending')}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </FormField>
            </div>
          )}

          {dealerCommissionAmt > 0 && (
            <div className="p-3 rounded-xl text-xs font-medium"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
              💼 Commission: <strong>{formatCurrency(dealerCommissionAmt)}</strong>
              {dealerCommissionPct > 0 && (
                <span className="ml-1 opacity-70">
                  ({dealerCommissionPct}% of {formatCurrency(finalPrice)})
                </span>
              )}
              &nbsp;·&nbsp; Status: <strong>{dealerCommissionStatus}</strong>
            </div>
          )}
        </div>

        {/* ── Submit ── */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary disabled:opacity-60"
          >
            <Save size={16} />
            {loading ? 'Processing...' : 'Assign Plot & Generate Schedule'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/sales/list')}
            className="btn btn-secondary"
          >
            <X size={16} /> Cancel
          </button>
        </div>

      </form>
      <ConfirmDialog
        isOpen={!!pendingPlan}
        onClose={() => setPendingPlanId('')}
        onConfirm={() => {
          if (pendingPlan) applyPlan(pendingPlan);
          setPendingPlanId('');
        }}
        title="Apply payment plan"
        message={`Replace the current installment rows with plan ${pendingPlan?.name || ''}?`}
        confirmLabel="Replace rows"
        confirmVariant="primary"
      />
      <PrintPrompt
        show={showPrintPrompt}
        title="Plot Assigned Successfully!"
        message="Would you like to print the Plot Agreement?"
        options={[
          {
            label: 'Print Agreement',
            onClick: () => navigate(`/sales/agreement?saleId=${savedSaleId}`)
          }
        ]}
        onClose={() => navigate('/sales/list')}
      />
    </div>
  );
};

export default AssignPlot;
