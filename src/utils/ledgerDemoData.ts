import { addMonths, addDays, subDays } from 'date-fns';
import type { Customer, Sale, Plot, Installment, DownPaymentTransaction, CompanySettings } from '../types';

export function getDemoCustomerLedgerData() {
  const now = new Date();
  const saleDate = new Date('2024-01-15');

  const customer: Customer = {
    id: 'demo-cust-1',
    customerId: 'CUST-2024-089',
    name: 'Muhammad Faisal',
    fatherName: 'Abdul Rehman',
    cnic: '35202-1234567-1',
    phone: '0300-1234567',
    phone2: '0321-7654321',
    email: 'faisal@example.com',
    whatsapp: '0300-1234567',
    address: 'House 14, Street 8, Sector B',
    city: 'Lahore',
    profession: 'Business',
    monthlyIncome: 250000,
    emergencyContact: 'Brother',
    emergencyPhone: '0321-7654321',
    nominee: {
      nomineeName: 'Zainab Faisal',
      nomineeRelation: 'Wife',
      nomineeCnic: '35202-7654321-2',
      nomineePhone: '0300-9988776',
      nomineeAddress: 'House 14, Street 8, Sector B, Lahore',
    },
    documents: {},
    notes: 'Preferred client',
    createdAt: saleDate,
  };

  const company: CompanySettings = {
    name: 'Faisal Homes (Pvt) Ltd.',
    address: 'Main Boulevard, Faisal Homes, Lahore',
    phone: '042-35889900',
    whatsapp: '0300-1234567',
    email: 'info@faisalhomes.com.pk',
    logo: '',
    website: 'www.faisalhomes.com.pk',
    tagline: 'Modern Living, Timeless Elegance',
  };

  const plot: Plot = {
    id: 'demo-plot-1',
    plotNumber: 'P-101',
    block: 'A',
    category: 'Commercial',
    size: 5,
    sizeUnit: 'Marla',
    status: 'sold',
    location: 'Main Commercial Ave',
    description: 'Corner commercial plot',
    createdAt: saleDate,
  };

  const sale: Sale = {
    id: 'demo-sale-1',
    saleNumber: 'SAL-2024-104',
    customerId: 'demo-cust-1',
    plotId: 'demo-plot-1',
    saleDate,
    totalPrice: 3600000,
    bookingAmountPaid: 300000,
    discount: 0,
    finalPrice: 3600000,
    downPayment: 600000,
    downPaymentPercent: 25,
    downPaymentAmount: 900000,
    remainingDownPayment: 0,
    downPaymentReceived: 600000,
    downPaymentStatus: 'complete',
    balanceAfterBooking: 3300000,
    remainingAmount: 2700000,
    installmentRows: [],
    semiAnnualEnabled: true,
    semiAnnualAmount: 100000,
    semiAnnualCount: 6,
    semiAnnualTotal: 600000,
    onPossessionEnabled: true,
    onPossessionAmount: 300000,
    onPossessionDate: null,
    onPossessionStatus: 'Pending',
    onPossessionPaidDate: null,
    onPossessionNotes: '',
    dealerName: 'Chaudhry Real Estate',
    dealerPhone: '0321-9876543',
    dealerCommissionPercent: 1,
    dealerCommissionAmount: 36000,
    dealerCommissionStatus: 'paid',
    status: 'active',
    possessionGiven: false,
    createdAt: saleDate,
  };

  const dpTransactions: DownPaymentTransaction[] = [
    {
      id: 'demo-dp-1',
      saleId: 'demo-sale-1',
      customerId: 'demo-cust-1',
      plotId: 'demo-plot-1',
      amount: 600000,
      paymentDate: new Date('2024-02-01'),
      paymentMethod: 'Bank Transfer',
      bankName: 'Meezan Bank Ltd',
      chequeNumber: 'CHQ-449102',
      receiptNumber: 'REC-DP-2024-089',
      notes: 'Cleared down payment advance via bank transfer',
      createdAt: new Date('2024-02-01'),
    },
  ];

  // 36 Monthly Installments (50,000 each = 1,800,000)
  // + 6 Semi-Annual Installments (100,000 each = 600,000)
  // + 1 Possession Installment (300,000)
  // Total = 1,800,000 + 600,000 + 300,000 = 2,700,000 + 900,000 DP/Booking = 3,600,000
  const installments: Installment[] = [];

  let semiCounter = 0;
  for (let m = 1; m <= 36; m++) {
    const dueDate = addMonths(saleDate, m);
    const isDueSoon = Math.abs(dueDate.getTime() - now.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    
    // First 6 monthly installments are paid
    let status: Installment['status'] = 'pending';
    let amountPaid = 0;
    let paymentDate: Date | null = null;
    let receiptNumber = '';

    if (m <= 6) {
      status = 'paid';
      amountPaid = 50000;
      paymentDate = dueDate;
      receiptNumber = `REC-2024-${String(m).padStart(3, '0')}`;
    } else if (m <= 8) {
      status = 'overdue';
      amountPaid = 0;
    } else if (isDueSoon) {
      status = 'pending';
      amountPaid = 0;
    }

    installments.push({
      id: `demo-inst-m-${m}`,
      receiptNumber,
      saleId: 'demo-sale-1',
      customerId: 'demo-cust-1',
      plotId: 'demo-plot-1',
      installmentNumber: m,
      totalInstallments: 36,
      type: 'monthly',
      dueDate,
      amountDue: 50000,
      amountPaid,
      paymentDate,
      paymentMethod: status === 'paid' ? 'Cash' : '',
      bankName: '',
      chequeNumber: '',
      status,
      notes: '',
      createdAt: saleDate,
    });

    // Every 6 months, add a semi-annual installment
    if (m % 6 === 0) {
      semiCounter++;
      const isSemiPaid = semiCounter <= 1;
      installments.push({
        id: `demo-inst-sa-${semiCounter}`,
        receiptNumber: isSemiPaid ? `REC-SA-2024-001` : '',
        saleId: 'demo-sale-1',
        customerId: 'demo-cust-1',
        plotId: 'demo-plot-1',
        installmentNumber: semiCounter,
        totalInstallments: 6,
        type: 'semi_annual',
        dueDate,
        amountDue: 100000,
        amountPaid: isSemiPaid ? 100000 : 0,
        paymentDate: isSemiPaid ? dueDate : null,
        paymentMethod: isSemiPaid ? 'Bank Transfer' : '',
        bankName: isSemiPaid ? 'Habib Bank Ltd' : '',
        chequeNumber: isSemiPaid ? 'CHQ-10928' : '',
        status: isSemiPaid ? 'paid' : (dueDate < now ? 'overdue' : 'pending'),
        notes: `Semi-Annual Milestone ${semiCounter}`,
        createdAt: saleDate,
      });
    }
  }

  // Possession Installment
  installments.push({
    id: 'demo-inst-poss',
    receiptNumber: '',
    saleId: 'demo-sale-1',
    customerId: 'demo-cust-1',
    plotId: 'demo-plot-1',
    installmentNumber: 1,
    totalInstallments: 1,
    type: 'on_possession',
    dueDate: addMonths(saleDate, 36),
    amountDue: 300000,
    amountPaid: 0,
    paymentDate: null,
    paymentMethod: '',
    bankName: '',
    chequeNumber: '',
    status: 'pending',
    notes: 'Possession handover installment',
    createdAt: saleDate,
  });

  return {
    customer,
    company,
    sale,
    plot,
    dpTransactions,
    installments,
  };
}
