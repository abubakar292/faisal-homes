import { buildLetterheadDocument, type ReceiptItem } from './letterhead';
import { printDocument } from './printDocument';
import { formatCurrency, formatDate } from './formatters';
import { sortInstallments } from './saleCalc';
import type { Booking, Customer, Plot, Sale, Installment, CompanySettings, DownPaymentTransaction } from '../types';

// ─── Legacy aliases — kept for backward compatibility ─────────────────────────
export function generateReportHTML(
  company: CompanySettings | { name: string; address?: string; phone?: string } | string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  summary?: string
): string {
  const companyName = typeof company === 'string' ? company : (company?.name || '');
  return buildLetterheadDocument({
    layout: 'report',
    report: {
      title,
      headers,
      rows,
      summary,
      companyName,
      subtitle: summary
    }
  });
}

// ─── Helpers (local, not exported) ───────────────────────────────────────────

function fmtAmt(amount: number | undefined | null): string {
  if (amount === null || amount === undefined) return '0';
  return amount.toLocaleString('en-PK');
}

function fmtDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date as Date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Master CSS (injected into every print window) ───────────────────────────

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: Arial, sans-serif; 
    font-size: 11px; 
    color: #1a1a1a; 
    background: white;
    padding: 10px;
  }
  @page { margin: 8mm; size: A4 portrait; }
thead { display: table-header-group; } tr { page-break-inside: avoid; } .page-break { page-break-after: always; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
    * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
  }
  
  /* Company header */
  .company-header {
    background: #1a3c6e;
    color: white;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0;
  }
  .company-name { font-size: 16px; font-weight: bold; }
  .company-sub { font-size: 9px; opacity: 0.85; margin-top: 2px; }
  .company-right { text-align: right; font-size: 9px; opacity: 0.85; }
  
  /* Gold title band */
  .doc-title-band {
    background: #e8a020;
    color: white;
    text-align: center;
    padding: 6px;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1px;
    margin-bottom: 10px;
  }
  .doc-subtitle { font-size: 10px; font-weight: normal; opacity: 0.9; }
  
  /* Info sections */
  .info-section {
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin-bottom: 8px;
    overflow: hidden;
  }
  .info-section-title {
    background: #f0f4f8;
    border-bottom: 2px solid #1a3c6e;
    padding: 4px 10px;
    font-weight: bold;
    font-size: 10px;
    color: #1a3c6e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .info-row { padding: 4px 10px; border-bottom: 1px solid #f0f0f0; font-size: 10px; }
  .info-label { color: #666; font-size: 9px; display: block; }
  .info-value { font-weight: 600; }
  
  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #1a3c6e; color: white; padding: 5px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  td { padding: 4px 8px; font-size: 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  
  .status-paid { color: #16a34a; font-weight: bold; }
  .status-overdue { color: #dc2626; font-weight: bold; }
  .status-pending { color: #d97706; }
  .status-semi { color: #7c3aed; font-weight: bold; }
  .status-downpayment { color: #0369a1; font-weight: bold; }
  .amount-col { text-align: right; font-weight: 600; }
  .total-row td { background: #1a3c6e !important; color: white; font-weight: bold; }
  .subtotal-row td { background: #e8a020 !important; color: white; font-weight: bold; }
  
  /* Receipt copies */
  .receipt-copy { border: 1px solid #ccc; margin-bottom: 3px; overflow: hidden; }
  .copy-header { padding: 6px 10px; color: white; display: flex; justify-content: space-between; align-items: center; font-size: 10px; }
  .copy-label { font-weight: bold; font-size: 11px; }
  .copy-body { padding: 8px 10px; }
  .copy-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; }
  .remaining-highlight { background: #e8a020; color: white; padding: 4px 8px; margin: 4px 0; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; border-radius: 3px; }
  .cut-line { text-align: center; font-size: 9px; color: #aaa; letter-spacing: 4px; margin: 3px 0; }
  
  /* Signature area */
  .signature-area { display: grid; grid-template-columns: 1fr 80px 1fr; gap: 10px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; }
  .sig-line { border-top: 1px solid #000; margin-top: 20px; padding-top: 3px; }
  .stamp-box { border: 1px solid #ccc; height: 60px; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 8px; }
  
  /* Schedule */
  .two-col-table { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  
  /* Report */
  .report-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
  .summary-card { border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px; text-align: center; }
  .summary-card-title { font-size: 9px; color: #666; }
  .summary-card-value { font-size: 14px; font-weight: bold; color: #1a3c6e; }
  
  /* Print button */
  .print-btn { background: #1a3c6e; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-bottom: 10px; }
`;

// ─── CORE: Universal print function ──────────────────────────────────────────

export function printInNewWindow(htmlContent: string, title: string = 'Print'): void {
  if (!htmlContent.includes('lh-doc')) {
    if (import.meta.env?.DEV) {
      console.error('[printUtils] Missing lh-doc marker. Auto-wrapping content in layout report for: ' + title);
    }
    const wrapped = buildLetterheadDocument({
      layout: 'report',
      report: {
        title,
        rawHtml: htmlContent
      }
    });
    void printDocument(wrapped);
    return;
  }
  void printDocument(htmlContent);
}

// Legacy alias - keep old callers working
export const printContent = printInNewWindow;

function companyHeader(company: { name: string; address: string; phone: string }, rightText: string = '') {
  return `
    <div class="company-header">
      <div>
        <div class="company-name">${company.name}</div>
        <div class="company-sub">${company.address} | ${company.phone}</div>
      </div>
      <div class="company-right">${rightText || `Print Date: ${fmtDate(new Date())}<br>${fmtTime(new Date())}`}</div>
    </div>
  `;
}

// ─── BOOKING RECEIPT ─────────────────────────────────────────────────────────

export function generateBookingReceipt(booking: Booking, customer: Customer, plot: Plot, company: CompanySettings): string {
  const content = `
    <div style="margin-bottom:12px;text-align:right;font-size:9.5pt;color:#64748b;">
      Booking #: <strong>${booking.receiptNumber}</strong> | Date: <strong>${fmtDate(booking.bookingDate)}</strong>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Customer Information</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:75px;">Name:</td><td style="font-weight:bold;padding:3px 8px;">${customer.name}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Father:</td><td style="padding:3px 8px;">${customer.fatherName || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">CNIC:</td><td style="padding:3px 8px;">${customer.cnic}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Phone:</td><td style="padding:3px 8px;">${customer.phone}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;vertical-align:top;">Address:</td><td style="padding:3px 8px;">${customer.address}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Booking Details</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:75px;">Project:</td><td style="font-weight:bold;padding:3px 8px;color:#1a3c6e;">${company.name}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Plot #:</td><td style="font-weight:bold;padding:3px 8px;color:#1a3c6e;">${plot.plotNumber}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Block:</td><td style="padding:3px 8px;">${plot.block}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Size:</td><td style="padding:3px 8px;">${plot.size} ${plot.sizeUnit}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Category:</td><td style="padding:3px 8px;">${plot.category}</td></tr>
        </table>
      </div>
    </div>

    <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;margin-bottom:12px;">
      <div class="lh-info-title">Payment Details</div>
      <table class="lh-table" style="margin-bottom:0;">
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Total Plot Price:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">${fmtAmt(booking.totalPrice)}</td></tr>
        <tr><td style="padding:6px 10px;">Booking Amount Received:</td><td style="text-align:right;font-weight:bold;font-size:11.5pt;color:#1a3c6e;">${fmtAmt(booking.bookingAmount)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Payment Method:</td><td style="text-align:right;">${booking.paymentMethod}${booking.bankName ? ` (${booking.bankName})` : ''}</td></tr>
        <tr><td style="padding:6px 10px;">Balance Remaining:</td><td style="text-align:right;font-weight:bold;color:#dc2626;">${fmtAmt(booking.totalPrice - booking.bookingAmount)}</td></tr>
      </table>
    </div>

    <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:8px 12px;font-size:9.5pt;text-align:center;color:#334155;margin-bottom:10px;">
      This booking form confirms plot reservation upon receipt of payment.
    </div>
  `;

  return buildLetterheadDocument({
    fitOnePage: true,
    sections: [
      { title: 'Booking Form', bodyHtml: content }
    ]
  });
}

export function generatePaymentReceipt(
  payment: Installment,
  customer: Customer,
  plot: Plot,
  company: CompanySettings,
  remainingBalance: number,
  totalPaidSoFar: number
): string {
  const isPossession = payment.type === 'on_possession';
  const isDownPayment = payment.type === 'down_payment';
  const title = isPossession ? 'On-Possession Receipt' : (isDownPayment ? 'Down Payment Receipt' : 'Payment Receipt');

  const typeLabel = isDownPayment ? 'Down Payment'
    : payment.type === 'semi_annual' ? 'Semi-Annual'
    : isPossession ? 'On Possession'
    : `Installment #${payment.installmentNumber} of ${payment.totalInstallments}`;

  const receiptData: ReceiptItem = {
    receiptNo: payment.receiptNumber || 'N/A',
    date: payment.paymentDate || new Date(),
    customerName: customer.name,
    fatherName: customer.fatherName,
    cnic: customer.cnic,
    phone: customer.phone,
    plotNo: plot.plotNumber,
    block: plot.block,
    plotSize: `${plot.size} ${plot.sizeUnit}`,
    category: plot.category,
    paymentType: typeLabel,
    amount: payment.amountPaid || 0,
    paymentMethod: payment.paymentMethod || 'Cash',
    bankName: payment.bankName,
    totalPaidToDate: totalPaidSoFar,
    remainingBalance: remainingBalance,
    projectName: company.name
  };

  return buildLetterheadDocument({
    layout: 'receipt-pair',
    receipt: {
      title,
      data: receiptData
    }
  });
}

export function generatePlotAgreement(sale: Sale, customer: Customer, plot: Plot, company: CompanySettings): string {
  const nom = customer.nominee || {};

  const agreementBody = `
    <div style="margin-bottom:12px;text-align:right;font-size:9.5pt;color:#64748b;">
      Agreement #: <strong>${sale.saleNumber}</strong> | Date: <strong>${fmtDate(sale.saleDate)}</strong>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Buyer Details</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:70px;">Name:</td><td style="font-weight:bold;padding:3px 8px;">${customer.name}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Father:</td><td style="padding:3px 8px;">${customer.fatherName || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">CNIC:</td><td style="padding:3px 8px;">${customer.cnic}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Phone:</td><td style="padding:3px 8px;">${customer.phone}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;vertical-align:top;">Address:</td><td style="padding:3px 8px;">${customer.address}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Nominee Details</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:70px;">Name:</td><td style="font-weight:bold;padding:3px 8px;">${(nom as {nomineeName?:string}).nomineeName || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Relation:</td><td style="padding:3px 8px;">${(nom as {nomineeRelation?:string}).nomineeRelation || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">CNIC:</td><td style="padding:3px 8px;">${(nom as {nomineeCnic?:string}).nomineeCnic || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Phone:</td><td style="padding:3px 8px;">${(nom as {nomineePhone?:string}).nomineePhone || '-'}</td></tr>
        </table>
      </div>
    </div>

    <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;margin-bottom:12px;">
      <div class="lh-info-title">Plot Details</div>
      <table class="lh-table" style="margin-bottom:0;">
        <tr>
          <td style="padding:6px 10px;width:25%;">Project: <strong>${company.name}</strong></td>
          <td style="padding:6px 10px;width:25%;">Plot #: <strong style="color:#1a3c6e;">${plot.plotNumber}</strong></td>
          <td style="padding:6px 10px;width:25%;">Block: <strong>${plot.block}</strong></td>
          <td style="padding:6px 10px;width:25%;">Size: <strong>${plot.size} ${plot.sizeUnit}</strong></td>
        </tr>
        <tr style="background:#f8fafc;">
          <td colspan="2" style="padding:6px 10px;">Category: <strong>${plot.category}</strong></td>
          <td colspan="2" style="padding:6px 10px;">Location: <strong>${plot.location || 'Faisal Homes'}</strong></td>
        </tr>
      </table>
    </div>

    <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;margin-bottom:12px;">
      <div class="lh-info-title">Financial Details</div>
      <table class="lh-table" style="margin-bottom:0;">
        <tr><td style="padding:6px 10px;">Total Sale Price:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">${fmtAmt(sale.totalPrice)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Down Payment (${sale.downPaymentPercent}%):</td><td style="text-align:right;font-weight:bold;">${fmtAmt(sale.downPaymentAmount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 24px;color:#64748b;font-size:9.5pt;">Booking Amount (included):</td><td style="text-align:right;color:#64748b;font-size:9.5pt;">${fmtAmt(sale.bookingAmountPaid)}</td></tr>
        <tr style="background:#fffbeb;"><td style="padding:4px 10px 4px 24px;color:#b45309;font-size:9.5pt;">Remaining Down Payment Due:</td><td style="text-align:right;color:#b45309;font-weight:bold;font-size:9.5pt;">${fmtAmt(sale.remainingDownPayment)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Balance for Installments:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">${fmtAmt(sale.remainingAmount)}</td></tr>
        ${sale.onPossessionEnabled ? `<tr><td style="padding:6px 10px;">On-Possession Amount:</td><td style="text-align:right;font-weight:bold;">${fmtAmt(sale.onPossessionAmount)}</td></tr>` : ''}
      </table>
    </div>
  `;

  return buildLetterheadDocument({
    fitOnePage: true,
    sections: [
      { title: 'Plot Sale Agreement', bodyHtml: agreementBody }
    ]
  });
}

export function generateScheduleHTML(
  sale: Sale,
  customer: Customer,
  plot: Plot,
  schedule: Installment[],
  company: CompanySettings
): string {
  const sorted = sortInstallments(schedule);
  const paid    = sorted.filter(s => s.status === 'paid');
  const pending = sorted.filter(s => s.status !== 'paid');
  const paidTotal    = paid.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
  const pendingTotal = pending.reduce((sum, s) => sum + (s.amountDue || 0), 0);

  const statusBadge = (entry: Installment) => {
    if (entry.status === 'paid') return '<span style="color:#16a34a;font-weight:bold;">Paid</span>';
    if (entry.status === 'cancelled') return '<span style="color:#dc2626;font-weight:bold;">Cancelled</span>';

    const due = new Date(entry.dueDate);
    if (due < new Date()) {
      let label = 'Overdue';
      if (entry.type === 'semi_annual') label = 'Overdue (Semi-Annual)';
      if (entry.type === 'down_payment') label = 'Overdue (Down Payment)';
      if (entry.type === 'on_possession') label = 'Overdue (Possession)';
      return '<span style="color:#dc2626;font-weight:bold;">' + label + '</span>';
    }

    if (entry.type === 'on_possession') return '<span style="color:#0284c7;font-weight:bold;">On Possession</span>';
    if (entry.type === 'semi_annual') return '<span style="color:#d97706;font-weight:bold;">Semi-Annual</span>';
    if (entry.type === 'down_payment') return '<span style="color:#9333ea;font-weight:bold;">Down Payment</span>';
    return '<span style="color:#64748b;">Pending</span>';
  };

  const typeColumnLabel = (entry: Installment) => {
    if (entry.type === 'semi_annual') return 'Semi-Annual';
    if (entry.type === 'on_possession') return 'On Possession';
    if (entry.type === 'down_payment') return 'Down Payment';
    return 'Installment';
  };

  const numLabel = (entry: Installment) => {
    if (entry.type === 'down_payment') return 'DP';
    if (entry.type === 'semi_annual') return 'SA ' + entry.installmentNumber;
    if (entry.type === 'on_possession') return 'Poss.';
    return '#' + entry.installmentNumber;
  };

  const row = (entry: Installment) => `
    <tr>
      <td style="text-align:center;font-weight:bold;">${numLabel(entry)}</td>
      <td style="font-weight:600;">${typeColumnLabel(entry)}</td>
      <td>${fmtDate(entry.dueDate)}</td>
      <td style="text-align:right;font-weight:bold;">${fmtAmt(entry.amountDue)}</td>
      <td style="text-align:center;">${statusBadge(entry)}</td>
      <td style="text-align:center;">${entry.status === 'paid' ? fmtDate(entry.paymentDate) : '-'}</td>
    </tr>
  `;

  const thead = '<thead><tr style="background:#f1f5f9;"><th style="width:44px;text-align:center;">#</th><th>Type</th><th>Due Date</th><th style="text-align:right;">Amount</th><th style="text-align:center;">Status</th><th style="text-align:center;">Paid Date</th></tr></thead>';

  const content = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Customer</div>
        <div style="font-weight:bold;font-size:10.5pt;color:#1a3c6e;margin-top:2px;">${customer.name}</div>
        <div style="font-size:9pt;color:#64748b;">${customer.customerId} | ${customer.phone}</div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Plot Details</div>
        <div style="font-weight:bold;font-size:10.5pt;color:#1a3c6e;margin-top:2px;">${plot.plotNumber}, Block ${plot.block}</div>
        <div style="font-size:9pt;color:#64748b;">${plot.size} ${plot.sizeUnit} | ${plot.category}</div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Plan Overview</div>
        <div style="font-weight:bold;font-size:10.5pt;color:#1a3c6e;margin-top:2px;">${fmtAmt(sale.totalPrice)}</div>
        <div style="font-size:9pt;color:#dc2626;">Remaining: ${fmtAmt(pendingTotal)}</div>
      </div>
    </div>

    <table class="lh-table lh-installment-table">
      ${thead}
      <tbody>
        ${sorted.map(row).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;font-weight:bold;">
          <td colspan="3" style="padding:6px 8px;">TOTAL PAID (${paid.length} installments)</td>
          <td style="text-align:right;color:#16a34a;">${fmtAmt(paidTotal)}</td>
          <td colspan="2"></td>
        </tr>
        <tr style="background:#f1f5f9;font-weight:bold;">
          <td colspan="3" style="padding:6px 8px;">REMAINING BALANCE (${pending.length} installments)</td>
          <td style="text-align:right;color:#dc2626;">${fmtAmt(pendingTotal)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  `;

  return buildLetterheadDocument({
    fitOnePage: true,
    sections: [
      { title: 'Installment Plan', bodyHtml: content }
    ]
  });
}

export function generateDownPaymentReceiptHTML(
  tx: DownPaymentTransaction,
  customer: Customer,
  plot: Plot,
  sale: Sale,
  company: CompanySettings
): string {
  const totalReceived = (sale.downPaymentReceived || 0);
  const stillPending = Math.max(0, (sale.remainingDownPayment || 0) - totalReceived);
  const remainingTotal = (sale.remainingAmount || 0) + stillPending;

  const receiptData: ReceiptItem = {
    receiptNo: tx.receiptNumber || 'N/A',
    date: tx.paymentDate || new Date(),
    customerName: customer.name,
    fatherName: customer.fatherName,
    cnic: customer.cnic,
    phone: customer.phone,
    plotNo: plot.plotNumber,
    block: plot.block,
    plotSize: `${plot.size} ${plot.sizeUnit}`,
    category: plot.category,
    paymentType: 'Down Payment',
    amount: tx.amount,
    paymentMethod: tx.paymentMethod || 'Cash',
    bankName: tx.bankName,
    chequeNumber: tx.chequeNumber,
    remainingBalance: remainingTotal,
    projectName: company.name
  };

  return buildLetterheadDocument({
    layout: 'receipt-pair',
    receipt: {
      title: 'Down Payment Receipt',
      data: receiptData
    }
  });
}

export function generatePossessionReceiptHTML(
  payment: Installment,
  customer: Customer,
  plot: Plot,
  company: CompanySettings,
  remainingBalance: number,
  totalPaidSoFar: number
): string {
  return generatePaymentReceipt(
    { ...payment, type: 'on_possession' },
    customer,
    plot,
    company,
    remainingBalance,
    totalPaidSoFar
  );
}

export function generateInstallmentSchedule(
  sale: Sale,
  customer: Customer,
  plot: Plot,
  schedule: Installment[],
  company: CompanySettings
): string {
  return generateScheduleHTML(sale, customer, plot, schedule, company);
}
