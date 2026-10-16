import { printDocument } from './printDocument';
import { formatCurrency, formatDate } from './formatters';
import type { Booking, Customer, Plot, Sale, Installment, CompanySettings, DownPaymentTransaction } from '../types';

// ─── Legacy aliases — kept for backward compatibility ─────────────────────────
export function generateReportHTML(
  company: CompanySettings | { name: string; address?: string; phone?: string } | string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  summary?: string
): string {
  const companyName  = typeof company === 'string' ? company : (company?.name || '');
  const companyAddr  = typeof company === 'string' ? '' : ((company as { address?: string })?.address || '');
  const companyPhone = typeof company === 'string' ? '' : ((company as { phone?: string })?.phone || '');
  const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
  return `
    <div class="company-header">
      <div>
        <div class="company-name">${companyName}</div>
        <div class="company-sub">${companyAddr}${companyPhone ? ' | ' + companyPhone : ''}</div>
      </div>
      <div class="company-right">Print Date: ${new Date().toLocaleDateString('en-GB')}</div>
    </div>
    <div class="doc-title-band">${title}${summary ? `<div class="doc-subtitle">${summary}</div>` : ''}</div>
    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
  `;
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
  const shell = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  void printDocument(shell);
}

// Legacy alias — keep old callers working
export const printContent = printInNewWindow;

// ─── Company header helper ────────────────────────────────────────────────────

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
    ${companyHeader(company)}
    <div class="doc-title-band">BOOKING RECEIPT</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e2e8f0;">
      <div style="padding:12px;border-right:1px solid #e2e8f0;">
        <div class="info-section-title" style="margin-bottom:8px;">CUSTOMER INFORMATION</div>
        <table style="font-size:11px;">
          <tr><td style="color:#666;padding:3px 0;width:70px;">Name:</td><td style="font-weight:bold;">${customer.name}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Father:</td><td>${customer.fatherName || '—'}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">CNIC:</td><td>${customer.cnic}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Phone:</td><td>${customer.phone}</td></tr>
          <tr><td style="color:#666;padding:3px 0;vertical-align:top;">Address:</td><td>${customer.address}</td></tr>
        </table>
      </div>
      <div style="padding:12px;">
        <div class="info-section-title" style="margin-bottom:8px;">BOOKING DETAILS</div>
        <table style="font-size:11px;">
          <tr><td style="color:#666;padding:3px 0;width:70px;">Receipt#:</td><td style="font-weight:bold;">${booking.receiptNumber}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Date:</td><td>${fmtDate(booking.bookingDate)}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Plot #:</td><td style="font-weight:bold;color:#1a3c6e;">${plot.plotNumber}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Block:</td><td>${plot.block}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Size:</td><td>${plot.size} ${plot.sizeUnit}</td></tr>
          <tr><td style="color:#666;padding:3px 0;">Category:</td><td>${plot.category}</td></tr>
        </table>
      </div>
    </div>

    <div style="padding:12px;">
      <div class="info-section-title" style="margin-bottom:8px;">PAYMENT DETAILS</div>
      <table>
        <tr style="background:#f0f7ff;"><td style="padding:7px 10px;">Total Plot Price:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">${fmtAmt(booking.totalPrice)}</td></tr>
        <tr><td style="padding:7px 10px;">Booking Amount Received:</td><td style="text-align:right;font-weight:bold;font-size:13px;color:#1a3c6e;">${fmtAmt(booking.bookingAmount)}</td></tr>
        <tr style="background:#f0f7ff;"><td style="padding:7px 10px;">Payment Method:</td><td style="text-align:right;">${booking.paymentMethod}${booking.bankName ? ` (${booking.bankName})` : ''}</td></tr>
        <tr><td style="padding:7px 10px;">Balance Remaining:</td><td style="text-align:right;font-weight:bold;color:#dc2626;">${fmtAmt(booking.totalPrice - booking.bookingAmount)}</td></tr>
      </table>
    </div>

    <div style="background:#1a3c6e;color:white;padding:8px 12px;font-size:10px;text-align:center;">
      This receipt confirms your booking. Plot will be reserved upon receipt of payment.
    </div>

    <div class="signature-area">
      <div>Received By:<div class="sig-line"></div></div>
      <div><div class="stamp-box">STAMP</div></div>
      <div style="text-align:right;">Customer Sign:<div class="sig-line"></div></div>
    </div>
  `;

  return `
    <div class="receipt-copy">
      <div class="copy-header" style="background:#1a3c6e;"><span class="copy-label">📋 OFFICE COPY</span><span>${fmtDate(new Date())}</span></div>
      <div class="copy-body">${content}</div>
    </div>
    <div class="cut-line">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
    <div class="receipt-copy">
      <div class="copy-header" style="background:#0d9488;"><span class="copy-label">👤 CUSTOMER COPY</span><span>${fmtDate(new Date())}</span></div>
      <div class="copy-body">${content}</div>
    </div>
  `;
}

// ─── PAYMENT RECEIPT (3 copies) ──────────────────────────────────────────────

export function generatePaymentReceipt(
  payment: Installment,
  customer: Customer,
  plot: Plot,
  company: CompanySettings,
  remainingBalance: number,
  totalPaidSoFar: number
): string {
  const typeLabel = payment.type === 'down_payment' ? 'Down Payment'
    : payment.type === 'semi_annual' ? '⭐ Semi-Annual'
    : payment.type === 'on_possession' ? 'On Possession'
    : `Installment #${payment.installmentNumber} of ${payment.totalInstallments}`;

  const copyContent = (copyType: string, headerBg: string) => `
    <div class="receipt-copy">
      <div class="copy-header" style="background:${headerBg};">
        <span class="copy-label">${copyType}</span>
        <span>${company.name} | Receipt# ${payment.receiptNumber}</span>
      </div>
      <div class="copy-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:6px;">
          <div>
            <div style="font-weight:bold;font-size:11px;">${customer.name}</div>
            <div style="color:#666;font-size:9px;">${customer.customerId} | ${customer.phone}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:bold;">Plot ${plot.plotNumber}, Block ${plot.block}</div>
            <div style="color:#666;font-size:9px;">${typeLabel}</div>
          </div>
        </div>
        <div class="copy-row"><span>Date:</span><span>${fmtDate(payment.paymentDate || new Date())}</span></div>
        <div class="copy-row"><span>Due Date:</span><span>${fmtDate(payment.dueDate)}</span></div>
        <div class="copy-row"><span>Amount Received:</span><span style="font-weight:bold;">${fmtAmt(payment.amountPaid)}</span></div>
        <div class="copy-row"><span>Payment Method:</span><span>${payment.paymentMethod}${payment.bankName ? ` — ${payment.bankName}` : ''}</span></div>
        <div class="copy-row"><span>Total Paid To Date:</span><span>${fmtAmt(totalPaidSoFar)}</span></div>
        <div class="remaining-highlight">
          <span>REMAINING BALANCE:</span>
          <span>${fmtAmt(remainingBalance)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 60px 1fr;border-top:1px solid #eee;padding-top:8px;margin-top:4px;font-size:9px;">
          <div>Received By:<div class="sig-line" style="width:90px;"></div></div>
          <div><div class="stamp-box" style="height:40px;font-size:8px;">Stamp</div></div>
          <div style="text-align:right;">Customer Sign:<div class="sig-line" style="width:90px;margin-left:auto;"></div></div>
        </div>
      </div>
    </div>
  `;

  return `
    ${copyContent('📋 OFFICE COPY', '#1a3c6e')}
    <div class="cut-line">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
    ${copyContent('📋 OFFICE COPY', '#1a3c6e')}
    <div class="cut-line">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
    ${copyContent('👤 CUSTOMER COPY', '#0d9488')}
  `;
}

// ─── PLOT AGREEMENT ──────────────────────────────────────────────────────────

export function generatePlotAgreement(sale: Sale, customer: Customer, plot: Plot, company: CompanySettings): string {
  const nom = customer.nominee || {};
  return `
    ${companyHeader(company, `Agreement# ${sale.saleNumber}<br>Date: ${fmtDate(sale.saleDate)}`)}
    <div class="doc-title-band">PLOT SALE AGREEMENT</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e2e8f0;">
      <div style="padding:12px;border-right:1px solid #e2e8f0;">
        <div class="info-section-title" style="margin-bottom:8px;">BUYER DETAILS</div>
        <table style="font-size:10px;">
          <tr><td style="color:#666;padding:2px 0;width:60px;">Name:</td><td style="font-weight:bold;">${customer.name}</td></tr>
          <tr><td style="color:#666;padding:2px 0;">Father:</td><td>${customer.fatherName || '—'}</td></tr>
          <tr><td style="color:#666;padding:2px 0;">CNIC:</td><td>${customer.cnic}</td></tr>
          <tr><td style="color:#666;padding:2px 0;">Phone:</td><td>${customer.phone}</td></tr>
          <tr><td style="color:#666;padding:2px 0;vertical-align:top;">Address:</td><td>${customer.address}</td></tr>
        </table>
      </div>
      <div style="padding:12px;">
        <div class="info-section-title" style="margin-bottom:8px;">NOMINEE DETAILS</div>
        <table style="font-size:10px;">
          <tr><td style="color:#666;padding:2px 0;width:60px;">Name:</td><td style="font-weight:bold;">${(nom as {nomineeName?:string}).nomineeName || '—'}</td></tr>
          <tr><td style="color:#666;padding:2px 0;">Relation:</td><td>${(nom as {nomineeRelation?:string}).nomineeRelation || '—'}</td></tr>
          <tr><td style="color:#666;padding:2px 0;">CNIC:</td><td>${(nom as {nomineeCnic?:string}).nomineeCnic || '—'}</td></tr>
          <tr><td style="color:#666;padding:2px 0;">Phone:</td><td>${(nom as {nomineePhone?:string}).nomineePhone || '—'}</td></tr>
        </table>
      </div>
    </div>

    <div style="padding:10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div class="info-section-title" style="margin-bottom:6px;">PLOT DETAILS</div>
      <div style="display:flex;gap:20px;font-size:11px;">
        <span><strong style="color:#1a3c6e;">Plot #${plot.plotNumber}</strong></span>
        <span>Block: <strong>${plot.block}</strong></span>
        <span>Size: <strong>${plot.size} ${plot.sizeUnit}</strong></span>
        <span>Category: <strong>${plot.category}</strong></span>
        <span>Location: <strong>${plot.location || 'Faisal Homes'}</strong></span>
      </div>
    </div>

    <div style="padding:10px;">
      <div class="info-section-title" style="margin-bottom:6px;">FINANCIAL DETAILS</div>
      <table>
        <tr><td style="padding:5px 8px;">Total Sale Price:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">${fmtAmt(sale.totalPrice)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:5px 8px;">Down Payment (${sale.downPaymentPercent}%):</td><td style="text-align:right;font-weight:bold;">${fmtAmt(sale.downPaymentAmount)}</td></tr>
        <tr><td style="padding:3px 8px 3px 20px;color:#666;font-size:10px;">└ Booking Amount (included):</td><td style="text-align:right;color:#666;font-size:10px;">${fmtAmt(sale.bookingAmountPaid)}</td></tr>
        <tr style="background:#fffbeb;"><td style="padding:3px 8px 3px 20px;color:#b45309;font-size:10px;">└ Remaining Down Payment Due:</td><td style="text-align:right;color:#b45309;font-weight:bold;font-size:10px;">${fmtAmt(sale.remainingDownPayment)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:5px 8px;">Balance for Installments:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">${fmtAmt(sale.remainingAmount)}</td></tr>
        ${sale.onPossessionEnabled ? `<tr><td style="padding:5px 8px;">On-Possession Amount:</td><td style="text-align:right;font-weight:bold;">${fmtAmt(sale.onPossessionAmount)}</td></tr>` : ''}
      </table>
    </div>

    <div style="padding:10px;border-top:1px solid #e2e8f0;">
      <div class="info-section-title" style="margin-bottom:6px;">TERMS & CONDITIONS</div>
      ${company.termsAndConditions ? `
        <div class="terms-content" style="font-size:10px;line-height:1.7;color:#444;white-space:pre-wrap;">
          ${company.termsAndConditions}
        </div>
      ` : `
        <ol style="padding-left:16px;font-size:10px;line-height:1.7;color:#444;">
          <li>The buyer agrees to pay installments as per the schedule provided separately.</li>
          <li>Possession will be given upon completion of all payments as per agreement.</li>
          <li>Any default in payment may result in cancellation of this agreement.</li>
          <li>The remaining down payment must be cleared before installments commence.</li>
          <li>This agreement is governed by the laws of Pakistan.</li>
        </ol>
      `}
    </div>

    <div class="signature-area">
      <div>
        <div style="font-weight:bold;margin-bottom:20px;">BUYER SIGN:</div>
        <div class="sig-line" style="width:150px;"></div>
        <div style="margin-top:4px;font-size:9px;">${customer.name}</div>
      </div>
      <div><div class="stamp-box">[OFFICIAL STAMP]</div></div>
      <div style="text-align:right;">
        <div style="font-weight:bold;margin-bottom:20px;">SELLER SIGN:</div>
        <div class="sig-line" style="width:150px;margin-left:auto;"></div>
        <div style="margin-top:4px;font-size:9px;">${company.name}</div>
      </div>
    </div>
  `;
}

// ─── INSTALLMENT SCHEDULE ────────────────────────────────────────────────────

export function generateScheduleHTML(
  sale: Sale,
  customer: Customer,
  plot: Plot,
  schedule: Installment[],
  company: CompanySettings
): string {
  const paid    = schedule.filter(s => s.status === 'paid');
  const pending = schedule.filter(s => s.status !== 'paid');
  const paidTotal    = paid.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
  const pendingTotal = pending.reduce((sum, s) => sum + (s.amountDue || 0), 0);

  const statusBadge = (entry: Installment) => {
    if (entry.status === 'paid') return `<span class="status-paid">✅ Paid</span>`;
    if (entry.status === 'cancelled') return `<span class="status-overdue">❌ Cancelled</span>`;
    
    const due = new Date(entry.dueDate);
    if (due < new Date()) {
      let label = '🔴 Overdue';
      if (entry.type === 'semi_annual') label = '🔴 Overdue (Semi-Annual)';
      if (entry.type === 'down_payment') label = '🔴 Overdue (Down Payment)';
      if (entry.type === 'on_possession') label = '🔴 Overdue (Possession)';
      return `<span class="status-overdue">${label}</span>`;
    }
    
    if (entry.type === 'on_possession') return `<span class="status-possession">🏠 On Possession</span>`;
    if (entry.type === 'semi_annual') return `<span class="status-semi">⭐ Semi-Annual</span>`;
    if (entry.type === 'down_payment') return `<span class="status-downpayment">📌 Down Payment</span>`;
    return `<span class="status-pending">⏳ Pending</span>`;
  };

  const numLabel = (entry: Installment) => {
    if (entry.type === 'down_payment') return 'DP';
    if (entry.type === 'semi_annual') return '⭐';
    if (entry.type === 'on_possession') return '🏠';
    return String(entry.installmentNumber);
  };

  const row = (entry: Installment) => `
    <tr>
      <td style="text-align:center;">${numLabel(entry)}</td>
      <td>${fmtDate(entry.dueDate)}</td>
      <td class="amount-col">${fmtAmt(entry.amountDue)}</td>
      <td>${statusBadge(entry)}</td>
      <td>${entry.status === 'paid' ? fmtDate(entry.paymentDate) : '—'}</td>
    </tr>
  `;

  const useTwoCol = schedule.length > 24;
  const half = Math.ceil(schedule.length / 2);
  const thead = `<thead><tr><th style="width:35px;">#</th><th>Due Date</th><th style="text-align:right;">Amount</th><th>Status</th><th>Paid Date</th></tr></thead>`;

  const tableHTML = useTwoCol ? `
    <div class="two-col-table">
      <table>${thead}<tbody>${schedule.slice(0, half).map(row).join('')}</tbody></table>
      <table>${thead}<tbody>${schedule.slice(half).map(row).join('')}</tbody></table>
    </div>
  ` : `
    <table>
      ${thead}
      <tbody>${schedule.map(row).join('')}</tbody>
      <tr class="subtotal-row"><td colspan="2" style="padding:5px 8px;">TOTAL PAID</td><td class="amount-col">${fmtAmt(paidTotal)}</td><td colspan="2">${paid.length} installments</td></tr>
      <tr class="total-row"><td colspan="2" style="padding:5px 8px;">REMAINING BALANCE</td><td class="amount-col">${fmtAmt(pendingTotal)}</td><td colspan="2">${pending.length} installments</td></tr>
    </table>
  `;

  return `
    ${companyHeader(company)}
    <div class="doc-title-band">INSTALLMENT SCHEDULE<div class="doc-subtitle">Payment Plan & Status</div></div>

    <div class="report-summary-grid" style="margin-bottom:8px;">
      <div class="summary-card">
        <div class="summary-card-title">Customer</div>
        <div class="summary-card-value" style="font-size:11px;">${customer.name}</div>
        <div style="font-size:9px;color:#666;">${customer.customerId} | ${customer.phone}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-title">Plot Details</div>
        <div class="summary-card-value" style="font-size:11px;">${plot.plotNumber}, Block ${plot.block}</div>
        <div style="font-size:9px;color:#666;">${plot.size} ${plot.sizeUnit} | ${plot.category}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-title">Total Plan Value</div>
        <div class="summary-card-value">${fmtAmt(sale.totalPrice)}</div>
        <div style="font-size:9px;color:#dc2626;">Remaining: ${fmtAmt(pendingTotal)}</div>
      </div>
    </div>

    <div class="info-section" style="margin-bottom:8px;">
      <div class="info-section-title">Payment Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;padding:6px;">
        <div><div style="font-size:9px;color:#666;">Total Plot Price</div><div style="font-weight:bold;color:#1a3c6e;">${fmtAmt(sale.totalPrice)}</div></div>
        <div style="border-left:1px solid #e2e8f0;"><div style="font-size:9px;color:#666;">Paid To Date</div><div style="font-weight:bold;color:#16a34a;">${fmtAmt(paidTotal)}</div></div>
        <div style="border-left:1px solid #e2e8f0;"><div style="font-size:9px;color:#666;">Remaining</div><div style="font-weight:bold;color:#dc2626;">${fmtAmt(pendingTotal)}</div></div>
      </div>
    </div>

    ${tableHTML}

    <div style="font-size:8px;color:#666;text-align:center;margin-top:8px;border-top:1px solid #e2e8f0;padding-top:6px;">
      This schedule is computer-generated. ${company.name} | ${company.phone}
    </div>
  `;
}

// ─── DOWN PAYMENT RECEIPT (1 copy) ───────────────────────────────────────────

export function generateDownPaymentReceiptHTML(
  tx: DownPaymentTransaction,
  customer: Customer,
  plot: Plot,
  sale: Sale,
  company: CompanySettings
): string {
  const totalReceived  = (sale.downPaymentReceived || 0);
  const stillPending   = Math.max(0, (sale.remainingDownPayment || 0) - totalReceived);

  return `
    <div style="border:1px solid #ccc;font-family:Arial,sans-serif;font-size:11px;max-width:700px;margin:0 auto;">
      ${companyHeader(company)}
      <div class="doc-title-band">DOWN PAYMENT RECEIPT</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e2e8f0;">
        <div style="padding:10px;border-right:1px solid #e2e8f0;">
          <div class="info-section-title" style="margin-bottom:6px;">CUSTOMER</div>
          <table style="font-size:10px;">
            <tr><td style="color:#666;width:60px;">Name:</td><td style="font-weight:bold;">${customer.name}</td></tr>
            <tr><td style="color:#666;">ID:</td><td>${customer.customerId}</td></tr>
            <tr><td style="color:#666;">Phone:</td><td>${customer.phone}</td></tr>
          </table>
        </div>
        <div style="padding:10px;">
          <div class="info-section-title" style="margin-bottom:6px;">PLOT</div>
          <table style="font-size:10px;">
            <tr><td style="color:#666;width:60px;">Plot #:</td><td style="font-weight:bold;color:#1a3c6e;">${plot.plotNumber}</td></tr>
            <tr><td style="color:#666;">Block:</td><td>${plot.block}</td></tr>
            <tr><td style="color:#666;">Size:</td><td>${plot.size} ${plot.sizeUnit}</td></tr>
          </table>
        </div>
      </div>

      <div style="padding:10px;">
        <div class="info-section-title" style="margin-bottom:6px;">PAYMENT DETAILS</div>
        <table>
          <tr><td style="padding:5px 8px;">Receipt Number:</td><td style="text-align:right;font-weight:bold;">${tx.receiptNumber}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:5px 8px;">Payment Date:</td><td style="text-align:right;">${fmtDate(tx.paymentDate)}</td></tr>
          <tr><td style="padding:5px 8px;">Total Down Payment Required:</td><td style="text-align:right;color:#1a3c6e;font-weight:bold;">${fmtAmt(sale.downPaymentAmount)}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:5px 8px;">Booking Already Paid:</td><td style="text-align:right;">${fmtAmt(sale.bookingAmountPaid)}</td></tr>
          <tr><td style="padding:5px 8px;">Amount Received (this payment):</td><td style="text-align:right;font-size:14px;font-weight:bold;color:#1a3c6e;">${fmtAmt(tx.amount)}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:5px 8px;">Payment Method:</td><td style="text-align:right;">${tx.paymentMethod}${tx.bankName ? ` — ${tx.bankName}` : ''}</td></tr>
          ${tx.chequeNumber ? `<tr><td style="padding:5px 8px;">Cheque #:</td><td style="text-align:right;">${tx.chequeNumber}</td></tr>` : ''}
        </table>
        <div class="remaining-highlight" style="margin-top:8px;">
          <span>REMAINING DOWN PAYMENT PENDING:</span>
          <span>${fmtAmt(stillPending)}</span>
        </div>
      </div>

      <div class="signature-area" style="padding:0 10px 10px;">
        <div>Received By:<div class="sig-line" style="width:130px;"></div></div>
        <div><div class="stamp-box">STAMP</div></div>
        <div style="text-align:right;">Customer Sign:<div class="sig-line" style="width:130px;margin-left:auto;"></div></div>
      </div>
    </div>
  `;
}

// ─── Legacy alias for PlotAgreement.tsx ───────────────────────────────────────
export function generateInstallmentSchedule(
  sale: Sale,
  customer: Customer,
  plot: Plot,
  schedule: Installment[],
  company: CompanySettings
): string {
  return generateScheduleHTML(sale, customer, plot, schedule, company);
}
