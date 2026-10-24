import { describe, it, expect } from 'vitest';
import { 
  getScheduleRowStatus, 
  formatSemiAnnualLabel, 
  consolidateCustomerPaymentReceipts, 
  buildVirtualScheduleList, 
  buildChartTimeline,
  type PaymentReceiptItem 
} from '../src/utils/ledgerUIHelpers';
import { buildCustomerStatement, type LedgerRow } from '../src/utils/ledgerStatement';
import type { Customer, Sale, Plot, Installment, DownPaymentTransaction } from '../src/types';
import { addDays, subDays } from 'date-fns';

describe('P1-5: Customer Ledger UI Helpers & Metrics Verification', () => {
  const baseCustomer: Customer = {
    id: 'cust-1',
    customerId: 'CUST-001',
    name: 'Muhammad Faisal',
    fatherName: 'Abdul Rehman',
    cnic: '35202-1234567-1',
    phone: '0300-1234567',
    phone2: '0321-7654321',
    email: 'faisal@example.com',
    whatsapp: '0300-1234567',
    address: 'Street 4, Sector B',
    city: 'Lahore',
    profession: 'Business',
    monthlyIncome: 200000,
    emergencyContact: 'Brother',
    emergencyPhone: '0321-7654321',
    nominee: {
      nomineeName: 'Zainab Faisal',
      nomineeRelation: 'Wife',
      nomineeCnic: '35202-7654321-2',
      nomineePhone: '0300-9988776',
      nomineeAddress: 'Street 4, Sector B, Lahore',
    },
    documents: {},
    notes: '',
    createdAt: new Date('2024-01-01'),
  };

  const basePlot: Plot = {
    id: 'plot-1',
    plotNumber: 'P-101',
    block: 'A',
    category: 'Commercial',
    size: 5,
    sizeUnit: 'Marla',
    status: 'sold',
    location: 'Main Blvd',
    description: 'Corner commercial plot',
    createdAt: new Date('2024-01-01'),
  };

  const baseSale: Sale = {
    id: 'sale-1',
    saleNumber: 'SAL-2024-01',
    customerId: 'cust-1',
    plotId: 'plot-1',
    saleDate: new Date('2024-01-01'),
    totalPrice: 3000000,
    bookingAmountPaid: 200000,
    discount: 0,
    finalPrice: 3000000,
    downPayment: 400000,
    downPaymentPercent: 20,
    downPaymentAmount: 600000,
    remainingDownPayment: 0,
    downPaymentReceived: 400000,
    downPaymentStatus: 'complete',
    balanceAfterBooking: 2800000,
    remainingAmount: 2400000,
    installmentRows: [],
    semiAnnualEnabled: true,
    semiAnnualAmount: 100000,
    semiAnnualCount: 2,
    semiAnnualTotal: 200000,
    onPossessionEnabled: true,
    onPossessionAmount: 200000,
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
    createdAt: new Date('2024-01-01'),
  };

  const sampleDpTransaction: DownPaymentTransaction = {
    id: 'dp-tx-1',
    saleId: 'sale-1',
    customerId: 'cust-1',
    plotId: 'plot-1',
    amount: 400000,
    paymentDate: new Date('2024-01-10'),
    paymentMethod: 'Bank Transfer',
    bankName: 'Meezan Bank',
    chequeNumber: 'CHQ-8821',
    receiptNumber: 'REC-DP-101',
    notes: 'Remaining down payment clearance',
    createdAt: new Date('2024-01-10'),
  };

  const sampleInstallments: Installment[] = [
    {
      id: 'inst-1',
      receiptNumber: 'REC-001',
      saleId: 'sale-1',
      customerId: 'cust-1',
      plotId: 'plot-1',
      installmentNumber: 1,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: new Date('2024-02-01'),
      amountDue: 50000,
      amountPaid: 50000,
      paymentDate: new Date('2024-02-01'),
      paymentMethod: 'Cash',
      bankName: '',
      chequeNumber: '',
      status: 'paid',
      notes: '',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'inst-2',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-1',
      plotId: 'plot-1',
      installmentNumber: 2,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: new Date('2024-03-01'),
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'overdue',
      notes: '',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'inst-3',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-1',
      plotId: 'plot-1',
      installmentNumber: 1,
      totalInstallments: 2,
      type: 'semi_annual',
      dueDate: new Date('2024-06-01'),
      amountDue: 100000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: '',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'inst-4',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-1',
      plotId: 'plot-1',
      installmentNumber: 3,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: addDays(new Date(), 4), // Due in 4 days -> Due soon
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: '',
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'inst-5',
      receiptNumber: '',
      saleId: 'sale-1',
      customerId: 'cust-1',
      plotId: 'plot-1',
      installmentNumber: 4,
      totalInstallments: 6,
      type: 'monthly',
      dueDate: addDays(new Date(), 45), // In 45 days -> Upcoming
      amountDue: 50000,
      amountPaid: 0,
      paymentDate: null,
      paymentMethod: '',
      bankName: '',
      chequeNumber: '',
      status: 'pending',
      notes: '',
      createdAt: new Date('2024-01-01'),
    },
  ];

  it('correctly calculates the 4 KPI numbers matching CustomerStatement', () => {
    const st = buildCustomerStatement(
      'all',
      baseCustomer,
      [baseSale],
      [basePlot],
      [],
      [sampleDpTransaction],
      sampleInstallments
    );

    // Verify overdue KPI counts and amounts
    expect(st.kpis.overdueCount).toBeGreaterThanOrEqual(1);
    expect(st.kpis.overdueAmount).toBeGreaterThanOrEqual(50000);

    // Verify pending KPI counts and amounts
    expect(st.kpis.pendingCount).toBeGreaterThanOrEqual(1);
    expect(st.kpis.pendingAmount).toBeGreaterThan(0);

    // Verify summary totals
    expect(st.summary.finalPrice).toBe(3000000);
    // Paid so far: booking (200k) + DP tx (400k) + inst-1 (50k) = 650k
    expect(st.summary.totalReceived).toBe(650000);
    expect(st.summary.remainingBalance).toBe(3000000 - 650000);
    expect(st.summary.percentPaid).toBe(21.7);
  });

  it('classifies schedule row visual statuses: paid, overdue, due_soon, upcoming', () => {
    const now = new Date();

    const paidRow: LedgerRow = {
      id: 'r-1',
      label: 'Installment #1',
      plotLabel: 'P-101',
      type: 'monthly',
      dueDate: new Date('2024-02-01'),
      amountDue: 50000,
      amountPaid: 50000,
      outstanding: 0,
      paymentDate: new Date('2024-02-01'),
      receiptNumber: 'REC-001',
      paymentMethod: 'Cash',
      status: 'paid',
      daysOverdue: 0,
      daysUntilDue: 0,
    };
    expect(getScheduleRowStatus(paidRow, now)).toBe('paid');

    const overdueRow: LedgerRow = {
      id: 'r-2',
      label: 'Installment #2',
      plotLabel: 'P-101',
      type: 'monthly',
      dueDate: subDays(now, 10),
      amountDue: 50000,
      amountPaid: 0,
      outstanding: 50000,
      paymentDate: null,
      receiptNumber: '',
      paymentMethod: '',
      status: 'overdue',
      daysOverdue: 10,
      daysUntilDue: 0,
    };
    expect(getScheduleRowStatus(overdueRow, now)).toBe('overdue');

    const dueSoonRow: LedgerRow = {
      id: 'r-4',
      label: 'Installment #4',
      plotLabel: 'P-101',
      type: 'monthly',
      dueDate: addDays(now, 3),
      amountDue: 50000,
      amountPaid: 0,
      outstanding: 50000,
      paymentDate: null,
      receiptNumber: '',
      paymentMethod: '',
      status: 'pending',
      daysOverdue: 0,
      daysUntilDue: 3,
    };
    expect(getScheduleRowStatus(dueSoonRow, now)).toBe('due_soon');

    const upcomingRow: LedgerRow = {
      id: 'r-5',
      label: 'Installment #5',
      plotLabel: 'P-101',
      type: 'monthly',
      dueDate: addDays(now, 40),
      amountDue: 50000,
      amountPaid: 0,
      outstanding: 50000,
      paymentDate: null,
      receiptNumber: '',
      paymentMethod: '',
      status: 'pending',
      daysOverdue: 0,
      daysUntilDue: 40,
    };
    expect(getScheduleRowStatus(upcomingRow, now)).toBe('upcoming');
  });

  it('formats semi-annual label as "Semi-Annual n of m"', () => {
    expect(formatSemiAnnualLabel(1, 4)).toBe('Semi-Annual 1 of 4');
    expect(formatSemiAnnualLabel(3, 6)).toBe('Semi-Annual 3 of 6');
  });

  it('consolidates all completed payment receipts (Booking, Down Payment, Installments)', () => {
    const receipts = consolidateCustomerPaymentReceipts(
      [baseSale],
      [basePlot],
      [sampleDpTransaction],
      sampleInstallments,
      'all'
    );

    // Booking: 200,000, DP: 400,000, Inst 1: 50,000 => 3 receipts
    expect(receipts.length).toBe(3);
    const totalCollected = receipts.reduce((sum, r) => sum + r.amount, 0);
    expect(totalCollected).toBe(650000);

    const types = receipts.map(r => r.type);
    expect(types).toContain('Booking');
    expect(types).toContain('Down Payment');
    expect(types).toContain('Installment');

    // Sorted descending by date
    expect(receipts[0].date.getTime()).toBeGreaterThanOrEqual(receipts[1].date.getTime());
  });

  it('builds virtualized schedule list grouped by year with year headers and row counts', () => {
    const st = buildCustomerStatement(
      'all',
      baseCustomer,
      [baseSale],
      [basePlot],
      [],
      [sampleDpTransaction],
      sampleInstallments
    );

    const virtualItems = buildVirtualScheduleList(st.rows, { [sampleInstallments[2].id]: 2, default: 2 });
    expect(virtualItems.length).toBeGreaterThan(0);

    // Check that there is at least one year header
    const headers = virtualItems.filter(i => i.kind === 'year_header');
    expect(headers.length).toBeGreaterThanOrEqual(1);

    // Check that the sum of rows equals st.rows.length
    const rows = virtualItems.filter(i => i.kind === 'row');
    expect(rows.length).toBe(st.rows.length);

    // Verify semi-annual badge formatting on semi-annual row
    const semiRow = rows.find(r => r.kind === 'row' && r.isSemiAnnual);
    expect(semiRow).toBeDefined();
    if (semiRow && semiRow.kind === 'row') {
      expect(semiRow.semiAnnualBadge).toMatch(/Semi-Annual \d+ of \d+/);
    }
  });

  it('builds cumulative area chart timeline with monotonic scheduled and paid values', () => {
    const st = buildCustomerStatement(
      'all',
      baseCustomer,
      [baseSale],
      [basePlot],
      [],
      [sampleDpTransaction],
      sampleInstallments
    );

    const receipts = consolidateCustomerPaymentReceipts(
      [baseSale],
      [basePlot],
      [sampleDpTransaction],
      sampleInstallments,
      'all'
    );

    const timeline = buildChartTimeline([baseSale], st, receipts);
    expect(timeline.length).toBeGreaterThan(0);

    // Verify monotonic property: scheduled[i] >= scheduled[i-1] and paid[i] >= paid[i-1]
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].scheduled).toBeGreaterThanOrEqual(timeline[i - 1].scheduled);
      expect(timeline[i].paid).toBeGreaterThanOrEqual(timeline[i - 1].paid);
    }

    // Verify initial point contains sale start milestone
    expect(timeline[0].scheduled).toBeGreaterThan(0);
    // Verify final point reflects total paid
    const lastPoint = timeline[timeline.length - 1];
    expect(lastPoint.paid).toBe(650000);
  });
});
