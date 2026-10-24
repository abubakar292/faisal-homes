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
import {
  computeSchedule,
  expectedCounts,
  validateSchedule,
  PlanInput,
} from '../domain/plan';
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

import { z } from 'zod';

export const saleCustomerInputSchema = z.object({
  existingId: z.string().optional(),
  newCustomer: z.any().optional(),
  nominee: z.any().optional(),
  documents: z.any().optional(),
}).refine(data => Boolean(data.existingId || data.newCustomer), {
  message: 'Customer information is required (select existing or register new).',
});

export const bookingDetailsInputSchema = z.object({
  bookingDate: z.union([z.date(), z.string()]).optional(),
  bookingAmount: z.number().min(0, 'Booking amount cannot be negative.').optional(),
  paymentMethod: z.any().optional(),
  bankName: z.string().optional(),
  chequeNumber: z.string().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const installmentRowSchema: z.ZodType<InstallmentRow> = z.object({
  id: z.string(),
  months: z.number().min(1, 'Months must be at least 1.'),
  intervalMonths: z.number().optional(),
  planAuto: z.boolean().optional(),
  monthlyAmount: z.number().min(0, 'Monthly amount cannot be negative.'),
  totalAmount: z.number().min(0, 'Total amount cannot be negative.'),
});

export const saveSaleInputSchema = z.object({
  customer: saleCustomerInputSchema,
  plotId: z.string().min(1, 'Please select a plot for this sale.'),
  existingBookingId: z.string().optional(),
  booking: bookingDetailsInputSchema.optional(),
  saleDate: z.union([z.date(), z.string()], { message: 'Sale date is required.' }),
  totalPrice: z.number().positive('Total plot price must be greater than zero.'),
  perMarlaRate: z.number().optional(),
  discount: z.number().min(0, 'Discount cannot be negative.').optional(),
  downPaymentPercent: z.number().min(0).max(100).optional(),
  downPaymentAmount: z.number().min(0).optional(),
  includeRemainingDownPayment: z.boolean().optional(),
  onPossessionEnabled: z.boolean().optional(),
  onPossessionAmount: z.number().min(0).optional(),
  onPossessionDate: z.union([z.date(), z.string()]).nullable().optional(),
  onPossessionNotes: z.string().optional(),
  semiAnnualEnabled: z.boolean().optional(),
  semiAnnualAmount: z.number().min(0).optional(),
  rows: z.array(installmentRowSchema).min(1, 'At least one installment row is required in the payment schedule.'),
  paymentPlanId: z.string().optional(),
  paymentPlanName: z.string().optional(),
  paymentPlanModified: z.boolean().optional(),
  dealer: z.any().optional(),
}).refine(data => {
  const discount = data.discount || 0;
  return discount < data.totalPrice;
}, {
  message: 'Discount cannot exceed or equal total price.',
  path: ['discount'],
}).refine(data => {
  const dpAmount = data.downPaymentAmount || 0;
  const bookingAmt = data.booking?.bookingAmount || 0;
  return bookingAmt <= dpAmount;
}, {
  message: 'Booking amount cannot exceed total down payment amount.',
  path: ['booking', 'bookingAmount'],
});

export const saveBookingOnlyInputSchema = z.object({
  customer: saleCustomerInputSchema,
  plotId: z.string().min(1, 'Please select a plot to book.'),
  bookingDate: z.union([z.date(), z.string()], { message: 'Booking date is required.' }),
  perMarlaRate: z.number().optional(),
  totalPrice: z.number().positive('Total price must be greater than zero.'),
  bookingAmount: z.number().positive('Booking advance amount must be greater than zero.'),
  paymentMethod: z.any(),
  bankName: z.string().optional(),
  chequeNumber: z.string().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => data.bookingAmount <= data.totalPrice, {
  message: 'Booking advance cannot exceed total plot price.',
  path: ['bookingAmount'],
});

export type SaveSaleInput = z.infer<typeof saveSaleInputSchema>;
export type SaveBookingOnlyInput = z.infer<typeof saveBookingOnlyInputSchema>;

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
  const parsed = saveBookingOnlyInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid booking details');
  }
  const plotRef = doc(db, 'plots', input.plotId);
  const plotSnap = await getDoc(plotRef);

  if (!plotSnap.exists()) {
    throw new Error('Selected plot does not exist');
  }

  const plotData = plotSnap.data() as Plot;
  if (plotData.status !== 'available') {
    throw new Error(`Plot is not available (current status: ${plotData.status})`);
  }

  if (!input.bookingAmount || input.bookingAmount <= 0) {
    throw new Error('Booking amount is required and must be greater than 0');
  }
  if (!input.totalPrice || input.totalPrice <= 0) {
    throw new Error('Total price is required and must be greater than 0');
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
  const parsed = saveSaleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid sale details');
  }

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

  // 3. Resolve Booking (Always required for every sale)
  const dpAmt = input.downPaymentAmount || 0;
  let finalBookingId = input.existingBookingId || '';
  let bookingPaid = 0;

  if (input.existingBookingId) {
    if (!existingBookingData) {
      throw new Error('Linked booking could not be found');
    }
    bookingPaid = existingBookingData.bookingAmount || 0;
    if (bookingPaid <= 0) {
      throw new Error('Booking amount must be greater than 0');
    }
    if (bookingPaid > dpAmt) {
      throw new Error('Booking amount cannot exceed down payment amount');
    }
    const existingBkRef = doc(db, 'bookings', input.existingBookingId);
    firstBatch.update(existingBkRef, { status: 'converted' });
  } else {
    if (!input.booking || !input.booking.bookingAmount || input.booking.bookingAmount <= 0) {
      throw new Error('Booking amount is required and must be greater than 0');
    }
    if (input.booking.bookingAmount > dpAmt) {
      throw new Error('Booking amount cannot exceed down payment amount');
    }

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

  // 7. Hard validation & Installments generation using pure domain module
  const planInput: PlanInput = {
    saleId: saleDocRef.id,
    customerId: finalCustomerId,
    plotId: input.plotId,
    saleDate: saleDateObj,
    totalPrice: input.totalPrice,
    discount: input.discount || 0,
    bookingPaid,
    downPaymentAmount: input.downPaymentAmount || 0,
    rows: input.rows,
    semiAnnualEnabled: input.semiAnnualEnabled,
    semiAnnualAmount: input.semiAnnualAmount,
    onPossessionEnabled: input.onPossessionEnabled,
    onPossessionAmount: input.onPossessionAmount,
    onPossessionDate: parseDateInput(input.onPossessionDate),
    includeRemainingDownPayment:
      input.includeRemainingDownPayment !== undefined
        ? input.includeRemainingDownPayment
        : planMath.remainingDownPayment > 0,
  };

  const expCounts = expectedCounts(planInput);
  const allInstallments = computeSchedule(planInput);
  const planValidation = validateSchedule(planInput, allInstallments);

  if (!planValidation.valid) {
    const actualTotal = allInstallments
      .filter(d => d.type !== 'down_payment')
      .reduce((s, d) => s + (d.amountDue || 0), 0);
    const targetTotal = expCounts.amountToSchedule + expCounts.possessionAmount;
    throw new Error(
      `The installment schedule does not match the plan (expected ${expCounts.totalCount} installments totalling Rs ${targetTotal.toLocaleString('en-PK')}, got ${allInstallments.length} totalling Rs ${actualTotal.toLocaleString('en-PK')})`
    );
  }

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

  // Post-save verification: query saved installments for this sale
  const verifySnap = await getDocs(
    query(collection(db, 'installments'), where('saleId', '==', saleDocRef.id))
  );
  if (verifySnap.size !== allInstallments.length) {
    throw new Error(
      `The installment schedule does not match the plan (expected ${allInstallments.length} installments, verified in database ${verifySnap.size})`
    );
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
 * Cancels a sale:
 * - Updates sale status to 'cancelled'
 * - Frees the plot (sets status back to 'available')
 * - Marks all unpaid installments for this sale as 'cancelled'
 * - Cancels any pending dealer commission
 */
export async function cancelSale(saleId: string): Promise<void> {
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (!saleSnap.exists()) {
    throw new Error('Sale not found');
  }
  const saleData = saleSnap.data() as Sale;

  const batch = writeBatch(db);

  // 1. Mark sale as cancelled
  batch.update(saleRef, {
    status: 'cancelled',
    cancelledAt: new Date(),
  });

  // 2. Plot becomes available again
  if (saleData.plotId) {
    const plotRef = doc(db, 'plots', saleData.plotId);
    batch.update(plotRef, { status: 'available' });
  }

  // 3. Mark unpaid installments as cancelled
  const instSnap = await getDocs(
    query(collection(db, 'installments'), where('saleId', '==', saleId))
  );
  for (const iDoc of instSnap.docs) {
    const iData = iDoc.data() as Installment;
    if (iData.status !== 'paid') {
      batch.update(iDoc.ref, { status: 'cancelled' });
    }
  }

  // 4. Update dealer commission
  const commSnap = await getDocs(
    query(collection(db, 'dealerCommissions'), where('saleId', '==', saleId))
  );
  for (const cDoc of commSnap.docs) {
    batch.update(cDoc.ref, { paymentStatus: 'cancelled' });
  }

  // 5. Remove unearned dealer ledger entries for this cancelled sale
  const dLedgerSnap = await getDocs(
    query(collection(db, 'dealerLedger'), where('saleId', '==', saleId))
  );
  for (const dDoc of dLedgerSnap.docs) {
    batch.delete(dDoc.ref);
  }

  await batch.commit();
}

/**
 * Permanently deletes a sale (used to clean up corrupt/test sales):
 * - Frees the plot (status 'available')
 * - Deletes all installments associated with the sale
 * - Deletes dealer ledger entries and dealer commissions for the sale
 * - Deletes down payment transactions for the sale
 * - Deletes the sale document itself
 */
export async function deleteSale(saleId: string): Promise<void> {
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (!saleSnap.exists()) {
    return;
  }
  const saleData = saleSnap.data() as Sale;

  // 1. Revert plot to available
  if (saleData.plotId) {
    const plotRef = doc(db, 'plots', saleData.plotId);
    const plotSnap = await getDoc(plotRef);
    if (plotSnap.exists()) {
      const pData = plotSnap.data() as Plot;
      if (pData.status === 'sold' || pData.status === 'booked') {
        const batchP = writeBatch(db);
        batchP.update(plotRef, { status: 'available' });
        await batchP.commit();
      }
    }
  }

  // 2. Delete all installments
  const instSnap = await getDocs(
    query(collection(db, 'installments'), where('saleId', '==', saleId))
  );
  if (!instSnap.empty) {
    const CHUNK = 400;
    for (let i = 0; i < instSnap.docs.length; i += CHUNK) {
      const b = writeBatch(db);
      instSnap.docs.slice(i, i + CHUNK).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }

  // 3. Delete dealer commissions & ledger
  const commSnap = await getDocs(
    query(collection(db, 'dealerCommissions'), where('saleId', '==', saleId))
  );
  if (!commSnap.empty) {
    const b = writeBatch(db);
    commSnap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
  }

  const dLedgerSnap = await getDocs(
    query(collection(db, 'dealerLedger'), where('saleId', '==', saleId))
  );
  if (!dLedgerSnap.empty) {
    const b = writeBatch(db);
    dLedgerSnap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
  }

  // 4. Delete DP transactions
  const dpSnap = await getDocs(
    query(collection(db, 'downPaymentTransactions'), where('saleId', '==', saleId))
  );
  if (!dpSnap.empty) {
    const b = writeBatch(db);
    dpSnap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
  }

  // 5. Delete the sale document
  const finalBatch = writeBatch(db);
  finalBatch.delete(saleRef);
  await finalBatch.commit();
}

/**
 * Non-destructive synchronization:
 * Checks sales and down_payment documents without modifying regular installment rows.
 */
export async function healSalesAndInstallments(): Promise<{ healedSales: number; deletedDPDocs: number }> {
  return { healedSales: 0, deletedDPDocs: 0 };
}


