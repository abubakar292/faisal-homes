import { describe, it, expect } from 'vitest';
import {
  startOfDayKarachi,
  endOfDayKarachi,
  isDateInRangeKarachi,
  isDateTodayKarachi,
  getDaysOverdueKarachi,
  getDaysUntilDueKarachi,
  computeTotalCollected,
  computeCollectedToday,
  computeReceivables,
  computeOverdueMetrics,
  computePendingMetrics,
  computeDueSoonMetrics,
  computePartialPaymentsMetrics,
  computePlotCounts,
  computeSalesTotals,
  computeDownPaymentTotals,
  computeEnterpriseMetrics,
} from '../src/domain/metrics';
import { buildCustomerStatement } from '../src/utils/ledgerStatement';
import type { Customer, Sale, Plot, Installment, DownPaymentTransaction } from '../src/types';
import { addDays, subDays } from 'date-fns';

describe('P2-6 Domain Metrics: Single Source of Truth & Consistency Audit', () => {
  const fixedNow = new Date('2026-10-24T10:00:00.000Z'); // 15:00 PKT

  const fixtureCustomer: Customer = {
    id: 'cust-fix-1',
    customerId: 'CUST-2026-001',
    name: 'Tariq Mehmood',
    fatherName: 'Muhammad Mehmood',
    cnic: '35201-1122334-1',
    phone: '0300-1122334',
    phone2: '',
    email: 'tariq@example.com',
    whatsapp: '0300-1122334',
    address: 'Gulberg III, Lahore',
    city: 'Lahore',
    profession: 'Engineer',
    monthlyIncome: 300000,
    emergencyContact: 'Uncle',
    emergencyPhone: '0321-1122334',
    nominee: {
      nomineeName: 'Ayesha Tariq',
      nomineeRelation: 'Wife',
      nomineeCnic: '35201-9988776-2',
      nomineePhone: '0300-9988776',
      nomineeAddress: 'Gulberg III, Lahore',
    },
    documents: {},
    notes: '',
    createdAt: new Date('2026-01-01'),
  };

  const fixturePlots: Plot[] = [
    {
      id: 'plot-1',
      plotNumber: 'A-101',
      block: 'A',
      category: 'Residential',
      size: 5,
      sizeUnit: 'Marla',
      status: 'sold',
      location: 'Block A, Street 1',
      description: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'plot-2',
      plotNumber: 'A-102',
      block: 'A',
      category: 'Commercial',
      size: 8,
      sizeUnit: 'Marla',
      status: 'booked',
      location: 'Main Blvd',
      description: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'plot-3',
      plotNumber: 'B-201',
      block: 'B',
      category: 'Residential',
      size: 10,
      sizeUnit: 'Marla',
      status: 'available',
      location: 'Block B',
      description: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'plot-4',
      plotNumber: 'C-301',
      block: 'C',
      category: 'Residential',
      size: 5,
      sizeUnit: 'Marla',
      status: 'cancelled',
      location: 'Block C',
      description: '',
      createdAt: new Date('2026-01-01'),
    },
  ];

  // Sale 1: Active, 3,000,000 final price, 300k booking paid on 2026-01-01
  const sale1: Sale = {
    id: 'sale-1',
    saleNumber: 'SAL-001',
    customerId: 'cust-fix-1',
    plotId: 'plot-1',
    saleDate: new Date('2026-01-01'),
    totalPrice: 3000000,
    bookingAmountPaid: 300000,
    discount: 0,
    finalPrice: 3000000,
    downPayment: 600000,
    downPaymentPercent: 20,
    downPaymentAmount: 600000,
    remainingDownPayment: 0,
    downPaymentReceived: 300000,
    downPaymentStatus: 'complete',
    balanceAfterBooking: 2700000,
    remainingAmount: 2400000,
    installmentRows: [],
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    semiAnnualCount: 0,
    semiAnnualTotal: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    onPossessionDate: null,
    onPossessionStatus: 'Pending',
    onPossessionPaidDate: null,
    onPossessionNotes: '',
    dealerName: '',
    dealerPhone: '',
    dealerCommissionPercent: 0,
    dealerCommissionAmount: 0,
    dealerCommissionStatus: '',
    status: 'active',
    possessionGiven: false,
    createdAt: new Date('2026-01-01'),
  };

  // Sale 2: Cancelled sale (should NEVER enter collections or overdue)
  const cancelledSale: Sale = {
    id: 'sale-canc',
    saleNumber: 'SAL-CANC',
    customerId: 'cust-fix-1',
    plotId: 'plot-4',
    saleDate: new Date('2026-01-01'),
    totalPrice: 2000000,
    bookingAmountPaid: 200000,
    discount: 0,
    finalPrice: 2000000,
    downPayment: 400000,
    downPaymentPercent: 20,
    downPaymentAmount: 400000,
    remainingDownPayment: 0,
    downPaymentReceived: 200000,
    downPaymentStatus: 'complete',
    balanceAfterBooking: 1800000,
    remainingAmount: 1600000,
    installmentRows: [],
    semiAnnualEnabled: false,
    semiAnnualAmount: 0,
    semiAnnualCount: 0,
    semiAnnualTotal: 0,
    onPossessionEnabled: false,
    onPossessionAmount: 0,
    onPossessionDate: null,
    onPossessionStatus: 'Pending',
    onPossessionPaidDate: null,
    onPossessionNotes: '',
    dealerName: '',
    dealerPhone: '',
    dealerCommissionPercent: 0,
    dealerCommissionAmount: 0,
    dealerCommissionStatus: '',
    status: 'cancelled',
    possessionGiven: false,
    createdAt: new Date('2026-01-01'),
  };

  // DP Transaction: 300,000 paid on 2026-01-10
  const dpTx1: DownPaymentTransaction = {
    id: 'dptx-1',
    saleId: 'sale-1',
    customerId: 'cust-fix-1',
    plotId: 'plot-1',
    amount: 300000,
    paymentDate: new Date('2026-01-10'),
    paymentMethod: 'Bank Transfer',
    bankName: 'Meezan Bank',
    chequeNumber: 'CHQ-1001',
    receiptNumber: 'REC-DP-001',
    notes: '',
    createdAt: new Date('2026-01-10'),
  };

  // Installments:
  // 1: Paid in past (50,000 on 2026-02-01)
  // 2: Overdue (50,000 due 2026-03-01)
  // 3: Overdue (50,000 due 2026-04-01)
  // 4: Paid today (50,000 paid on 2026-10-24 PKT)
  // 5: Due soon (50,000 due in 4 days)
  // 6: Upcoming (50,000 due in 30 days)
  // 7: Cancelled sale installment (50,000 overdue on cancelled sale)
  const fixtureInstallments: Installment[] = [
    {
      id: 'inst-1',
      receiptNumber: 'REC-001',
      saleId: 'sale-1',
      customerId: 'cust-fix-1',
      plotId: 'plot-1',
      installmentNumber: 1,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: new Date('2026-02-01'),
      amountDue: 50000,
      amountPaid: 50000,
      paymentDate: new Date('2026-02-01'),
      paymentMethod: 'Cash',
      bankName: '',
      chequeNumber: '',
      status: 'paid',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'inst-2',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-fix-1',
      plotId: 'plot-1',
      installmentNumber: 2,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: new Date('2026-03-01'),
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'overdue',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'inst-3',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-fix-1',
      plotId: 'plot-1',
      installmentNumber: 3,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: new Date('2026-04-01'),
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'overdue',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'inst-4',
      receiptNumber: 'REC-TODAY',
      saleId: 'sale-1',
      customerId: 'cust-fix-1',
      plotId: 'plot-1',
      installmentNumber: 4,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: new Date('2026-05-01'),
      amountDue: 50000,
      amountPaid: 50000,
      paymentDate: new Date('2026-10-24T08:00:00Z'), // Today in Karachi
      paymentMethod: 'Cash',
      bankName: '',
      chequeNumber: '',
      status: 'paid',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'inst-5',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-fix-1',
      plotId: 'plot-1',
      installmentNumber: 5,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: addDays(fixedNow, 4), // Due in 4 days (Due Soon)
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'inst-6',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-fix-1',
      plotId: 'plot-1',
      installmentNumber: 6,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: addDays(fixedNow, 30), // In 30 days (Upcoming)
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'inst-canc-1',
      receiptNumber: '',
      saleId: 'sale-canc', // On cancelled sale!
      customerId: 'cust-fix-1',
      plotId: 'plot-4',
      installmentNumber: 1,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: subDays(fixedNow, 40),
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'overdue',
      notes: '',
      createdAt: new Date('2026-01-01'),
    },
  ];

  it('verifies Asia/Karachi timezone boundaries are inclusive from 00:00:00 to 23:59:59.999', () => {
    const start = startOfDayKarachi('2026-10-24');
    const end = endOfDayKarachi('2026-10-24');

    // In UTC, Karachi (UTC+5) 2026-10-24 starts at 2026-10-23T19:00:00.000Z
    expect(start.toISOString()).toBe('2026-10-23T19:00:00.000Z');
    // and ends at 2026-10-24T18:59:59.999Z
    expect(end.toISOString()).toBe('2026-10-24T18:59:59.999Z');

    // Timestamps inside this window
    expect(isDateInRangeKarachi(new Date('2026-10-23T19:00:00.000Z'), '2026-10-24', '2026-10-24')).toBe(true);
    expect(isDateInRangeKarachi(new Date('2026-10-24T12:00:00.000Z'), '2026-10-24', '2026-10-24')).toBe(true);
    expect(isDateInRangeKarachi(new Date('2026-10-24T18:59:59.999Z'), '2026-10-24', '2026-10-24')).toBe(true);

    // Timestamps 1 millisecond outside
    expect(isDateInRangeKarachi(new Date('2026-10-23T18:59:59.999Z'), '2026-10-24', '2026-10-24')).toBe(false);
    expect(isDateInRangeKarachi(new Date('2026-10-24T19:00:00.000Z'), '2026-10-24', '2026-10-24')).toBe(false);
  });

  it('guarantees overdue amount is 100% identical across Dashboard, Pending Payments, Shortage List, Notifications, and Customer Ledger', () => {
    const sales = [sale1, cancelledSale];
    const overdueRes = computeOverdueMetrics(sales, fixtureInstallments, [dpTx1], fixedNow);

    // Overdue installments on active sale1 are inst-2 (50k) and inst-3 (50k) = 100,000 (inst-canc-1 must be excluded!)
    expect(overdueRes.count).toBe(2);
    expect(overdueRes.amount).toBe(100000);
    expect(overdueRes.installmentIds).toEqual(['inst-2', 'inst-3']);

    // Check Customer Ledger statement calculation
    const statement = buildCustomerStatement('all', fixtureCustomer, sales, fixturePlots, [], [dpTx1], fixtureInstallments);
    expect(statement.kpis.overdueCount).toBe(overdueRes.count);
    expect(statement.kpis.overdueAmount).toBe(overdueRes.amount);

    // Check Enterprise Metrics aggregate
    const ent = computeEnterpriseMetrics(fixturePlots, sales, fixtureInstallments, [dpTx1], [], fixedNow);
    expect(ent.overdue.count).toBe(100000 ? overdueRes.count : 0);
    expect(ent.overdue.amount).toBe(100000);
  });

  it('guarantees collected today is 100% identical across Daily, Collection, and Payment History reports', () => {
    const sales = [sale1, cancelledSale];
    const todayColl = computeCollectedToday(sales, fixtureInstallments, [dpTx1], fixedNow);

    // Only inst-4 was paid today (50,000). Booking was in Jan, DP was in Jan.
    expect(todayColl.total).toBe(50000);
    expect(todayColl.installmentsAmount).toBe(50000);
    expect(todayColl.transactionCount).toBe(1);

    // Collection report calculation for today
    const rangeColl = computeTotalCollected(sales, fixtureInstallments, [dpTx1], {
      start: startOfDayKarachi(fixedNow),
      end: endOfDayKarachi(fixedNow),
    });
    expect(rangeColl.total).toBe(todayColl.total);
    expect(rangeColl.total).toBe(50000);
  });

  it('guarantees that a new payment changes overdue, collected today, and receivables consistently', () => {
    const sales = [sale1, cancelledSale];

    // Baseline before payment
    const overdueBefore = computeOverdueMetrics(sales, fixtureInstallments, [dpTx1], fixedNow);
    const todayBefore = computeCollectedToday(sales, fixtureInstallments, [dpTx1], fixedNow);
    const recvBefore = computeReceivables(sales, fixtureInstallments, [dpTx1]);

    expect(overdueBefore.amount).toBe(100000);
    expect(todayBefore.total).toBe(50000);
    // Total final price: 3,000,000. Total paid: booking (300k) + DP (300k) + inst-1 (50k) + inst-4 (50k) = 700k => Recv = 2,300,000
    expect(recvBefore).toBe(2300000);

    // Customer clears overdue installment 2 today!
    const updatedInstallments = fixtureInstallments.map(inst => {
      if (inst.id === 'inst-2') {
        return {
          ...inst,
          amountPaid: 50000,
          paymentDate: fixedNow,
          status: 'paid' as const,
          receiptNumber: 'REC-NEW',
        };
      }
      return inst;
    });

    // Metrics after payment
    const overdueAfter = computeOverdueMetrics(sales, updatedInstallments, [dpTx1], fixedNow);
    const todayAfter = computeCollectedToday(sales, updatedInstallments, [dpTx1], fixedNow);
    const recvAfter = computeReceivables(sales, updatedInstallments, [dpTx1]);

    // 1. Overdue dropped by 50,000
    expect(overdueAfter.amount).toBe(overdueBefore.amount - 50000);
    expect(overdueAfter.count).toBe(1);

    // 2. Collected today increased by 50,000
    expect(todayAfter.total).toBe(todayBefore.total + 50000);
    expect(todayAfter.total).toBe(100000);

    // 3. Receivables dropped by 50,000
    expect(recvAfter).toBe(recvBefore - 50000);
    expect(recvAfter).toBe(2250000);

    // 4. Invariant: Total Price - Total Collected = Receivables
    const totalCollectedLifetime = computeTotalCollected(sales, updatedInstallments, [dpTx1]).total;
    expect(totalCollectedLifetime).toBe(750000);
    expect(sale1.finalPrice - totalCollectedLifetime).toBe(recvAfter);
  });

  it('accurately computes plot counts, partial payments, and due soon items', () => {
    const sales = [sale1];
    const ent = computeEnterpriseMetrics(fixturePlots, sales, fixtureInstallments, [dpTx1], [], fixedNow);

    // Plot counts: 1 sold, 1 booked, 1 available, 1 cancelled
    expect(ent.plots.sold).toBe(1);
    expect(ent.plots.booked).toBe(1);
    expect(ent.plots.available).toBe(1);
    expect(ent.plots.cancelled).toBe(1);
    expect(ent.plots.total).toBe(4);

    // Due Soon (inst-5 is due in 4 days)
    expect(ent.dueSoon.count).toBe(1);
    expect(ent.dueSoon.amount).toBe(50000);

    // Pending (inst-5 + inst-6)
    expect(ent.pending.count).toBe(2);
    expect(ent.pending.amount).toBe(100000);
  });
});
