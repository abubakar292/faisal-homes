import React, { useState, useMemo } from 'react';
import {
  generateBookingReceipt,
  generatePaymentReceipt,
  generatePlotAgreement,
  generateScheduleHTML,
  generateDownPaymentReceiptHTML,
  generatePossessionReceiptHTML,
  printContent
} from '../../utils/printUtils';
import { generateCustomerLedgerHTML } from '../../utils/ledgerPrint';
import { buildLetterheadDocument } from '../../utils/letterhead';
import type { Booking, Customer, Plot, CompanySettings, Sale, Installment, DownPaymentTransaction } from '../../types';
import type { CustomerStatement } from '../../utils/ledgerStatement';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCompany = {
  name: 'SK Real Estate & Builders (Pvt) Ltd',
  address: 'Main Boulevard, Faisal Homes, Faisalabad',
  phone: '0300-1234567',
  whatsapp: '0300-1234567',
  email: 'info@faisalhomes.com',
  website: 'www.faisalhomes.com',
  logo: '',
  tagline: 'Modern Living Redefined',
  termsAndConditions: `1. The buyer agrees to pay all installments strictly according to the agreed schedule.
2. Possession will be handed over only after full clearance of all dues, down payments, and surcharges.
3. In case of payment default exceeding 60 days, the company reserves the right to cancel the booking.
4. All transfer fees and government taxes will be borne exclusively by the buyer.
5. This contract is subject to the jurisdiction and laws of Pakistan.`
} as unknown as CompanySettings;

const mockCustomer = {
  id: 'cust-101',
  customerId: 'CUST-00101',
  name: 'Muhammad Tariq',
  fatherName: 'Abdul Rehman',
  cnic: '33100-1234567-1',
  phone: '0300-9876543',
  phone2: '0321-7654321',
  email: 'tariq@example.com',
  address: 'House # 42, Street 3, Eden Valley, Faisalabad',
  createdAt: new Date('2026-01-15'),
  nominee: {
    nomineeName: 'Bilal Tariq',
    nomineeRelation: 'Son',
    nomineeCnic: '33100-7654321-3',
    nomineePhone: '0301-1122334',
    nomineeAddress: 'House # 42, Street 3, Eden Valley, Faisalabad'
  }
} as unknown as Customer;

const mockPlot = {
  id: 'plot-204',
  plotNumber: '204',
  block: 'B',
  size: 5,
  sizeUnit: 'Marla',
  category: 'Residential',
  status: 'booked',
  location: 'Faisal Homes, Faisalabad',
  description: 'Near Central Park',
  createdAt: new Date('2026-01-01')
} as unknown as Plot;

const mockBooking = {
  id: 'bk-501',
  receiptNumber: 'FH-BK-501',
  customerId: 'cust-101',
  plotId: 'plot-204',
  bookingDate: new Date('2026-02-01'),
  totalPrice: 3500000,
  bookingAmount: 350000,
  paymentMethod: 'Bank Transfer',
  bankName: 'Meezan Bank',
  status: 'confirmed',
  createdAt: new Date('2026-02-01')
} as unknown as Booking;

const mockSale = {
  id: 'sale-901',
  saleNumber: 'SL-00901',
  customerId: 'cust-101',
  plotId: 'plot-204',
  saleDate: new Date('2026-02-10'),
  totalPrice: 3500000,
  downPaymentPercent: 20,
  downPaymentAmount: 700000,
  bookingAmountPaid: 350000,
  remainingDownPayment: 350000,
  downPaymentReceived: 350000,
  downPaymentStatus: 'partial',
  remainingAmount: 2800000,
  status: 'active',
  onPossessionEnabled: true,
  onPossessionAmount: 350000,
  createdAt: new Date('2026-02-10')
} as unknown as Sale;

const mock36Installments: Installment[] = Array.from({ length: 36 }, (_, idx) => {
  const num = idx + 1;
  const isPaid = num <= 4;
  const isOverdue = num === 5;
  const isSemi = num % 6 === 0;
  return {
    id: `inst-${num}`,
    saleId: 'sale-901',
    customerId: 'cust-101',
    plotId: 'plot-204',
    installmentNumber: num,
    totalInstallments: 36,
    dueDate: new Date(2026, 1 + num, 15),
    amountDue: isSemi ? 120000 : 65000,
    amountPaid: isPaid ? (isSemi ? 120000 : 65000) : 0,
    status: isPaid ? 'paid' : (isOverdue ? 'overdue' : 'pending'),
    type: isSemi ? 'semi_annual' : 'regular',
    paymentDate: isPaid ? new Date(2026, 1 + num, 10) : undefined,
    paymentMethod: isPaid ? 'Cash' : undefined,
    receiptNumber: isPaid ? `FH-REC-10${num}` : undefined,
    createdAt: new Date('2026-02-10')
  } as unknown as Installment;
});

const mockPaymentInstallment = {
  id: 'inst-3',
  saleId: 'sale-901',
  customerId: 'cust-101',
  plotId: 'plot-204',
  installmentNumber: 3,
  totalInstallments: 36,
  dueDate: new Date('2026-04-15'),
  amountDue: 65000,
  amountPaid: 65000,
  status: 'paid',
  type: 'regular',
  paymentDate: new Date('2026-04-12'),
  paymentMethod: 'Bank Transfer',
  bankName: 'HBL',
  receiptNumber: 'FH-REC-1003',
  createdAt: new Date('2026-02-10')
} as unknown as Installment;

const mockPossessionInstallment = {
  id: 'inst-poss',
  saleId: 'sale-901',
  customerId: 'cust-101',
  plotId: 'plot-204',
  installmentNumber: 37,
  totalInstallments: 36,
  dueDate: new Date('2029-02-15'),
  amountDue: 350000,
  amountPaid: 350000,
  status: 'paid',
  type: 'on_possession',
  paymentDate: new Date('2029-02-10'),
  paymentMethod: 'Bank Transfer',
  bankName: 'Meezan Bank',
  receiptNumber: 'FH-POSS-901',
  createdAt: new Date('2026-02-10')
} as unknown as Installment;

const mockDownPaymentTx = {
  id: 'dp-tx-1',
  saleId: 'sale-901',
  customerId: 'cust-101',
  plotId: 'plot-204',
  receiptNumber: 'FH-DP-901',
  amount: 350000,
  paymentDate: new Date('2026-02-20'),
  paymentMethod: 'Cheque',
  bankName: 'Bank Alfalah',
  chequeNumber: 'CHQ-882711',
  createdAt: new Date('2026-02-20')
} as unknown as DownPaymentTransaction;

const mockLedgerStatement = {
  summary: {
    totalPrice: 3500000,
    discount: 0,
    finalPrice: 3500000,
    totalReceived: 830000,
    remainingBalance: 2670000,
    percentPaid: 23.7,
    nextDue: { label: 'Inst #5', date: new Date('2026-06-15'), amount: 65000 },
    maxDaysOverdue: 0
  },
  kpis: {
    overdueAmount: 65000,
    overdueCount: 1,
    pendingAmount: 2605000,
    pendingCount: 31
  },
  rows: mock36Installments.slice(0, 12).map((i) => ({
    id: i.id,
    label: `Inst #${i.installmentNumber}`,
    plotLabel: 'Plot 204 (B)',
    dueDate: i.dueDate,
    amountDue: i.amountDue,
    amountPaid: i.amountPaid || 0,
    outstanding: i.amountDue - (i.amountPaid || 0),
    status: i.status === 'paid' ? 'paid' : (i.status === 'overdue' ? 'overdue' : 'pending'),
    saleId: 'sale-901',
    type: 'installment',
    plotId: 'plot-204'
  })),
  statement: [
    {
      id: 'tx-1',
      date: new Date('2026-02-01'),
      description: 'Initial Booking Payment',
      reference: 'FH-BK-501',
      method: 'Bank Transfer',
      debit: 0,
      credit: 350000,
      balance: 3150000
    },
    {
      id: 'tx-2',
      date: new Date('2026-02-20'),
      description: 'Down Payment (Cheque # CHQ-882711)',
      reference: 'FH-DP-901',
      method: 'Cheque',
      debit: 0,
      credit: 350000,
      balance: 2800000
    },
    {
      id: 'tx-3',
      date: new Date('2026-03-12'),
      description: 'Installment #1 Payment',
      reference: 'FH-REC-1001',
      method: 'Cash',
      debit: 0,
      credit: 65000,
      balance: 2735000
    },
    {
      id: 'tx-4',
      date: new Date('2026-04-12'),
      description: 'Installment #2 Payment',
      reference: 'FH-REC-1002',
      method: 'Cash',
      debit: 0,
      credit: 65000,
      balance: 2670000
    }
  ]
} as unknown as CustomerStatement;

// ─── Component ────────────────────────────────────────────────────────────────

type DocType =
  | 'plot_agreement'
  | 'booking_form'
  | 'installment_plan'
  | 'payment_receipt'
  | 'down_payment_receipt'
  | 'possession_receipt'
  | 'customer_ledger'
  | 'terms_and_conditions'
  | 'single_line_short';

export const DevLetterhead: React.FC = () => {
  const [selectedDoc, setSelectedDoc] = useState<DocType>('plot_agreement');

  const generatedDocs = useMemo(() => {
    return {
      plot_agreement: {
        title: 'Plot Sale Agreement',
        html: generatePlotAgreement(mockSale, mockCustomer, mockPlot, mockCompany)
      },
      booking_form: {
        title: 'Booking Form',
        html: generateBookingReceipt(mockBooking, mockCustomer, mockPlot, mockCompany)
      },
      installment_plan: {
        title: 'Installment Plan',
        html: generateScheduleHTML(mockSale, mockCustomer, mockPlot, mock36Installments, mockCompany)
      },
      payment_receipt: {
        title: 'Payment Receipt',
        html: generatePaymentReceipt(mockPaymentInstallment, mockCustomer, mockPlot, mockCompany, 2670000, 830000)
      },
      down_payment_receipt: {
        title: 'Down Payment Receipt',
        html: generateDownPaymentReceiptHTML(mockDownPaymentTx, mockCustomer, mockPlot, mockSale, mockCompany)
      },
      possession_receipt: {
        title: 'On-Possession Receipt',
        html: generatePossessionReceiptHTML(mockPossessionInstallment, mockCustomer, mockPlot, mockCompany, 0, 3500000)
      },
      customer_ledger: {
        title: 'Customer Ledger Statement',
        html: generateCustomerLedgerHTML(mockCompany, mockLedgerStatement, mockCustomer, 'All Plots')
      },
      terms_and_conditions: {
        title: 'Policies, Terms & Conditions',
        html: buildLetterheadDocument({
          sections: [
            {
              title: 'Policies, Terms & Conditions',
              bodyHtml: `
                <div style="font-size:10.5pt;line-height:1.8;color:#334155;padding:10px 0;white-space:pre-wrap;">
                  ${mockCompany.termsAndConditions}
                </div>
              `
            }
          ]
        })
      },
      single_line_short: {
        title: 'Policies, Terms & Conditions',
        html: buildLetterheadDocument({
          sections: [
            {
              title: 'Policies, Terms & Conditions',
              bodyHtml: '<p style="padding:10px 0;">This is a single-line test document to verify footer positioning on minimal content.</p>'
            }
          ]
        })
      }
    };
  }, []);

  // Expose fixtures to window for automated testing
  if (typeof window !== 'undefined') {
    (window as any).__LETTERHEAD_FIXTURES__ = generatedDocs;
  }

  const current = generatedDocs[selectedDoc];

  const handlePrint = () => {
    printContent(current.html, current.title);
  };

  const navButtons: { key: DocType; label: string }[] = [
    { key: 'plot_agreement', label: '1. Plot Agreement' },
    { key: 'booking_form', label: '2. Booking Form' },
    { key: 'installment_plan', label: '3. Installment Plan (36-Inst)' },
    { key: 'payment_receipt', label: '4. Payment Receipt' },
    { key: 'down_payment_receipt', label: '5. Down Payment Receipt' },
    { key: 'possession_receipt', label: '6. On-Possession Receipt' },
    { key: 'customer_ledger', label: '7. Customer Ledger' },
    { key: 'terms_and_conditions', label: '8. Terms & Conditions' },
    { key: 'single_line_short', label: '9. Single-Line Minimal' }
  ];

  return (
    <div style={{ padding: '20px', background: '#f1f5f9', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a3c6e', margin: 0 }}>
              Letterhead Document Preview (Dev Tool)
            </h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
              Common A4 letterhead layout: grey angled header, centered notch title, middle content, fixed footer with signatures and SK logo.
            </p>
          </div>
          <button
            onClick={handlePrint}
            id="print-btn"
            style={{
              background: '#1a3c6e',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            Print This Document
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {navButtons.map((btn) => (
            <button
              key={btn.key}
              id={`tab-${btn.key}`}
              onClick={() => setSelectedDoc(btn.key)}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: selectedDoc === btn.key ? '2px solid #1a3c6e' : '1px solid #cbd5e1',
                background: selectedDoc === btn.key ? '#1a3c6e' : '#fff',
                color: selectedDoc === btn.key ? '#fff' : '#334155',
                fontWeight: selectedDoc === btn.key ? 'bold' : 'normal',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Document Preview Frame */}
        <div
          style={{
            background: '#e2e8f0',
            padding: '24px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'auto'
          }}
        >
          <div
            style={{
              width: '210mm',
              minHeight: '297mm',
              background: '#fff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}
          >
            <iframe
              id="letterhead-preview-frame"
              title="Letterhead Preview"
              srcDoc={current.html}
              style={{
                width: '210mm',
                height: '1123px', // ~297mm in standard 96dpi pixels
                border: 'none',
                display: 'block'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevLetterhead;
