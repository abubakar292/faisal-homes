import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
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
  Installment,
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
    includeRemainingDownPayment: false,
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

/**
 * Synchronizes and heals existing sales and installments in Firestore:
 * 1. Removes any orphan or legacy 'down_payment' documents from the 'installments' collection
 *    (or marks them paid if down payment was completed).
 * 2. Merges legacy separate semi-annual installment rows into the 36 monthly rows
 *    so the database matches the 36-month schedule specification.
 */
export async function healSalesAndInstallments(): Promise<{ healedSales: number; deletedDPDocs: number }> {
  let healedSales = 0;
  let deletedDPDocs = 0;

  try {
    const salesSnap = await getDocs(collection(db, 'sales'));
    if (salesSnap.empty) return { healedSales: 0, deletedDPDocs: 0 };

    for (const saleDoc of salesSnap.docs) {
      const saleData = saleDoc.data() as Sale;
      const saleId = saleDoc.id;
      if (saleData.status === 'cancelled') continue;

      const instSnap = await getDocs(
        query(collection(db, 'installments'), where('saleId', '==', saleId))
      );
      if (instSnap.empty) continue;

      const batch = writeBatch(db);
      let batchHasWrites = false;

      // 1. Remove/heal any down_payment installments
      const dpDocs = instSnap.docs.filter(d => d.data().type === 'down_payment');
      if (dpDocs.length > 0) {
        const isComplete = saleData.downPaymentStatus === 'complete' ||
          (saleData.downPaymentReceived || 0) >= (saleData.remainingDownPayment || 0) ||
          saleData.remainingDownPayment === 0;

        for (const dpDoc of dpDocs) {
          if (isComplete) {
            batch.delete(dpDoc.ref);
            batchHasWrites = true;
            deletedDPDocs++;
          } else {
            batch.update(dpDoc.ref, {
              amountPaid: saleData.downPaymentReceived || 0,
              status: (saleData.downPaymentReceived || 0) > 0 ? 'partial' : 'pending'
            });
            batchHasWrites = true;
          }
        }
      }

      // 2. Consolidate legacy 42 installments into 36 months if separate semi-annual rows exist
      const regularDocs = instSnap.docs.filter(d => d.data().type !== 'down_payment' && d.data().type !== 'on_possession');
      const monthlyDocs = regularDocs.filter(d => d.data().type === 'monthly');
      const semiDocs = regularDocs.filter(d => d.data().type === 'semi_annual');

      // If we have separate semi-annual docs alongside monthly docs (e.g. 36 monthly + 6 semi = 42 rows)
      if (semiDocs.length > 0 && monthlyDocs.length > 0 && regularDocs.length > monthlyDocs.length) {
        const toJsDate = (val: any): Date => {
          if (!val) return new Date();
          if (typeof val?.toDate === 'function') return val.toDate();
          return new Date(val);
        };

        const sortedMonthly = [...monthlyDocs].sort((a, b) => {
          const dateA = toJsDate(a.data().dueDate);
          const dateB = toJsDate(b.data().dueDate);
          return dateA.getTime() - dateB.getTime();
        });

        const remainingSemi = [...semiDocs];

        sortedMonthly.forEach((mDoc, idx) => {
          const mData = mDoc.data() as Installment;
          const monthNumber = idx + 1;
          const mDate = toJsDate(mData.dueDate);
          const mKey = `${mDate.getFullYear()}-${mDate.getMonth()}`;

          let matchIdx = remainingSemi.findIndex(s => {
            const sDate = toJsDate(s.data().dueDate);
            return `${sDate.getFullYear()}-${sDate.getMonth()}` === mKey;
          });

          if (matchIdx === -1 && monthNumber % 6 === 0 && remainingSemi.length > 0) {
            matchIdx = 0;
          }

          if (matchIdx !== -1) {
            const [matchedSemi] = remainingSemi.splice(matchIdx, 1);
            const sData = matchedSemi.data() as Installment;
            const combinedDue = (mData.amountDue || 0) + (sData.amountDue || 0);
            const combinedPaid = (mData.amountPaid || 0) + (sData.amountPaid || 0);
            const isPaid = combinedPaid >= combinedDue && combinedDue > 0;
            const isPartial = combinedPaid > 0 && !isPaid;

            const semiNote = `Includes Rs. ${(sData.amountDue || 0).toLocaleString('en-PK')} Semi-Annual Payment`;
            const existingNote = mData.notes ? `${mData.notes}; ` : '';

            batch.update(mDoc.ref, {
              amountDue: combinedDue,
              amountPaid: combinedPaid,
              type: 'semi_annual',
              installmentNumber: monthNumber,
              totalInstallments: 36,
              notes: existingNote ? `${existingNote}${semiNote}` : semiNote,
              status: isPaid ? 'paid' : isPartial ? 'partial' : mData.status,
            });

            // Delete the separate semi-annual doc
            batch.delete(matchedSemi.ref);
            batchHasWrites = true;
          } else {
            batch.update(mDoc.ref, {
              installmentNumber: monthNumber,
              totalInstallments: 36,
            });
            batchHasWrites = true;
          }
        });

        // Any leftover semi docs that didn't match get deleted
        remainingSemi.forEach(s => {
          batch.delete(s.ref);
          batchHasWrites = true;
        });

        healedSales++;
      }

      if (batchHasWrites) {
        await batch.commit();
      }
    }
  } catch (err) {
    console.error('Error during sales and installments healing:', err);
  }

  return { healedSales, deletedDPDocs };
}

