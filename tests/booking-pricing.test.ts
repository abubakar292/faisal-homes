import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateTotalPriceFromRate,
  calculateDownPaymentAmount,
  calculateRemainingDownPayment,
  validateBookingPricing,
  calculateSalePlan,
} from '../src/utils/saleCalc';
import {
  computeSchedule,
  expectedCounts,
  validateSchedule,
  PlanInput,
} from '../src/domain/plan';

const dbOperations = {
  sets: [] as Array<{ path: string; data: any }>,
  updates: [] as Array<{ path: string; data: any }>,
};

let docCounter = 0;

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: vi.fn((_db: any, name?: string) => ({ id: name || 'coll', path: name || 'coll' })),
    doc: vi.fn((_dbOrColl: any, collOrId?: string, docId?: string) => {
      docCounter++;
      if (docId) {
        return { id: docId, path: `${collOrId}/${docId}` };
      }
      if (collOrId) {
        return { id: `doc-${docCounter}`, path: `${collOrId}/doc-${docCounter}` };
      }
      if (_dbOrColl && _dbOrColl.path) {
        return { id: `doc-${docCounter}`, path: `${_dbOrColl.path}/doc-${docCounter}` };
      }
      return { id: `doc-${docCounter}`, path: `coll/doc-${docCounter}` };
    }),
    getDoc: vi.fn(async (docRef: any) => {
      if (docRef.path && docRef.path.includes('plots')) {
        return {
          exists: () => true,
          id: 'plot-123',
          data: () => ({
            id: 'plot-123',
            plotNumber: 'P-101',
            block: 'B',
            size: 10,
            sizeUnit: 'Marla',
            category: 'residential',
            status: 'available',
          }),
        };
      }
      return { exists: () => false, id: 'missing', data: () => null };
    }),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    getDocs: vi.fn(async () => {
      return { size: 44 };
    }),
    writeBatch: vi.fn(() => ({
      set: (ref: any, data: any) => {
        dbOperations.sets.push({ path: ref.path, data });
      },
      update: (ref: any, data: any) => {
        dbOperations.updates.push({ path: ref.path, data });
      },
      commit: vi.fn(async () => {}),
    })),
  };
});

// Import saveSale after mocking firestore
import { saveSale, SaveSaleInput } from '../src/services/saleService';

describe('P1-3 Booking and Pricing Breakdown', () => {
  beforeEach(() => {
    dbOperations.sets = [];
    dbOperations.updates = [];
    docCounter = 0;
  });

  it('booking 100,000 with down payment 600,000 gives remaining down payment 500,000', () => {
    const downPayment = 600_000;
    const booking = 100_000;
    const remaining = calculateRemainingDownPayment(downPayment, booking);

    expect(remaining).toBe(500_000);

    const validation = validateBookingPricing(booking, downPayment, 2_000_000);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual({});
  });

  it('booking above the down payment is rejected', () => {
    const downPayment = 600_000;
    const bookingAbove = 700_000;

    const validation = validateBookingPricing(bookingAbove, downPayment, 2_000_000);
    expect(validation.valid).toBe(false);
    expect(validation.errors.bookingAmount).toBe('Booking amount cannot exceed the down payment amount');

    // Remaining down payment would be negative
    const remaining = calculateRemainingDownPayment(downPayment, bookingAbove);
    expect(remaining).toBe(-100_000);
  });

  it('booking 0 is rejected', () => {
    const downPayment = 600_000;
    const bookingZero = 0;

    const validation = validateBookingPricing(bookingZero, downPayment, 2_000_000);
    expect(validation.valid).toBe(false);
    expect(validation.errors.bookingAmount).toBe('Booking amount is required and must be greater than 0');

    // Negative booking is also rejected
    const validationNegative = validateBookingPricing(-50_000, downPayment, 2_000_000);
    expect(validationNegative.valid).toBe(false);
    expect(validationNegative.errors.bookingAmount).toBe('Booking amount is required and must be greater than 0');
  });

  it('the earlier all-in-one scenario (10 marla at 200,000 per marla, 30 percent down payment, possession 200,000, semi-annual 50,000 x 6, 36 monthly) produces 1 customer, 1 booking, 1 sale, 42 + possession + down-payment documents, plot sold, sums equal 2,000,000', async () => {
    // 1. Math verification
    const ratePerMarla = 200_000;
    const plotMarlas = 10;
    const totalPrice = calculateTotalPriceFromRate(ratePerMarla, plotMarlas, 'marla');
    expect(totalPrice).toBe(2_000_000);

    const downPaymentPercent = 30;
    const downPaymentAmount = calculateDownPaymentAmount(totalPrice, downPaymentPercent);
    expect(downPaymentAmount).toBe(600_000);

    const bookingAmount = 100_000;
    const remainingDownPayment = calculateRemainingDownPayment(downPaymentAmount, bookingAmount);
    expect(remainingDownPayment).toBe(500_000);

    const onPossessionAmount = 200_000;
    const semiAnnualAmount = 50_000;
    const semiAnnualTotal = semiAnnualAmount * 6; // 300,000
    expect(semiAnnualTotal).toBe(300_000);

    // Remaining for 36 monthly installments:
    // 2,000,000 - 600,000 (total DP) - 200,000 (possession) - 300,000 (semi-annual) = 900,000
    const remainingForMonthly = totalPrice - downPaymentAmount - onPossessionAmount - semiAnnualTotal;
    expect(remainingForMonthly).toBe(900_000);
    const monthlyInstallment = Math.round(remainingForMonthly / 36);
    expect(monthlyInstallment).toBe(25_000);

    const rows = [
      {
        id: 'row-1',
        months: 36,
        intervalMonths: 1,
        monthlyAmount: monthlyInstallment,
        totalAmount: remainingForMonthly,
        planAuto: false,
      },
    ];

    const planMath = calculateSalePlan({
      totalPrice,
      discount: 0,
      bookingPaid: bookingAmount,
      downPaymentAmount,
      onPossessionEnabled: true,
      onPossessionAmount,
      semiAnnualEnabled: true,
      semiAnnualAmount,
      rows,
    });

    expect(planMath.finalPrice).toBe(2_000_000);
    expect(planMath.grandTotal).toBe(900_000);
    expect(downPaymentAmount + onPossessionAmount + semiAnnualTotal + planMath.grandTotal).toBe(2_000_000);
    expect(planMath.isExact).toBe(true);
    expect(planMath.planValid).toBe(true);
    expect(planMath.remainingForInstallments).toBe(1_200_000);

    // 2. Schedule verification (Pure domain module)
    const planInput: PlanInput = {
      saleId: 'sale-test-id',
      customerId: 'cust-test-id',
      plotId: 'plot-test-id',
      saleDate: new Date('2026-01-01'),
      totalPrice,
      discount: 0,
      bookingPaid: bookingAmount,
      downPaymentAmount,
      rows,
      semiAnnualEnabled: true,
      semiAnnualAmount,
      onPossessionEnabled: true,
      onPossessionAmount,
      includeRemainingDownPayment: true,
    };

    const counts = expectedCounts(planInput);
    expect(counts.monthlyCount).toBe(36);
    expect(counts.semiAnnualCount).toBe(6);
    expect(counts.monthlyCount + counts.semiAnnualCount).toBe(42); // 42 regular & semi-annual installments
    expect(counts.possessionCount).toBe(1);
    expect(counts.downPaymentCount).toBe(1);
    expect(counts.totalCount).toBe(44);

    const schedule = computeSchedule(planInput);
    const validation = validateSchedule(planInput, schedule);
    expect(validation.valid).toBe(true);

    // Count documents
    const downPaymentDocs = schedule.filter(d => d.type === 'down_payment');
    const monthlyDocs = schedule.filter(d => d.type === 'monthly');
    const semiAnnualDocs = schedule.filter(d => d.type === 'semi_annual');
    const possessionDocs = schedule.filter(d => d.type === 'on_possession');

    expect(downPaymentDocs.length).toBe(1);
    expect(monthlyDocs.length).toBe(36);
    expect(semiAnnualDocs.length).toBe(6);
    expect(possessionDocs.length).toBe(1);

    // 42 installments + possession + down-payment = 44 documents
    expect(monthlyDocs.length + semiAnnualDocs.length).toBe(42);
    expect(schedule.length).toBe(44);

    // Verify document amounts
    expect(downPaymentDocs[0].amountDue).toBe(500_000); // Remaining DP after 100k booking
    expect(possessionDocs[0].amountDue).toBe(200_000);
    monthlyDocs.forEach(d => expect(d.amountDue).toBe(25_000));
    semiAnnualDocs.forEach(d => expect(d.amountDue).toBe(50_000));

    // Sum of all schedule documents + booking amount equals exactly 2,000,000
    const scheduleSum = schedule.reduce((sum, d) => sum + d.amountDue, 0);
    expect(scheduleSum).toBe(1_900_000);
    expect(scheduleSum + bookingAmount).toBe(2_000_000);

    // 3. Service Level Verification: Save Sale produces 1 customer, 1 booking, 1 sale, 44 docs, plot sold
    const saleInput: SaveSaleInput = {
      customer: {
        newCustomer: {
          name: 'Ahmad Khan',
          fatherName: 'Tariq Khan',
          cnic: '35201-1234567-1',
          phone: '03001234567',
          address: 'Lahore, Pakistan',
          city: 'Lahore',
          phone2: '',
          email: '',
          whatsapp: '',
          profession: '',
          monthlyIncome: '',
          emergencyContact: '',
          emergencyPhone: '',
          notes: '',
        },
      },
      plotId: 'plot-123',
      booking: {
        bookingAmount: 100_000,
        bookingDate: new Date('2026-01-01'),
        paymentMethod: 'Cash',
        notes: 'Advance booking received',
      },
      saleDate: new Date('2026-01-01'),
      totalPrice: 2_000_000,
      perMarlaRate: 200_000,
      downPaymentPercent: 30,
      downPaymentAmount: 600_000,
      includeRemainingDownPayment: true,
      onPossessionEnabled: true,
      onPossessionAmount: 200_000,
      semiAnnualEnabled: true,
      semiAnnualAmount: 50_000,
      rows,
    };

    const result = await saveSale(saleInput);

    expect(result.saleId).toBeDefined();
    expect(result.bookingId).toBeDefined();
    expect(result.customerId).toBeDefined();

    // Analyze recorded Firestore operations
    const customerDocs = dbOperations.sets.filter(op => op.path.startsWith('customers/'));
    const bookingDocs = dbOperations.sets.filter(op => op.path.startsWith('bookings/'));
    const saleDocs = dbOperations.sets.filter(op => op.path.startsWith('sales/'));
    const installmentDocs = dbOperations.sets.filter(op => op.path.startsWith('installments/'));
    const plotUpdates = dbOperations.updates.filter(op => op.path.includes('plots/'));

    expect(customerDocs.length).toBe(1);
    expect(bookingDocs.length).toBe(1);
    expect(saleDocs.length).toBe(1);
    expect(plotUpdates.length).toBe(1);
    expect(plotUpdates[0].data.status).toBe('sold');

    // 42 installments + possession + down-payment = 44 documents
    expect(installmentDocs.length).toBe(44);

    const savedDownPayment = installmentDocs.filter(d => d.data.type === 'down_payment');
    const savedMonthly = installmentDocs.filter(d => d.data.type === 'monthly');
    const savedSemi = installmentDocs.filter(d => d.data.type === 'semi_annual');
    const savedPossession = installmentDocs.filter(d => d.data.type === 'on_possession');

    expect(savedDownPayment.length).toBe(1);
    expect(savedMonthly.length).toBe(36);
    expect(savedSemi.length).toBe(6);
    expect(savedPossession.length).toBe(1);
    expect(savedMonthly.length + savedSemi.length).toBe(42);

    // Verify sums
    const bookingDocAmount = bookingDocs[0].data.bookingAmount;
    const totalInstallmentsAmount = installmentDocs.reduce((s, i) => s + (i.data.amountDue || 0), 0);

    expect(bookingDocAmount).toBe(100_000);
    expect(totalInstallmentsAmount).toBe(1_900_000);
    expect(bookingDocAmount + totalInstallmentsAmount).toBe(2_000_000);
  });
});
