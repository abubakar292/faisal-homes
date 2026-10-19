import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import gsap from 'gsap';
import {
  RotateCcw,
  BookOpen,
  ArrowRight,
  Printer,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

import PageHeader from '../../components/ui/PageHeader';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { PageLoading } from '../../components/brand';

import {
  getCollection,
  getDocument,
  addDocument,
} from '../../firebase/firestore';
import {
  formatDateInput,
  parseDateInput,
  formatCurrency,
  generateReceiptNumber,
} from '../../utils/formatters';
import {
  printContent,
  generateBookingReceipt,
  generatePlotAgreement,
  generateInstallmentSchedule,
} from '../../utils/printUtils';

import type {
  Customer,
  Plot,
  Booking,
  Dealer,
  PaymentPlan,
  Sale,
  CompanySettings,
  InstallmentRow,
  NomineeDetails,
  CustomerDocuments,
  PaymentMethod,
} from '../../types';

import {
  CustomerFormData,
  defaultCustomerFormData,
  defaultNomineeDetails,
  validateCustomer,
} from '../../utils/customerForm';
import {
  DealerFormData,
  defaultDealerFormData,
  validateDealer,
} from '../../utils/dealerForm';
import {
  calculateTotalPriceFromRate,
  calculateFinalPrice,
  calculateDownPaymentAmount,
  calculateDownPaymentPercent,
  calculateRemainingDownPayment,
  calculateSalePlan,
  buildInstallments,
  getRowInterval,
  getRowCount,
  INTERVAL_FREQUENCY,
} from '../../utils/saleCalc';
import {
  saveBookingOnly,
  saveSale,
  SubmitServiceResult,
} from '../../services/saleService';

import SectionNav, { SectionNavItem, SectionStatus } from '../../components/sale/SectionNav';
import SectionCard from '../../components/sale/SectionCard';
import CustomerSection from '../../components/sale/CustomerSection';
import PlotPriceSection from '../../components/sale/PlotPriceSection';
import BookingSection from '../../components/sale/BookingSection';
import PaymentPlanSection from '../../components/sale/PaymentPlanSection';
import DealerSection from '../../components/sale/DealerSection';
import ReviewSection, { ValidationItem } from '../../components/sale/ReviewSection';
import LiveSummaryPanel from '../../components/sale/LiveSummaryPanel';
import SavingOverlay from '../../components/sale/SavingOverlay';

const DRAFT_KEY = 'fh_sale_draft';

const makeDefaultRow = (months = 36, amount = 0): InstallmentRow => ({
  id: Math.random().toString(36).slice(2, 10),
  months,
  intervalMonths: 1,
  monthlyAmount: countMonthly(months, amount),
  totalAmount: amount,
  planAuto: true,
});

function countMonthly(months: number, total: number): number {
  return months > 0 ? Math.round(total / months) : 0;
}

export const NewSale: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isBookingMode = searchParams.get('mode') === 'booking';
  const queryBookingId = searchParams.get('bookingId') || '';

  // ── Database Data ──
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [activeSales, setActiveSales] = useState<Sale[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // ── Draft State Banner ──
  const [hasDraft, setHasDraft] = useState(false);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  // ── Form State: Customer (Only new customer details) ──
  const [newCustomer, setNewCustomer] = useState<CustomerFormData>(defaultCustomerFormData);
  const [nominee, setNominee] = useState<NomineeDetails>(defaultNomineeDetails);
  const [documents, setDocuments] = useState<CustomerDocuments>({});
  const [tempCustomerId] = useState(() => `temp-${Date.now()}`);

  // ── Form State: Plot & Pricing ──
  const [selectedPlotId, setSelectedPlotId] = useState('');
  const [perMarlaRate, setPerMarlaRate] = useState<string | number>('');
  const [totalPrice, setTotalPrice] = useState<string | number>('');
  const [discount, setDiscount] = useState<string | number>('');
  const [downPaymentPercent, setDownPaymentPercent] = useState<string | number>(20);
  const [downPaymentAmount, setDownPaymentAmount] = useState<string | number>('');
  const [dpLastEdited, setDpLastEdited] = useState<'percent' | 'amount'>('percent');
  const [onPossessionEnabled, setOnPossessionEnabled] = useState(false);
  const [onPossessionAmount, setOnPossessionAmount] = useState<string | number>('');
  const [onPossessionDate, setOnPossessionDate] = useState(() => formatDateInput(new Date()));
  const [onPossessionNotes, setOnPossessionNotes] = useState('');
  const [semiAnnualEnabled, setSemiAnnualEnabled] = useState(false);
  const [semiAnnualAmount, setSemiAnnualAmount] = useState<string | number>('');

  // ── Form State: Booking ──
  const [bookingEnabled, setBookingEnabled] = useState<boolean>(isBookingMode);
  const [bookingAmount, setBookingAmount] = useState<string | number>('');
  const [bookingDate, setBookingDate] = useState(() => formatDateInput(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [bankName, setBankName] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingReceiptNumber, setBookingReceiptNumber] = useState(() => generateReceiptNumber('BK'));
  const [isBookingLocked, setIsBookingLocked] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState<string>(queryBookingId);

  // ── Form State: Payment Plan ──
  const [paymentPlanId, setPaymentPlanId] = useState('');
  const [paymentPlanName, setPaymentPlanName] = useState('');
  const [planIsAuto, setPlanIsAuto] = useState(true);
  const [rows, setRows] = useState<InstallmentRow[]>([makeDefaultRow(36, 0)]);

  // ── Form State: Dealer ──
  const [dealerMode, setDealerMode] = useState<'none' | 'existing' | 'new'>('existing');
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [newDealer, setNewDealer] = useState<DealerFormData>(defaultDealerFormData);
  const [dealerCommissionPercent, setDealerCommissionPercent] = useState<string | number>('');
  const [dealerCommissionStatus, setDealerCommissionStatus] = useState<'paid' | 'pending'>('pending');

  // ── Submission & Overlay State ──
  const [isSaving, setIsSaving] = useState(false);
  const [savingStage, setSavingStage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [successResult, setSuccessResult] = useState<SubmitServiceResult | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [loadBookingDialogOpen, setLoadBookingDialogOpen] = useState(false);

  // ── Active Navigation State ──
  const [activeSectionId, setActiveSectionId] = useState('section-customer');

  // Load Firestore collections on mount
  useEffect(() => {
    let active = true;
    Promise.all([
      getCollection<Customer>('customers'),
      getCollection<Plot>('plots'),
      getCollection<Booking>('bookings'),
      getCollection<Dealer>('dealers'),
      getCollection<PaymentPlan>('paymentPlans'),
      getCollection<Sale>('sales'),
      getDocument<CompanySettings>('settings', 'company'),
    ])
      .then(([c, p, b, d, plans, s, comp]) => {
        if (!active) return;
        setCustomers(c);
        setPlots(p);
        setBookings(b.filter(bk => bk.status === 'confirmed'));
        setDealers(d);
        setPaymentPlans(plans);
        setActiveSales(s);
        if (comp) setCompany(comp);
        setInitialLoading(false);
      })
      .catch(err => {
        console.error(err);
        toast.error('Failed to load initial data');
        setInitialLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Check for saved draft in sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        setHasDraft(true);
      }
    } catch {}
  }, []);

  // Load from booking helper
  const handleLoadBooking = (bkId: string) => {
    const bk = bookings.find(b => b.id === bkId);
    if (!bk) return;

    setActiveBookingId(bk.id);
    const bkCustomer = customers.find(c => c.id === bk.customerId);
    if (bkCustomer) {
      setNewCustomer({
        name: bkCustomer.name || '',
        fatherName: bkCustomer.fatherName || '',
        cnic: bkCustomer.cnic || '',
        phone: bkCustomer.phone || '',
        phone2: bkCustomer.phone2 || '',
        email: bkCustomer.email || '',
        whatsapp: bkCustomer.whatsapp || '',
        address: bkCustomer.address || '',
        city: bkCustomer.city || '',
        profession: bkCustomer.profession || '',
        monthlyIncome: bkCustomer.monthlyIncome ? String(bkCustomer.monthlyIncome) : '',
        emergencyContact: bkCustomer.emergencyContact || '',
        emergencyPhone: bkCustomer.emergencyPhone || '',
        notes: bkCustomer.notes || '',
      });
      if (bkCustomer.nominee) {
        setNominee(bkCustomer.nominee);
      }
      if (bkCustomer.documents) {
        setDocuments(bkCustomer.documents);
      }
    }
    setSelectedPlotId(bk.plotId);
    setIsBookingLocked(true);
    setBookingEnabled(true);
    setBookingAmount(bk.bookingAmount);
    setBookingDate(formatDateInput(bk.bookingDate));
    setPaymentMethod(bk.paymentMethod || 'Cash');
    setBankName(bk.bankName || '');
    setChequeNumber(bk.chequeNumber || '');
    setReferenceNumber(bk.referenceNumber || '');
    setBookingNotes(bk.notes || '');
    setBookingReceiptNumber(bk.receiptNumber);

    if (bk.perMarlaRate) setPerMarlaRate(bk.perMarlaRate);
    if (bk.totalPrice) setTotalPrice(bk.totalPrice);

    setSearchParams({ bookingId: bk.id });
    toast.success(`Loaded booking #${bk.receiptNumber}`);
  };

  // Continue from booking query param
  useEffect(() => {
    if (queryBookingId && bookings.length > 0 && !isBookingLocked) {
      handleLoadBooking(queryBookingId);
    }
  }, [queryBookingId, bookings]);

  // Rate & plot auto-calculation for totalPrice
  const selectedPlot = plots.find(p => p.id === selectedPlotId);

  useEffect(() => {
    if (!perMarlaRate || !selectedPlot) return;
    const rate = Number(perMarlaRate);
    if (rate > 0) {
      const calcPrice = calculateTotalPriceFromRate(rate, selectedPlot.size, selectedPlot.sizeUnit);
      setTotalPrice(calcPrice);
    }
  }, [perMarlaRate, selectedPlotId, selectedPlot]);

  // Pricing calculations
  const numTotalPrice = Number(totalPrice) || 0;
  const numDiscount = Number(discount) || 0;
  const finalPrice = calculateFinalPrice(numTotalPrice, numDiscount);

  // Two-way Down Payment Linking
  useEffect(() => {
    if (finalPrice <= 0) return;
    if (dpLastEdited === 'percent') {
      const amt = calculateDownPaymentAmount(finalPrice, Number(downPaymentPercent));
      setDownPaymentAmount(amt);
    } else {
      const pct = calculateDownPaymentPercent(finalPrice, Number(downPaymentAmount));
      setDownPaymentPercent(pct);
    }
  }, [finalPrice, dpLastEdited]);

  const handleDpPercentChange = (val: string | number) => {
    const num = Math.max(0, Math.min(100, Number(val)));
    setDownPaymentPercent(num);
    setDownPaymentAmount(calculateDownPaymentAmount(finalPrice, num));
    setDpLastEdited('percent');
  };

  const handleDpAmountChange = (val: string | number) => {
    const num = Math.max(0, Math.min(finalPrice, Number(val)));
    setDownPaymentAmount(num);
    setDownPaymentPercent(calculateDownPaymentPercent(finalPrice, num));
    setDpLastEdited('amount');
  };

  // Booking amount
  const numBookingAmount = bookingEnabled ? Number(bookingAmount) || 0 : 0;
  const numDownPaymentAmount = Number(downPaymentAmount) || 0;
  const remainingDownPayment = calculateRemainingDownPayment(numDownPaymentAmount, numBookingAmount);

  // Sale plan math
  const planMath = useMemo(() => {
    return calculateSalePlan({
      totalPrice: numTotalPrice,
      discount: numDiscount,
      bookingPaid: numBookingAmount,
      downPaymentAmount: numDownPaymentAmount,
      onPossessionEnabled,
      onPossessionAmount: Number(onPossessionAmount) || 0,
      semiAnnualEnabled,
      semiAnnualAmount: Number(semiAnnualAmount) || 0,
      rows,
    });
  }, [
    numTotalPrice,
    numDiscount,
    numBookingAmount,
    numDownPaymentAmount,
    onPossessionEnabled,
    onPossessionAmount,
    semiAnnualEnabled,
    semiAnnualAmount,
    rows,
  ]);

  // Keep single auto row synchronized with price changes
  useEffect(() => {
    if (!paymentPlanId || rows.length !== 1 || !rows[0].planAuto) return;
    const r = rows[0];
    const target = Math.max(0, planMath.remainingForInstallments - planMath.semiAnnualTotal);
    const count = getRowCount(r);
    const amount = count > 0 ? Math.round(target / count) : 0;
    if (r.totalAmount !== target || r.monthlyAmount !== amount) {
      setRows([{ ...r, monthlyAmount: amount, totalAmount: target }]);
    }
  }, [paymentPlanId, planMath.remainingForInstallments, planMath.semiAnnualTotal]);

  // Row update handlers
  const handleUpdateRow = (
    id: string,
    field: 'months' | 'intervalMonths' | 'monthlyAmount' | 'totalAmount',
    val: number
  ) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: val, planAuto: false };
        const count = getRowCount(updated);
        if (field === 'months' || field === 'intervalMonths' || field === 'monthlyAmount') {
          updated.totalAmount = count * updated.monthlyAmount;
        } else if (field === 'totalAmount') {
          updated.monthlyAmount = count > 0 ? Math.round(updated.totalAmount / count) : 0;
        }
        return updated;
      })
    );
  };

  const handleAddRow = () => {
    setRows(prev => {
      const usedMonths = prev.reduce((s, r) => s + (r.months || 0), 0);
      const usedTotal = prev.reduce((s, r) => s + (r.totalAmount || 0), 0);
      const targetRemaining = Math.max(
        0,
        planMath.remainingForInstallments - planMath.semiAnnualTotal - usedTotal
      );
      const newMonths = Math.max(1, 36 - usedMonths);
      const newRow: InstallmentRow = {
        id: Math.random().toString(36).slice(2, 10),
        months: newMonths,
        intervalMonths: 1,
        monthlyAmount: countMonthly(newMonths, targetRemaining),
        totalAmount: targetRemaining,
        planAuto: false,
      };
      return [...prev.map(r => ({ ...r, planAuto: false })), newRow];
    });
  };

  const handleRemoveRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id).map(r => ({ ...r, planAuto: false })));
  };

  const handleBalanceLastRow = () => {
    setRows(prev => {
      if (prev.length === 0) return prev;
      const copy = prev.map(r => ({ ...r, planAuto: false }));
      const usedExceptLast = copy.slice(0, -1).reduce((s, r) => s + (r.totalAmount || 0), 0);
      const target = Math.max(
        0,
        planMath.remainingForInstallments - planMath.semiAnnualTotal - usedExceptLast
      );
      const last = { ...copy[copy.length - 1] };
      const count = getRowCount(last);
      last.totalAmount = target;
      last.monthlyAmount = count > 0 ? Math.round(target / count) : 0;
      copy[copy.length - 1] = last;
      return copy;
    });
    toast.success('Last installment row balanced');
  };

  // Plan select
  const handleSelectPlan = (planId: string) => {
    if (!planId) {
      setPaymentPlanId('');
      setPaymentPlanName('');
      setPlanIsAuto(false);
      return;
    }
    const plan = paymentPlans.find(p => p.id === planId);
    if (!plan) return;

    const intervalMap: Record<string, number> = {
      Monthly: 1,
      Quarterly: 3,
      'Semi-Annual': 6,
      Annual: 12,
    };
    const interval = intervalMap[plan.installmentType] || 1;
    const count = Math.max(1, plan.numberOfInstallments || 1);
    const months = count * interval;

    const pct = Math.max(0, Math.min(100, plan.downPaymentPercent || 20));
    handleDpPercentChange(pct);

    const calculatedDp = calculateDownPaymentAmount(finalPrice, pct);
    const posDeduction = onPossessionEnabled ? Number(onPossessionAmount) || 0 : 0;
    const remainingForInst = Math.max(0, finalPrice - calculatedDp - posDeduction);
    const semiTotal = semiAnnualEnabled ? Math.floor(months / 6) * (Number(semiAnnualAmount) || 0) : 0;
    const target = Math.max(0, remainingForInst - semiTotal);

    setRows([
      {
        id: Math.random().toString(36).slice(2, 10),
        months,
        intervalMonths: interval,
        monthlyAmount: Math.round(target / count),
        totalAmount: target,
        planAuto: true,
      },
    ]);
    setPaymentPlanId(plan.id);
    setPaymentPlanName(plan.name);
    setPlanIsAuto(true);
  };

  // Save plan template
  const handleSaveTemplate = async (name: string) => {
    if (rows.length !== 1) return;
    const r = rows[0];
    const interval = getRowInterval(r);
    const count = getRowCount(r);
    const typeLabel = INTERVAL_FREQUENCY[interval] || 'Monthly';

    const newPlanData = {
      name,
      duration: r.months,
      durationUnit: 'months' as const,
      installmentType: typeLabel as any,
      downPaymentPercent: Number(downPaymentPercent) || 20,
      numberOfInstallments: count,
      notes: '',
      createdAt: new Date(),
    };

    const docId = await addDocument('paymentPlans', newPlanData);
    setPaymentPlans(prev => [...prev, { ...newPlanData, id: docId }]);
    setPaymentPlanId(docId);
    setPaymentPlanName(name);
    toast.success(`Plan template "${name}" saved!`);
  };

  // Dealer selection and commission
  const selectedDealer = dealers.find(d => d.id === selectedDealerId);

  useEffect(() => {
    if (dealerMode === 'existing' && selectedDealer) {
      setDealerCommissionPercent(selectedDealer.commissionRate || 0);
    } else if (dealerMode === 'none') {
      setDealerCommissionPercent(0);
      setSelectedDealerId('');
    }
  }, [dealerMode, selectedDealerId, selectedDealer]);

  const numCommissionPercent = Number(dealerCommissionPercent) || 0;
  const dealerCommissionAmount =
    numCommissionPercent > 0 ? Math.round((finalPrice * numCommissionPercent) / 100) : 0;

  // ── Debounced Draft Autosave ──
  useEffect(() => {
    if (initialLoading || isSuccess) return;

    const timer = setTimeout(() => {
      const draft = {
        newCustomer,
        nominee,
        documents,
        selectedPlotId,
        perMarlaRate,
        totalPrice,
        discount,
        downPaymentPercent,
        downPaymentAmount,
        onPossessionEnabled,
        onPossessionAmount,
        onPossessionDate,
        onPossessionNotes,
        semiAnnualEnabled,
        semiAnnualAmount,
        bookingEnabled,
        bookingAmount,
        bookingDate,
        paymentMethod,
        bankName,
        chequeNumber,
        referenceNumber,
        bookingNotes,
        paymentPlanId,
        paymentPlanName,
        planIsAuto,
        rows,
        dealerMode,
        selectedDealerId,
        newDealer,
        dealerCommissionPercent,
        dealerCommissionStatus,
      };
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
    }, 500);

    return () => clearTimeout(timer);
  }, [
    initialLoading,
    isSuccess,
    newCustomer,
    nominee,
    documents,
    selectedPlotId,
    perMarlaRate,
    totalPrice,
    discount,
    downPaymentPercent,
    downPaymentAmount,
    onPossessionEnabled,
    onPossessionAmount,
    onPossessionDate,
    onPossessionNotes,
    semiAnnualEnabled,
    semiAnnualAmount,
    bookingEnabled,
    bookingAmount,
    bookingDate,
    paymentMethod,
    bankName,
    chequeNumber,
    referenceNumber,
    bookingNotes,
    paymentPlanId,
    paymentPlanName,
    planIsAuto,
    rows,
    dealerMode,
    selectedDealerId,
    newDealer,
    dealerCommissionPercent,
    dealerCommissionStatus,
  ]);

  const handleResumeDraft = () => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.newCustomer) setNewCustomer(d.newCustomer);
      if (d.nominee) setNominee(d.nominee);
      if (d.documents) setDocuments(d.documents);
      if (d.selectedPlotId) setSelectedPlotId(d.selectedPlotId);
      if (d.perMarlaRate) setPerMarlaRate(d.perMarlaRate);
      if (d.totalPrice) setTotalPrice(d.totalPrice);
      if (d.discount) setDiscount(d.discount);
      if (d.downPaymentPercent) setDownPaymentPercent(d.downPaymentPercent);
      if (d.downPaymentAmount) setDownPaymentAmount(d.downPaymentAmount);
      if (d.onPossessionEnabled !== undefined) setOnPossessionEnabled(d.onPossessionEnabled);
      if (d.onPossessionAmount) setOnPossessionAmount(d.onPossessionAmount);
      if (d.onPossessionDate) setOnPossessionDate(d.onPossessionDate);
      if (d.onPossessionNotes) setOnPossessionNotes(d.onPossessionNotes);
      if (d.semiAnnualEnabled !== undefined) setSemiAnnualEnabled(d.semiAnnualEnabled);
      if (d.semiAnnualAmount) setSemiAnnualAmount(d.semiAnnualAmount);
      if (d.bookingEnabled !== undefined) setBookingEnabled(d.bookingEnabled);
      if (d.bookingAmount) setBookingAmount(d.bookingAmount);
      if (d.bookingDate) setBookingDate(d.bookingDate);
      if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
      if (d.bankName) setBankName(d.bankName);
      if (d.chequeNumber) setChequeNumber(d.chequeNumber);
      if (d.referenceNumber) setReferenceNumber(d.referenceNumber);
      if (d.bookingNotes) setBookingNotes(d.bookingNotes);
      if (d.paymentPlanId) setPaymentPlanId(d.paymentPlanId);
      if (d.paymentPlanName) setPaymentPlanName(d.paymentPlanName);
      if (d.rows && d.rows.length) setRows(d.rows);
      if (d.dealerMode) setDealerMode(d.dealerMode);
      if (d.selectedDealerId) setSelectedDealerId(d.selectedDealerId);
      if (d.newDealer) setNewDealer(d.newDealer);
      if (d.dealerCommissionPercent) setDealerCommissionPercent(d.dealerCommissionPercent);
      if (d.dealerCommissionStatus) setDealerCommissionStatus(d.dealerCommissionStatus);

      setDraftBannerDismissed(true);
      toast.success('Unsaved draft restored');
    } catch {
      toast.error('Failed to restore draft');
    }
  };

  const handleDiscardDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
      setDraftBannerDismissed(true);
      toast('Draft discarded');
    } catch {}
  };

  const handleResetForm = () => {
    setNewCustomer(defaultCustomerFormData);
    setNominee(defaultNomineeDetails);
    setDocuments({});
    setSelectedPlotId('');
    setPerMarlaRate('');
    setTotalPrice('');
    setDiscount('');
    setDownPaymentPercent(20);
    setDownPaymentAmount('');
    setOnPossessionEnabled(false);
    setOnPossessionAmount('');
    setOnPossessionNotes('');
    setSemiAnnualEnabled(false);
    setSemiAnnualAmount('');
    setBookingEnabled(isBookingMode);
    setBookingAmount('');
    setPaymentMethod('Cash');
    setBankName('');
    setChequeNumber('');
    setReferenceNumber('');
    setBookingNotes('');
    setIsBookingLocked(false);
    setActiveBookingId('');
    setPaymentPlanId('');
    setPaymentPlanName('');
    setRows([makeDefaultRow(36, 0)]);
    setDealerMode('existing');
    setSelectedDealerId('');
    setNewDealer(defaultDealerFormData);
    setDealerCommissionPercent('');
    setHasAttemptedSubmit(false);
    setFieldErrors({});
    setIsSuccess(false);
    setSuccessResult(null);
    setResetDialogOpen(false);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
    } catch {}
    toast.success('Form reset');
  };

  // Section status determinations
  const customerValid = useMemo(() => {
    const errs = validateCustomer(newCustomer);
    return Object.keys(errs).length === 0;
  }, [newCustomer]);

  const plotPriceValid = useMemo(() => {
    return !!selectedPlotId && numTotalPrice > 0 && numDownPaymentAmount >= numBookingAmount;
  }, [selectedPlotId, numTotalPrice, numDownPaymentAmount, numBookingAmount]);

  const bookingValid = useMemo(() => {
    if (!bookingEnabled) return true;
    if (Number(bookingAmount) <= 0) return false;
    if (paymentMethod === 'Cheque' && !chequeNumber.trim()) return false;
    return true;
  }, [bookingEnabled, bookingAmount, paymentMethod, chequeNumber]);

  const planValid = useMemo(() => {
    if (isBookingMode) return true;
    return planMath.planValid && !planMath.hasMisalignedRow && rows.length > 0;
  }, [isBookingMode, planMath, rows]);

  const dealerValid = useMemo(() => {
    if (isBookingMode || dealerMode === 'none') return true;
    if (dealerMode === 'existing') return !!selectedDealerId;
    const errs = validateDealer(newDealer);
    return Object.keys(errs).length === 0;
  }, [isBookingMode, dealerMode, selectedDealerId, newDealer]);

  const sectionNavItems: SectionNavItem[] = [
    {
      id: 'section-customer',
      number: 1,
      label: 'Customer',
      status: customerValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending',
    },
    {
      id: 'section-plot-price',
      number: 2,
      label: 'Plot & Pricing',
      status: plotPriceValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending',
    },
    {
      id: 'section-booking',
      number: 3,
      label: 'Booking',
      status: bookingValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending',
    },
    ...(!isBookingMode
      ? [
          {
            id: 'section-plan',
            number: 4,
            label: 'Payment Plan',
            status: planValid ? ('complete' as SectionStatus) : hasAttemptedSubmit ? ('attention' as SectionStatus) : ('pending' as SectionStatus),
          },
          {
            id: 'section-dealer',
            number: 5,
            label: 'Dealer',
            status: dealerValid ? ('complete' as SectionStatus) : hasAttemptedSubmit ? ('attention' as SectionStatus) : ('pending' as SectionStatus),
          },
        ]
      : []),
    {
      id: 'section-review',
      number: isBookingMode ? 4 : 6,
      label: 'Review & Finish',
      status: 'pending',
    },
  ];

  const validationChecklist: ValidationItem[] = [
    {
      sectionId: 'section-customer',
      label: 'Customer Information',
      valid: customerValid,
      message: customerValid ? undefined : 'Please enter customer personal and contact details',
    },
    {
      sectionId: 'section-plot-price',
      label: 'Plot & Total Price',
      valid: !!selectedPlotId && numTotalPrice > 0,
      message: !selectedPlotId ? 'Please select a plot' : numTotalPrice <= 0 ? 'Enter total price' : undefined,
    },
    {
      sectionId: 'section-plot-price',
      label: 'Down Payment Rules',
      valid: numDownPaymentAmount >= numBookingAmount && numDownPaymentAmount <= finalPrice,
      message: numDownPaymentAmount < numBookingAmount ? 'Down payment cannot be less than booking' : undefined,
    },
    ...(bookingEnabled
      ? [
          {
            sectionId: 'section-booking',
            label: 'Booking Details',
            valid: bookingValid,
            message: 'Provide valid booking amount and payment details',
          },
        ]
      : []),
    ...(!isBookingMode
      ? [
          {
            sectionId: 'section-plan',
            label: 'Installment Plan Math',
            valid: planMath.planValid,
            message: planMath.planValid ? undefined : 'Balance grand total with remaining installments',
          },
          {
            sectionId: 'section-dealer',
            label: 'Dealer Assignment',
            valid: dealerValid,
            message: dealerValid ? undefined : 'Complete dealer information',
          },
        ]
      : []),
  ];

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Scroll-spy observer for section mini-nav
  useEffect(() => {
    const sectionIds = sectionNavItems.map(item => item.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible) {
          setActiveSectionId(visible.target.id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sectionNavItems]);

  // VisualViewport keyboard tracking to lift action bar
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);
    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
    };
  }, []);

  // Center input into view on focus
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        setTimeout(() => {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 300);
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  // ── Form Submissions ──
  const handleSaveBooking = async () => {
    setHasAttemptedSubmit(true);
    const errs: Record<string, string> = {};

    Object.assign(errs, validateCustomer(newCustomer));

    if (!selectedPlotId) errs.plotId = 'Plot is required';
    if (numTotalPrice <= 0) errs.totalPrice = 'Total price is required';
    if (!bookingAmount || Number(bookingAmount) <= 0) {
      errs.bookingAmount = 'Booking amount is required';
    }
    if (paymentMethod === 'Cheque' && !chequeNumber.trim()) {
      errs.chequeNumber = 'Cheque number required';
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error('Please fix errors in highlighted sections');
      // Shake animation on first invalid section
      const firstSection = errs.name || errs.cnic || errs.phone ? 'section-customer' : 'section-plot-price';
      scrollToSection(firstSection);
      gsap.fromTo(
        `#${firstSection}`,
        { x: -8 },
        { x: 8, duration: 0.08, repeat: 4, yoyo: true, ease: 'power1.inOut' }
      );
      return;
    }

    try {
      setIsSaving(true);
      setSavingStage('Saving customer & booking...');

      const res = await saveBookingOnly({
        customer: { newCustomer, nominee, documents },
        plotId: selectedPlotId,
        bookingDate,
        perMarlaRate: Number(perMarlaRate) || 0,
        totalPrice: numTotalPrice,
        bookingAmount: Number(bookingAmount),
        paymentMethod,
        bankName,
        chequeNumber,
        referenceNumber,
        notes: bookingNotes,
      });

      setSavingStage('Finishing...');
      setSuccessResult(res);
      setIsSuccess(true);
      sessionStorage.removeItem(DRAFT_KEY);
      toast.success(`Booking confirmed! Receipt: ${res.receiptNumber}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save booking');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteSale = async () => {
    setHasAttemptedSubmit(true);
    const errs: Record<string, string> = {};

    Object.assign(errs, validateCustomer(newCustomer));

    if (!selectedPlotId) errs.plotId = 'Plot is required';
    if (numTotalPrice <= 0) errs.totalPrice = 'Total price is required';
    if (numDownPaymentAmount < numBookingAmount) {
      errs.downPaymentAmount = 'Down payment cannot be less than booking paid';
    }

    if (bookingEnabled) {
      if (Number(bookingAmount) <= 0) errs.bookingAmount = 'Booking amount is required';
      if (paymentMethod === 'Cheque' && !chequeNumber.trim()) {
        errs.chequeNumber = 'Cheque number required';
      }
    }

    if (!planMath.planValid) {
      errs.rows = 'Installment plan must balance with required amount';
    }
    if (planMath.hasMisalignedRow) {
      errs.rows = 'One or more rows have misaligned months and interval';
    }

    if (dealerMode === 'existing' && !selectedDealerId) {
      errs.dealerId = 'Select registered dealer';
    } else if (dealerMode === 'new') {
      Object.assign(errs, validateDealer(newDealer));
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error('Please complete all required fields and balance the plan');
      const firstSection =
        errs.name || errs.cnic || errs.phone
          ? 'section-customer'
          : errs.plotId || errs.totalPrice
          ? 'section-plot-price'
          : errs.rows
          ? 'section-plan'
          : 'section-dealer';
      scrollToSection(firstSection);
      gsap.fromTo(
        `#${firstSection}`,
        { x: -8 },
        { x: 8, duration: 0.08, repeat: 4, yoyo: true, ease: 'power1.inOut' }
      );
      return;
    }

    try {
      setIsSaving(true);
      setSavingStage('Saving customer & dealer...');

      const res = await saveSale({
        customer: { newCustomer, nominee, documents },
        plotId: selectedPlotId,
        existingBookingId: activeBookingId || undefined,
        booking: bookingEnabled
          ? {
              bookingAmount: Number(bookingAmount),
              bookingDate,
              paymentMethod,
              bankName,
              chequeNumber,
              referenceNumber,
              notes: bookingNotes,
            }
          : undefined,
        saleDate: new Date(),
        totalPrice: numTotalPrice,
        perMarlaRate: Number(perMarlaRate) || 0,
        discount: numDiscount,
        downPaymentPercent: Number(downPaymentPercent) || 0,
        downPaymentAmount: numDownPaymentAmount,
        includeRemainingDownPayment: remainingDownPayment > 0,
        onPossessionEnabled,
        onPossessionAmount: Number(onPossessionAmount) || 0,
        onPossessionDate,
        onPossessionNotes,
        semiAnnualEnabled,
        semiAnnualAmount: Number(semiAnnualAmount) || 0,
        rows,
        paymentPlanId,
        paymentPlanName,
        paymentPlanModified: !planIsAuto,
        dealer:
          dealerMode === 'none'
            ? undefined
            : {
                existingId: dealerMode === 'existing' ? selectedDealerId : undefined,
                newDealer: dealerMode === 'new' ? newDealer : undefined,
                commissionPercent: numCommissionPercent,
                commissionStatus: dealerCommissionStatus,
              },
      });

      setSavingStage('Finishing...');
      setSuccessResult(res);
      setIsSuccess(true);
      sessionStorage.removeItem(DRAFT_KEY);
      toast.success(`Plot Sale confirmed! Sale #: ${res.receiptNumber}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to complete sale');
    } finally {
      setIsSaving(false);
    }
  };

  // Print Handlers
  const handlePrintBookingReceipt = () => {
    if (!company) return toast.error('Company information not configured');
    const cust = { ...newCustomer, id: successResult?.customerId || 'CUST-NEW' } as unknown as Customer;
    if (!cust.name || !selectedPlot) return toast.error('Customer name or plot data missing');

    const dummyBooking: Booking = {
      id: successResult?.bookingId || 'BK-1',
      receiptNumber: successResult?.receiptNumber || bookingReceiptNumber,
      customerId: cust.id || '',
      plotId: selectedPlot.id,
      bookingDate: parseDateInput(bookingDate) || new Date(),
      perMarlaRate: Number(perMarlaRate) || 0,
      totalPrice: numTotalPrice,
      bookingAmount: Number(bookingAmount),
      paymentMethod,
      bankName,
      chequeNumber,
      referenceNumber,
      notes: bookingNotes,
      status: 'confirmed',
      createdAt: new Date(),
    };

    const html = generateBookingReceipt(dummyBooking, cust, selectedPlot, company);
    printContent(html, `Booking-${dummyBooking.receiptNumber}`);
  };

  const handlePrintAgreement = () => {
    if (!company) return toast.error('Company settings missing');
    const cust = { ...newCustomer, id: successResult?.customerId || 'CUST-NEW' } as unknown as Customer;
    if (!cust.name || !selectedPlot) return toast.error('Customer or plot data missing');

    const dummySale: Sale = {
      id: successResult?.saleId || 'SALE-1',
      saleNumber: successResult?.receiptNumber || 'SALE-1',
      customerId: cust.id,
      plotId: selectedPlot.id,
      bookingId: activeBookingId,
      saleDate: new Date(),
      totalPrice: numTotalPrice,
      bookingAmountPaid: numBookingAmount,
      discount: numDiscount,
      finalPrice,
      downPayment: numDownPaymentAmount,
      downPaymentPercent: Number(downPaymentPercent) || 0,
      downPaymentAmount: numDownPaymentAmount,
      remainingDownPayment,
      semiAnnualEnabled,
      semiAnnualAmount: Number(semiAnnualAmount) || 0,
      semiAnnualCount: planMath.semiAnnualCount,
      semiAnnualTotal: planMath.semiAnnualTotal,
      onPossessionEnabled,
      onPossessionAmount: Number(onPossessionAmount) || 0,
      onPossessionDate: parseDateInput(onPossessionDate),
      onPossessionStatus: 'Pending',
      onPossessionPaidDate: null,
      onPossessionNotes,
      balanceAfterBooking: planMath.balanceAfterBooking,
      remainingAmount: planMath.remainingForInstallments,
      installmentRows: rows,
      dealerName: selectedDealer?.name || newDealer.name || '',
      dealerPhone: selectedDealer?.phone || newDealer.phone || '',
      dealerCommissionPercent: numCommissionPercent,
      dealerCommissionAmount,
      dealerCommissionStatus: dealerCommissionStatus,
      status: 'active',
      possessionGiven: false,
      downPaymentReceived: 0,
      downPaymentStatus: remainingDownPayment > 0 ? 'pending' : 'complete',
      createdAt: new Date(),
    };

    const html = generatePlotAgreement(dummySale, cust, selectedPlot, company);
    printContent(html, `Agreement-${dummySale.saleNumber}`);
  };

  const handlePrintSchedule = () => {
    if (!company) return toast.error('Company settings missing');
    const cust = { ...newCustomer, id: successResult?.customerId || 'CUST-NEW' } as unknown as Customer;
    if (!cust.name || !selectedPlot) return toast.error('Customer or plot data missing');

    const dummySale: Sale = {
      id: successResult?.saleId || 'SALE-1',
      saleNumber: successResult?.receiptNumber || 'SALE-1',
      customerId: cust.id,
      plotId: selectedPlot.id,
      bookingId: activeBookingId,
      saleDate: new Date(),
      totalPrice: numTotalPrice,
      bookingAmountPaid: numBookingAmount,
      discount: numDiscount,
      finalPrice,
      downPayment: numDownPaymentAmount,
      downPaymentPercent: Number(downPaymentPercent) || 0,
      downPaymentAmount: numDownPaymentAmount,
      remainingDownPayment,
      semiAnnualEnabled,
      semiAnnualAmount: Number(semiAnnualAmount) || 0,
      semiAnnualCount: planMath.semiAnnualCount,
      semiAnnualTotal: planMath.semiAnnualTotal,
      onPossessionEnabled,
      onPossessionAmount: Number(onPossessionAmount) || 0,
      onPossessionDate: parseDateInput(onPossessionDate),
      onPossessionStatus: 'Pending',
      onPossessionPaidDate: null,
      onPossessionNotes,
      balanceAfterBooking: planMath.balanceAfterBooking,
      remainingAmount: planMath.remainingForInstallments,
      installmentRows: rows,
      dealerName: selectedDealer?.name || newDealer.name || '',
      dealerPhone: selectedDealer?.phone || newDealer.phone || '',
      dealerCommissionPercent: numCommissionPercent,
      dealerCommissionAmount,
      dealerCommissionStatus: dealerCommissionStatus,
      status: 'active',
      possessionGiven: false,
      downPaymentReceived: 0,
      downPaymentStatus: remainingDownPayment > 0 ? 'pending' : 'complete',
      createdAt: new Date(),
    };

    const dummyInsts = buildInstallments({
      saleId: dummySale.id,
      customerId: cust.id,
      plotId: selectedPlot.id,
      saleDate: new Date(),
      rows,
      remainingDownPayment,
      includeRemainingDownPayment: false,
      onPossessionEnabled,
      onPossessionAmount: Number(onPossessionAmount) || 0,
      onPossessionDate: parseDateInput(onPossessionDate),
      onPossessionNotes,
      semiAnnualEnabled,
      semiAnnualAmount: Number(semiAnnualAmount) || 0,
    });

    const typedInsts = dummyInsts.map((inst, idx) => ({
      ...inst,
      id: `inst-${idx + 1}`,
    }));

    const html = generateInstallmentSchedule(dummySale, cust, selectedPlot, typedInsts, company);
    printContent(html, `Schedule-${dummySale.saleNumber}`);
  };

  // Preview generated installments list for review section
  const previewInstallments = useMemo(() => {
    return buildInstallments({
      saleId: 'preview-sale',
      customerId: tempCustomerId || 'preview-cust',
      plotId: selectedPlotId || 'preview-plot',
      saleDate: new Date(),
      rows,
      remainingDownPayment,
      includeRemainingDownPayment: false,
      onPossessionEnabled,
      onPossessionAmount: Number(onPossessionAmount) || 0,
      onPossessionDate: parseDateInput(onPossessionDate),
      onPossessionNotes,
      semiAnnualEnabled,
      semiAnnualAmount: Number(semiAnnualAmount) || 0,
    });
  }, [
    rows,
    remainingDownPayment,
    onPossessionEnabled,
    onPossessionAmount,
    onPossessionDate,
    onPossessionNotes,
    semiAnnualEnabled,
    semiAnnualAmount,
    tempCustomerId,
    selectedPlotId,
  ]);

  if (initialLoading) {
    return <PageLoading />;
  }

  const selectedCustomerName = newCustomer.name || '';

  return (
    <div className="pb-32">
      <PageHeader
        title={isBookingMode ? 'New Plot Booking' : 'New Plot Sale'}
        subtitle={
          isBookingMode
            ? 'Reserve a plot and generate booking receipt'
            : 'Complete plot assignment with installment schedule and dealer commission'
        }
        icon={<BookOpen size={20} />}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLoadBookingDialogOpen(true)}
              className="btn btn-secondary btn-sm"
            >
              <BookOpen size={14} /> Load from booking
            </button>
            <button
              type="button"
              onClick={() => setResetDialogOpen(true)}
              className="btn btn-secondary btn-sm text-slate-500 hover:text-slate-800"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        }
      />

      {/* Unsaved draft resume banner */}
      {hasDraft && !draftBannerDismissed && (
        <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
            <span>Resume your unsaved draft from a previous session?</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleResumeDraft}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-amber-200 rounded-lg transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Column Desktop Layout */}
      <div className="flex flex-col xl:flex-row items-start gap-6">
        {/* Left Vertical Section Mini-Nav */}
        <SectionNav
          items={sectionNavItems}
          activeId={activeSectionId}
          onSelect={scrollToSection}
        />

        {/* Center Sections Column */}
        <main className="flex-1 min-w-0 w-full space-y-6">
          {/* Section 1: Customer */}
          <SectionCard
            id="section-customer"
            number={1}
            title="Customer Information"
            status={customerValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending'}
          >
            <CustomerSection
              customers={customers}
              newCustomer={newCustomer}
              onNewCustomerChange={(k, v) => setNewCustomer(c => ({ ...c, [k]: v }))}
              nominee={nominee}
              onNomineeChange={(k, v) => setNominee(n => ({ ...n, [k]: v }))}
              documents={documents}
              onDocumentChange={(k, url) => setDocuments(d => ({ ...d, [k]: url }))}
              tempCustomerId={tempCustomerId}
              errors={fieldErrors}
              isLocked={isBookingLocked}
            />
          </SectionCard>

          {/* Section 2: Plot & Pricing */}
          <SectionCard
            id="section-plot-price"
            number={2}
            title="Plot & Pricing Breakdown"
            status={plotPriceValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending'}
          >
            <PlotPriceSection
              plots={plots}
              selectedPlotId={selectedPlotId}
              onSelectPlotId={setSelectedPlotId}
              perMarlaRate={perMarlaRate}
              onPerMarlaRateChange={setPerMarlaRate}
              totalPrice={totalPrice}
              onTotalPriceChange={setTotalPrice}
              discount={discount}
              onDiscountChange={setDiscount}
              finalPrice={finalPrice}
              downPaymentPercent={downPaymentPercent}
              onDownPaymentPercentChange={handleDpPercentChange}
              downPaymentAmount={downPaymentAmount}
              onDownPaymentAmountChange={handleDpAmountChange}
              remainingDownPayment={remainingDownPayment}
              bookingPaid={numBookingAmount}
              onPossessionEnabled={onPossessionEnabled}
              setOnPossessionEnabled={setOnPossessionEnabled}
              onPossessionAmount={onPossessionAmount}
              setOnPossessionAmount={setOnPossessionAmount}
              onPossessionDate={onPossessionDate}
              setOnPossessionDate={setOnPossessionDate}
              onPossessionNotes={onPossessionNotes}
              setOnPossessionNotes={setOnPossessionNotes}
              semiAnnualEnabled={semiAnnualEnabled}
              setSemiAnnualEnabled={setSemiAnnualEnabled}
              semiAnnualAmount={semiAnnualAmount}
              setSemiAnnualAmount={setSemiAnnualAmount}
              errors={fieldErrors}
              isPlotLocked={isBookingLocked}
            />
          </SectionCard>

          {/* Section 3: Booking */}
          <SectionCard
            id="section-booking"
            number={3}
            title="Advance Booking Details"
            status={bookingValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending'}
          >
            <BookingSection
              bookingEnabled={bookingEnabled}
              setBookingEnabled={setBookingEnabled}
              bookingAmount={bookingAmount}
              onBookingAmountChange={setBookingAmount}
              bookingDate={bookingDate}
              onBookingDateChange={setBookingDate}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              bankName={bankName}
              onBankNameChange={setBankName}
              chequeNumber={chequeNumber}
              onChequeNumberChange={setChequeNumber}
              referenceNumber={referenceNumber}
              onReferenceNumberChange={setReferenceNumber}
              notes={bookingNotes}
              onNotesChange={setBookingNotes}
              receiptNumber={bookingReceiptNumber}
              isBookingLocked={isBookingLocked}
              errors={fieldErrors}
            />
          </SectionCard>

          {/* Section 4: Payment Plan (Hidden in booking-only mode) */}
          {!isBookingMode && (
            <SectionCard
              id="section-plan"
              number={4}
              title="Payment Plan Schedule"
              status={planValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending'}
            >
              <PaymentPlanSection
                paymentPlans={paymentPlans}
                paymentPlanId={paymentPlanId}
                paymentPlanName={paymentPlanName}
                planIsAuto={planIsAuto}
                onSelectPlan={handleSelectPlan}
                rows={rows}
                onUpdateRow={handleUpdateRow}
                onAddRow={handleAddRow}
                onRemoveRow={handleRemoveRow}
                onBalanceLastRow={handleBalanceLastRow}
                remainingForInstallments={planMath.remainingForInstallments}
                remainingToAllocate={planMath.remainingToAllocate}
                grandTotal={planMath.grandTotal}
                semiAnnualTotal={planMath.semiAnnualTotal}
                isExact={planMath.isExact}
                isRounding={planMath.isRounding}
                isMismatch={planMath.isMismatch}
                planValid={planMath.planValid}
                downPaymentPercent={Number(downPaymentPercent) || 20}
                onSaveTemplate={handleSaveTemplate}
                errors={fieldErrors}
              />
            </SectionCard>
          )}

          {/* Section 5: Dealer (Hidden in booking-only mode) */}
          {!isBookingMode && (
            <SectionCard
              id="section-dealer"
              number={5}
              title="Dealer Assignment"
              status={dealerValid ? 'complete' : hasAttemptedSubmit ? 'attention' : 'pending'}
            >
              <DealerSection
                dealerMode={dealerMode}
                setDealerMode={setDealerMode}
                dealers={dealers}
                selectedDealerId={selectedDealerId}
                onSelectDealerId={setSelectedDealerId}
                newDealer={newDealer}
                onNewDealerChange={(k, v) => setNewDealer(d => ({ ...d, [k]: v }))}
                commissionPercent={dealerCommissionPercent}
                onCommissionPercentChange={setDealerCommissionPercent}
                commissionAmount={dealerCommissionAmount}
                commissionStatus={dealerCommissionStatus}
                setCommissionStatus={setDealerCommissionStatus}
                finalPrice={finalPrice}
                errors={fieldErrors}
              />
            </SectionCard>
          )}

          {/* Section 6: Review & Finish */}
          <SectionCard
            id="section-review"
            number={isBookingMode ? 4 : 6}
            title="Review & Finish"
            status="pending"
          >
            <ReviewSection
              customerSummary={{
                name: selectedCustomerName,
                cnic: newCustomer.cnic,
                phone: newCustomer.phone,
                address: newCustomer.address,
                nomineeName: nominee.nomineeName,
                nomineeRelation: nominee.nomineeRelation,
              }}
              plotSummary={
                selectedPlot
                  ? {
                      number: selectedPlot.plotNumber,
                      block: selectedPlot.block,
                      size: selectedPlot.size,
                      sizeUnit: selectedPlot.sizeUnit,
                      category: selectedPlot.category,
                    }
                  : null
              }
              pricingSummary={{
                totalPrice: numTotalPrice,
                discount: numDiscount,
                finalPrice,
                downPaymentAmount: numDownPaymentAmount,
                downPaymentPercent: Number(downPaymentPercent) || 0,
                remainingDownPayment,
                onPossessionEnabled,
                onPossessionAmount: Number(onPossessionAmount) || 0,
                semiAnnualEnabled,
                semiAnnualAmount: Number(semiAnnualAmount) || 0,
              }}
              bookingSummary={{
                enabled: bookingEnabled,
                amount: numBookingAmount,
                date: bookingDate,
                method: paymentMethod,
                receiptNumber: bookingReceiptNumber,
              }}
              planSummary={{
                totalMonths: planMath.totalMonths,
                regularCount: planMath.regularCount,
                grandTotal: planMath.grandTotal,
                remainingForInstallments: planMath.remainingForInstallments,
                planValid: planMath.planValid,
              }}
              dealerSummary={{
                mode: dealerMode,
                name: selectedDealer?.name || newDealer.name || '',
                phone: selectedDealer?.phone || newDealer.phone || '',
                commissionPercent: numCommissionPercent,
                commissionAmount: dealerCommissionAmount,
                status: dealerCommissionStatus,
              }}
              previewInstallments={previewInstallments}
              validationChecklist={validationChecklist}
              onNavigateToSection={scrollToSection}
              mode={isBookingMode ? 'booking' : 'sale'}
              onCompleteSale={handleCompleteSale}
              onSaveBooking={handleSaveBooking}
              isSaving={isSaving}
              savingStage={savingStage}
            />
          </SectionCard>
        </main>

        {/* Right Sticky Summary Panel */}
        <LiveSummaryPanel
          customerName={selectedCustomerName}
          plotLabel={
            selectedPlot
              ? `${selectedPlot.plotNumber} - Block ${selectedPlot.block}`
              : ''
          }
          finalPrice={finalPrice}
          bookingPaid={numBookingAmount}
          downPaymentAmount={numDownPaymentAmount}
          remainingDownPayment={remainingDownPayment}
          onPossessionAmount={Number(onPossessionAmount) || 0}
          onPossessionEnabled={onPossessionEnabled}
          semiAnnualTotal={planMath.semiAnnualTotal}
          semiAnnualEnabled={semiAnnualEnabled}
          planSummaryText={
            !isBookingMode
              ? `${planMath.regularCount} installments${
                  semiAnnualEnabled ? ` + ${planMath.semiAnnualCount} semi-annual` : ''
                }`
              : ''
          }
          monthlyInstallmentText={
            !isBookingMode && rows.length > 0 && rows[0].monthlyAmount > 0
              ? `${formatCurrency(rows[0].monthlyAmount)} / mo`
              : ''
          }
          grandTotal={planMath.grandTotal}
          isExact={planMath.isExact}
          isRounding={planMath.isRounding}
          isMismatch={planMath.isMismatch}
          difference={planMath.difference}
          dealerCommissionAmount={dealerCommissionAmount}
          dealerName={selectedDealer?.name || newDealer.name}
          mode={isBookingMode ? 'booking' : 'sale'}
        />
      </div>

      {/* Sticky Bottom Action Bar */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-2xl py-3 px-4 sm:px-8"
        style={{
          bottom: `${keyboardOffset}px`,
          paddingBottom: 'calc(0.75rem + var(--safe-bottom))',
        }}
        aria-label="Form Actions"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">
              Target Plot:{' '}
              <strong className="text-slate-800">
                {selectedPlot
                  ? `${selectedPlot.plotNumber} (${selectedPlot.size} ${selectedPlot.sizeUnit})`
                  : 'None selected'}
              </strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-500 font-medium">
              Final:{' '}
              <strong className="text-[#1a3c6e]">
                {formatCurrency(finalPrice)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveBooking}
              disabled={isSaving}
              className="btn btn-secondary flex-1 sm:flex-none justify-center py-2.5 px-5 font-bold"
            >
              <BookOpen size={16} /> Save as Booking
            </button>

            {!isBookingMode && (
              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={isSaving}
                className="btn btn-primary flex-1 sm:flex-none justify-center py-2.5 px-6 font-bold shadow-md hover:shadow-lg transition-all"
                style={{ background: '#1a3c6e' }}
              >
                Complete Sale <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Saving and Success Overlay */}
      <SavingOverlay
        isSaving={isSaving}
        savingStage={savingStage}
        isSuccess={isSuccess}
        successResult={successResult}
        isBookingOnly={!successResult?.saleId}
        onPrintBookingReceipt={handlePrintBookingReceipt}
        onPrintAgreement={handlePrintAgreement}
        onPrintSchedule={handlePrintSchedule}
        onOpenCustomerLedger={() => {
          if (successResult?.customerId) {
            navigate(`/reports/customer-ledger?customerId=${successResult.customerId}`);
          }
        }}
        onReceiveFirstPayment={() => {
          if (successResult?.saleId) {
            navigate(`/payments/receive?saleId=${successResult.saleId}`);
          }
        }}
        onContinueToCompleteSale={() => {
          if (successResult?.bookingId) {
            setIsSuccess(false);
            setSearchParams({ bookingId: successResult.bookingId });
            handleLoadBooking(successResult.bookingId);
          }
        }}
        onNewSale={handleResetForm}
      />

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        onConfirm={handleResetForm}
        title="Reset Sale Form"
        message="Are you sure you want to reset all entered information and clear unsaved drafts?"
        confirmLabel="Reset Form"
        confirmVariant="danger"
      />

      {/* Load from booking modal */}
      {loadBookingDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-800">
              Load Confirmed Booking
            </h3>
            <p className="text-xs text-slate-500">
              Select an existing confirmed booking to convert into a full plot sale.
            </p>
            <div>
              <SearchableSelect
                value=""
                onChange={val => {
                  if (val) {
                    handleLoadBooking(val);
                    setLoadBookingDialogOpen(false);
                  }
                }}
                options={bookings.map(bk => {
                  const cust = customers.find(c => c.id === bk.customerId);
                  const pl = plots.find(p => p.id === bk.plotId);
                  return {
                    value: bk.id,
                    label: `${bk.receiptNumber} — ${cust?.name || 'Customer'}`,
                    sublabel: `Plot ${pl?.plotNumber || ''} · Paid: ${formatCurrency(bk.bookingAmount)}`,
                  };
                })}
                placeholder="Search confirmed bookings..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setLoadBookingDialogOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewSale;
