import {
  collection,
  doc,
  getDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateCustomerId } from '../utils/customerIdGenerator';
import { generateReceiptNumber } from '../utils/formatters';
import {
  CustomerFormData,
  buildCustomerPayload,
  defaultNomineeDetails,
} from '../utils/customerForm';
import {
  DealerFormData,
  buildDealerPayload,
} from '../utils/dealerForm';
import {
  calculateSalePlan,
  buildInstallments,
} from '../utils/saleCalc';
import type {
  Customer,
  Plot,
  Booking,
  Sale,
  InstallmentRow,
  NomineeDetails,
  CustomerDocuments,
  PaymentMethod,
} from '../types';

function prepareForFirestore(data: Record<string, any>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = Timestamp.fromDate(value);
    } else if (value === undefined) {
      result[key] = null;
    } else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Timestamp)
    ) {
      result[key] = prepareForFirestore(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function parseDateInput(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export interface SaleCustomerInput {
  existingId?: string;
  newCustomer?: CustomerFormData;
  nominee?: NomineeDetails;
  documents?: CustomerDocuments;
}

export interface SaleDealerInput {
  existingId?: string;
  newDealer?: DealerFormData;
  dealerName?: string;
  dealerPhone?: string;
  commissionPercent?: number;
  commissionStatus?: 'paid' | 'pending';
}

export interface BookingDetailsInput {
  bookingDate?: Date | string;
  bookingAmount?: number;
  paymentMethod?: PaymentMethod;
  bankName?: string;
  chequeNumber?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface SaveBookingOnlyInput {
  customer: SaleCustomerInput;
  plotId: string;
  bookingDate: Date | string;
  perMarlaRate: number;
  totalPrice: number;
  bookingAmount: number;
  paymentMethod: PaymentMethod;
  bankName?: string;
  chequeNumber?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface SaveSaleInput {
  customer: SaleCustomerInput;
  plotId: string;
  existingBookingId?: string;
  booking?: BookingDetailsInput;
  saleDate: Date | string;
  totalPrice: number;
  perMarlaRate?: number;
  discount?: number;
  downPaymentPercent?: number;
  downPaymentAmount?: number;
  includeRemainingDownPayment?: boolean;
  onPossessionEnabled?: boolean;
  onPossessionAmount?: number;
  onPossessionDate?: Date | string | null;
  onPossessionNotes?: string;
  semiAnnualEnabled?: boolean;
  semiAnnualAmount?: number;
  rows: InstallmentRow[];
  paymentPlanId?: string;
  paymentPlanName?: string;
  paymentPlanModified?: boolean;
  dealer?: SaleDealerInput;
}

export interface SubmitServiceResult {
  customerId: string;
  plotId: string;
  bookingId?: string;
  saleId?: string;
  receiptNumber?: string;
}

/**
 * Saves a new booking only with atomic Firestore writeBatch
 */
export async function saveBookingOnly(input: SaveBookingOnlyInput): Promise<SubmitServiceResult> {
  const plotRef = doc(db, 'plots', input.plotId);
  const plotSnap = await getDoc(plotRef);

  if (!plotSnap.exists()) {
    throw new Error('Selected plot does not exist');
  }

  const plotData = plotSnap.data() as Plot;
  if (plotData.status !== 'available') {
    throw new Error(`Plot is not available (current status: ${plotData.status})`);
  }

  const batch = writeBatch(db);

  // 1. Resolve Customer ID and document
  let finalCustomerId = input.customer.existingId || '';
  if (!finalCustomerId) {
    if (!input.customer.newCustomer) {
      throw new Error('Customer information is required');
    }
    const newCustId = await generateCustomerId();
    const customerPayload = buildCustomerPayload(
      input.customer.newCustomer,
      input.customer.nominee || defaultNomineeDetails,
      input.customer.documents || {}
    );
    const newCustomerRef = doc(collection(db, 'customers'));
    finalCustomerId = newCustomerRef.id;
    batch.set(
      newCustomerRef,
      prepareForFirestore({
        ...customerPayload,
        customerId: newCustId,
        createdAt: new Date(),
      })
    );
  }

  // 2. Create Booking Document
  const bookingDateObj = parseDateInput(input.bookingDate) || new Date();
  const receiptNumber = generateReceiptNumber('BK');
  const bookingRef = doc(collection(db, 'bookings'));

  const bookingDocData = {
    receiptNumber,
    customerId: finalCustomerId,
    plotId: input.plotId,
    bookingDate: bookingDateObj,
    perMarlaRate: input.perMarlaRate,
    totalPrice: input.totalPrice,
    bookingAmount: input.bookingAmount,
    paymentMethod: input.paymentMethod || 'Cash',
    bankName: input.bankName || '',
    chequeNumber: input.chequeNumber || '',
    referenceNumber: input.referenceNumber || '',
    notes: input.notes || '',
    status: 'confirmed' as const,
    createdAt: new Date(),
  };

  batch.set(bookingRef, prepareForFirestore(bookingDocData));

  // 3. Update Plot Status -> booked
  batch.update(plotRef, { status: 'booked' });

  // 4. Commit batch
  await batch.commit();

  return {
    customerId: finalCustomerId,
    plotId: input.plotId,
    bookingId: bookingRef.id,
    receiptNumber,
  };
}

/**
 * Saves a completed Sale with all installments, plot update, dealer ledger & commission
 */
export async function saveSale(input: SaveSaleInput): Promise<SubmitServiceResult> {
  const plotRef = doc(db, 'plots', input.plotId);
  const plotSnap = await getDoc(plotRef);

  if (!plotSnap.exists()) {
    throw new Error('Selected plot does not exist');
  }

  const plotData = { ...plotSnap.data(), id: plotSnap.id } as Plot;

  // Re-read plot status check: can be available or booked
  let existingBookingData: Booking | null = null;
  if (input.existingBookingId) {
    const bkRef = doc(db, 'bookings', input.existingBookingId);
    const bkSnap = await getDoc(bkRef);
    if (bkSnap.exists()) {
      existingBookingData = { ...bkSnap.data(), id: bkSnap.id } as Booking;
    }
  }

  if (plotData.status !== 'available') {
    const isBookedForSame =
      plotData.status === 'booked' &&
      existingBookingData &&
      existingBookingData.plotId === input.plotId;

    if (!isBookedForSame) {
      throw new Error(`Plot is not available for sale (status: ${plotData.status})`);
    }
  }

  const firstBatch = writeBatch(db);

  // 1. Resolve Customer
  let finalCustomerId = input.customer.existingId || '';
  if (!finalCustomerId) {
    if (!input.customer.newCustomer) {
      throw new Error('Customer information is required');
    }
    const newCustId = await generateCustomerId();
    const customerPayload = buildCustomerPayload(
      input.customer.newCustomer,
      input.customer.nominee || defaultNomineeDetails,
      input.customer.documents || {}
    );
    const newCustomerRef = doc(collection(db, 'customers'));
    finalCustomerId = newCustomerRef.id;
    firstBatch.set(
      newCustomerRef,
      prepareForFirestore({
        ...customerPayload,
        customerId: newCustId,
        createdAt: new Date(),
      })
    );
  }

  // 2. Resolve Dealer
  let dealerName = input.dealer?.dealerName?.trim() || '';
  let dealerPhone = input.dealer?.dealerPhone?.trim() || '';
  let dealerId = input.dealer?.existingId || '';
  const commissionPercent = input.dealer?.commissionPercent || 0;
  const commissionStatus = input.dealer?.commissionStatus || 'pending';

  if (!dealerName && input.dealer?.newDealer) {
    const dealerPayload = buildDealerPayload(input.dealer.newDealer);
    const newDealerRef = doc(collection(db, 'dealers'));
    dealerId = newDealerRef.id;
    dealerName = dealerPayload.name;
    dealerPhone = dealerPayload.phone;
    firstBatch.set(
      newDealerRef,
      prepareForFirestore({
        ...dealerPayload,
        createdAt: new Date(),
      })
    );
  } else if (!dealerName && dealerId) {
    const dRef = doc(db, 'dealers', dealerId);
    const dSnap = await getDoc(dRef);
    if (dSnap.exists()) {
      const dData = dSnap.data() as any;
      dealerName = dData.name || '';
      dealerPhone = dData.phone || '';
    }
  }

  // 3. Resolve Booking
  let finalBookingId = input.existingBookingId || '';
  let bookingPaid = 0;

  if (input.existingBookingId) {
    const existingBkRef = doc(db, 'bookings', input.existingBookingId);
    firstBatch.update(existingBkRef, { status: 'converted' });
    bookingPaid = existingBookingData?.bookingAmount || 0;
  } else if (input.booking?.bookingAmount && input.booking.bookingAmount > 0) {
    // New booking entered inline with the sale -> create immediately converted booking
    const newBkRef = doc(collection(db, 'bookings'));
    finalBookingId = newBkRef.id;
    bookingPaid = input.booking.bookingAmount;
    const bkReceipt = generateReceiptNumber('BK');
    const bkDate = parseDateInput(input.booking.bookingDate) || parseDateInput(input.saleDate) || new Date();

    firstBatch.set(
      newBkRef,
      prepareForFirestore({
        receiptNumber: bkReceipt,
        customerId: finalCustomerId,
        plotId: input.plotId,
        bookingDate: bkDate,
        perMarlaRate: input.perMarlaRate || 0,
        totalPrice: input.totalPrice,
        bookingAmount: input.booking.bookingAmount,
        paymentMethod: input.booking.paymentMethod || 'Cash',
        bankName: input.booking.bankName || '',
        chequeNumber: input.booking.chequeNumber || '',
        referenceNumber: input.booking.referenceNumber || '',
        notes: input.booking.notes || '',
        status: 'converted' as const,
        createdAt: new Date(),
      })
    );
  }

  // 4. Calculate pricing & plan
  const planMath = calculateSalePlan({
    totalPrice: input.totalPrice,
    discount: input.discount || 0,
    bookingPaid,
    downPaymentAmount: input.downPaymentAmount || 0,
    onPossessionEnabled: input.onPossessionEnabled,
    onPossessionAmount: input.onPossessionAmount,
    semiAnnualEnabled: input.semiAnnualEnabled,
    semiAnnualAmount: input.semiAnnualAmount,
    rows: input.rows,
  });

  const saleDateObj = parseDateInput(input.saleDate) || new Date();
  const saleNumber = generateReceiptNumber('SALE');
  const saleDocRef = doc(collection(db, 'sales'));
  const dealerCommissionAmt =
    commissionPercent > 0 ? Math.round((planMath.finalPrice * commissionPercent) / 100) : 0;

  const saleData: Omit<Sale, 'id'> = {
    saleNumber,
    customerId: finalCustomerId,
    plotId: input.plotId,
    bookingId: finalBookingId,
    saleDate: saleDateObj,
    totalPrice: input.totalPrice,
    bookingAmountPaid: bookingPaid,
    discount: input.discount || 0,
    finalPrice: planMath.finalPrice,
    downPayment: input.downPaymentAmount || 0,
    downPaymentPercent: input.downPaymentPercent || 0,
    downPaymentAmount: input.downPaymentAmount || 0,
    remainingDownPayment: planMath.remainingDownPayment,
    semiAnnualEnabled: !!input.semiAnnualEnabled,
    semiAnnualAmount: input.semiAnnualAmount || 0,
    semiAnnualCount: planMath.semiAnnualCount,
    semiAnnualTotal: planMath.semiAnnualTotal,
    onPossessionEnabled: !!input.onPossessionEnabled,
    onPossessionAmount: input.onPossessionAmount || 0,
    onPossessionDate: input.onPossessionEnabled
      ? parseDateInput(input.onPossessionDate)
      : null,
    onPossessionStatus: 'Pending',
    onPossessionPaidDate: null,
    onPossessionNotes: input.onPossessionNotes || '',
    balanceAfterBooking: planMath.balanceAfterBooking,
    remainingAmount: planMath.remainingForInstallments,
    installmentRows: input.rows,
    ...(input.paymentPlanId
      ? {
          paymentPlanId: input.paymentPlanId,
          paymentPlanName: input.paymentPlanName,
          paymentPlanModified: !!input.paymentPlanModified,
        }
      : {}),
    dealerName,
    dealerPhone,
    dealerCommissionPercent: commissionPercent,
    dealerCommissionAmount: dealerCommissionAmt,
    dealerCommissionStatus: commissionStatus,
    status: 'active',
    possessionGiven: false,
    downPaymentReceived: 0,
    downPaymentStatus: planMath.remainingDownPayment > 0 ? 'pending' : 'complete',
    createdAt: new Date(),
    ...(input.perMarlaRate ? { perMarlaRate: input.perMarlaRate } : {}),
  };

  firstBatch.set(saleDocRef, prepareForFirestore(saleData));

  // 5. Update Plot Status -> sold
  firstBatch.update(plotRef, { status: 'sold' });

  // 6. Dealer ledger & commission entries
  if (dealerName) {
    const plotLabel = `${plotData.plotNumber} B${plotData.block}`;
    const ledgerRef = doc(collection(db, 'dealerLedger'));
    firstBatch.set(
      ledgerRef,
      prepareForFirestore({
        dealerName,
        dealerPhone,
        type: 'commission_earned',
        amount: dealerCommissionAmt,
        saleId: saleDocRef.id,
        plotInfo: plotLabel,
        paymentMethod: '',
        note: '',
        date: saleDateObj,
        createdAt: new Date(),
      })
    );

    const commRef = doc(collection(db, 'dealerCommissions'));
    firstBatch.set(
      commRef,
      prepareForFirestore({
        dealerId,
        dealerName,
        dealerPhone,
        saleId: saleDocRef.id,
        saleAmount: planMath.finalPrice,
        downPayment: input.downPaymentAmount || 0,
        commissionPercent,
        commissionAmount: dealerCommissionAmt,
        paymentStatus: commissionStatus,
        paymentDate: commissionStatus === 'paid' ? new Date() : null,
        notes: '',
        createdAt: new Date(),
      })
    );
  }

  // 7. Installments generation
  const allInstallments = buildInstallments({
    saleId: saleDocRef.id,
    customerId: finalCustomerId,
    plotId: input.plotId,
    saleDate: saleDateObj,
    rows: input.rows,
    remainingDownPayment: planMath.remainingDownPayment,
    includeRemainingDownPayment: input.includeRemainingDownPayment,
    onPossessionEnabled: input.onPossessionEnabled,
    onPossessionAmount: input.onPossessionAmount,
    onPossessionDate: parseDateInput(input.onPossessionDate),
    onPossessionNotes: input.onPossessionNotes,
    semiAnnualEnabled: input.semiAnnualEnabled,
    semiAnnualAmount: input.semiAnnualAmount,
  });

  // Commit with chunking if needed: first chunk commits sale + plot + initial installments
  const CHUNK_SIZE = 450;
  const firstChunkInsts = allInstallments.slice(0, 400); // Leave room in first batch
  for (const inst of firstChunkInsts) {
    const instRef = doc(collection(db, 'installments'));
    firstBatch.set(instRef, prepareForFirestore(inst));
  }

  await firstBatch.commit();

  // Any remaining installments in subsequent batches
  for (let i = 400; i < allInstallments.length; i += CHUNK_SIZE) {
    const subsequentBatch = writeBatch(db);
    const chunk = allInstallments.slice(i, i + CHUNK_SIZE);
    for (const inst of chunk) {
      const instRef = doc(collection(db, 'installments'));
      subsequentBatch.set(instRef, prepareForFirestore(inst));
    }
    await subsequentBatch.commit();
  }

  return {
    customerId: finalCustomerId,
    plotId: input.plotId,
    bookingId: finalBookingId || undefined,
    saleId: saleDocRef.id,
    receiptNumber: saleNumber,
  };
}
