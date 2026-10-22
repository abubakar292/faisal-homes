import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/utils/printUtils.ts');
let raw = fs.readFileSync(filePath, 'utf8');
const isCrlf = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

// 1. Update import to include ReceiptItem
const oldImport = "import { buildLetterheadDocument } from './letterhead';";
const newImport = "import { buildLetterheadDocument, type ReceiptItem } from './letterhead';";
if (!content.includes(oldImport)) {
  throw new Error("Could not find oldImport anchor in printUtils.ts");
}
content = content.replace(oldImport, newImport);

// 2. Update generateReportHTML
const oldReportFnStart = "export function generateReportHTML(";
const oldReportFnEnd = "    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>\n  `;\n}";
const reportIdx1 = content.indexOf(oldReportFnStart);
const reportIdx2 = content.indexOf(oldReportFnEnd);
if (reportIdx1 === -1 || reportIdx2 === -1) {
  throw new Error(`Could not find generateReportHTML anchors: idx1=${reportIdx1}, idx2=${reportIdx2}`);
}

const newReportFn = `export function generateReportHTML(
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
}`;

content = content.slice(0, reportIdx1) + newReportFn + content.slice(reportIdx2 + oldReportFnEnd.length);

// 3. Update generateBookingReceipt
const oldBookingStart = "export function generateBookingReceipt(booking: Booking, customer: Customer, plot: Plot, company: CompanySettings): string {";
const oldBookingEnd = "  return buildLetterheadDocument({\n    sections: [\n      { title: 'Booking Form', bodyHtml: makeCopyContent('Office Copy', false) },\n      { title: 'Booking Form', bodyHtml: makeCopyContent('Customer Copy', true) }\n    ]\n  });\n}";
const bookingIdx1 = content.indexOf(oldBookingStart);
const bookingIdx2 = content.indexOf(oldBookingEnd);
if (bookingIdx1 === -1 || bookingIdx2 === -1) {
  throw new Error(`Could not find generateBookingReceipt anchors: idx1=${bookingIdx1}, idx2=${bookingIdx2}`);
}

const newBookingFn = `export function generateBookingReceipt(booking: Booking, customer: Customer, plot: Plot, company: CompanySettings): string {
  const content = \`
    <div style="margin-bottom:12px;text-align:right;font-size:9.5pt;color:#64748b;">
      Booking #: <strong>\${booking.receiptNumber}</strong> | Date: <strong>\${fmtDate(booking.bookingDate)}</strong>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Customer Information</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:75px;">Name:</td><td style="font-weight:bold;padding:3px 8px;">\${customer.name}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Father:</td><td style="padding:3px 8px;">\${customer.fatherName || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">CNIC:</td><td style="padding:3px 8px;">\${customer.cnic}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Phone:</td><td style="padding:3px 8px;">\${customer.phone}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;vertical-align:top;">Address:</td><td style="padding:3px 8px;">\${customer.address}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Booking Details</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:75px;">Project:</td><td style="font-weight:bold;padding:3px 8px;color:#1a3c6e;">\${company.name}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Plot #:</td><td style="font-weight:bold;padding:3px 8px;color:#1a3c6e;">\${plot.plotNumber}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Block:</td><td style="padding:3px 8px;">\${plot.block}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Size:</td><td style="padding:3px 8px;">\${plot.size} \${plot.sizeUnit}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Category:</td><td style="padding:3px 8px;">\${plot.category}</td></tr>
        </table>
      </div>
    </div>

    <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;margin-bottom:12px;">
      <div class="lh-info-title">Payment Details</div>
      <table class="lh-table" style="margin-bottom:0;">
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Total Plot Price:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">\${fmtAmt(booking.totalPrice)}</td></tr>
        <tr><td style="padding:6px 10px;">Booking Amount Received:</td><td style="text-align:right;font-weight:bold;font-size:11.5pt;color:#1a3c6e;">\${fmtAmt(booking.bookingAmount)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Payment Method:</td><td style="text-align:right;">\${booking.paymentMethod}\${booking.bankName ? \` (\${booking.bankName})\` : ''}</td></tr>
        <tr><td style="padding:6px 10px;">Balance Remaining:</td><td style="text-align:right;font-weight:bold;color:#dc2626;">\${fmtAmt(booking.totalPrice - booking.bookingAmount)}</td></tr>
      </table>
    </div>

    <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:8px 12px;font-size:9.5pt;text-align:center;color:#334155;margin-bottom:10px;">
      This booking form confirms plot reservation upon receipt of payment.
    </div>
  \`;

  return buildLetterheadDocument({
    fitOnePage: true,
    sections: [
      { title: 'Booking Form', bodyHtml: content }
    ]
  });
}`;

content = content.slice(0, bookingIdx1) + newBookingFn + content.slice(bookingIdx2 + oldBookingEnd.length);

// 4. Update generatePaymentReceipt
const oldPaymentStart = "export function generatePaymentReceipt(";
const oldPaymentEnd = "  return buildLetterheadDocument({\n    sections: [\n      { title, bodyHtml: makeCopy('Office Copy', false) },\n      { title, bodyHtml: makeCopy('Accounts Copy', false) },\n      { title, bodyHtml: makeCopy('Customer Copy', true) }\n    ]\n  });\n}";
const payIdx1 = content.indexOf(oldPaymentStart);
const payIdx2 = content.indexOf(oldPaymentEnd);
if (payIdx1 === -1 || payIdx2 === -1) {
  throw new Error(`Could not find generatePaymentReceipt anchors: idx1=${payIdx1}, idx2=${payIdx2}`);
}

const newPaymentFn = `export function generatePaymentReceipt(
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
    : \`Installment #\${payment.installmentNumber} of \${payment.totalInstallments}\`;

  const receiptData: ReceiptItem = {
    receiptNo: payment.receiptNumber || 'N/A',
    date: payment.paymentDate || new Date(),
    customerName: customer.name,
    fatherName: customer.fatherName,
    cnic: customer.cnic,
    phone: customer.phone,
    plotNo: plot.plotNumber,
    block: plot.block,
    plotSize: \`\${plot.size} \${plot.sizeUnit}\`,
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
}`;

content = content.slice(0, payIdx1) + newPaymentFn + content.slice(payIdx2 + oldPaymentEnd.length);

// 5. Update generatePlotAgreement
const oldAgrStart = "export function generatePlotAgreement(sale: Sale, customer: Customer, plot: Plot, company: CompanySettings): string {";
const oldAgrEnd = "  return buildLetterheadDocument({\n    sections: [\n      { title: 'Plot Sale Agreement', bodyHtml: agreementBody },\n      { title: 'Policies, Terms & Conditions', bodyHtml: termsBody }\n    ]\n  });\n}";
const agrIdx1 = content.indexOf(oldAgrStart);
const agrIdx2 = content.indexOf(oldAgrEnd);
if (agrIdx1 === -1 || agrIdx2 === -1) {
  throw new Error(`Could not find generatePlotAgreement anchors: idx1=${agrIdx1}, idx2=${agrIdx2}`);
}

const newAgrFn = `export function generatePlotAgreement(sale: Sale, customer: Customer, plot: Plot, company: CompanySettings): string {
  const nom = customer.nominee || {};

  const agreementBody = \`
    <div style="margin-bottom:12px;text-align:right;font-size:9.5pt;color:#64748b;">
      Agreement #: <strong>\${sale.saleNumber}</strong> | Date: <strong>\${fmtDate(sale.saleDate)}</strong>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Buyer Details</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:70px;">Name:</td><td style="font-weight:bold;padding:3px 8px;">\${customer.name}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Father:</td><td style="padding:3px 8px;">\${customer.fatherName || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">CNIC:</td><td style="padding:3px 8px;">\${customer.cnic}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Phone:</td><td style="padding:3px 8px;">\${customer.phone}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;vertical-align:top;">Address:</td><td style="padding:3px 8px;">\${customer.address}</td></tr>
        </table>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div class="lh-info-title">Nominee Details</div>
        <table style="width:100%;font-size:10pt;border-collapse:collapse;padding:4px;">
          <tr><td style="color:#64748b;padding:3px 8px;width:70px;">Name:</td><td style="font-weight:bold;padding:3px 8px;">\${(nom as {nomineeName?:string}).nomineeName || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Relation:</td><td style="padding:3px 8px;">\${(nom as {nomineeRelation?:string}).nomineeRelation || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">CNIC:</td><td style="padding:3px 8px;">\${(nom as {nomineeCnic?:string}).nomineeCnic || '-'}</td></tr>
          <tr><td style="color:#64748b;padding:3px 8px;">Phone:</td><td style="padding:3px 8px;">\${(nom as {nomineePhone?:string}).nomineePhone || '-'}</td></tr>
        </table>
      </div>
    </div>

    <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;margin-bottom:12px;">
      <div class="lh-info-title">Plot Details</div>
      <table class="lh-table" style="margin-bottom:0;">
        <tr>
          <td style="padding:6px 10px;width:25%;">Project: <strong>\${company.name}</strong></td>
          <td style="padding:6px 10px;width:25%;">Plot #: <strong style="color:#1a3c6e;">\${plot.plotNumber}</strong></td>
          <td style="padding:6px 10px;width:25%;">Block: <strong>\${plot.block}</strong></td>
          <td style="padding:6px 10px;width:25%;">Size: <strong>\${plot.size} \${plot.sizeUnit}</strong></td>
        </tr>
        <tr style="background:#f8fafc;">
          <td colspan="2" style="padding:6px 10px;">Category: <strong>\${plot.category}</strong></td>
          <td colspan="2" style="padding:6px 10px;">Location: <strong>\${plot.location || 'Faisal Homes'}</strong></td>
        </tr>
      </table>
    </div>

    <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;margin-bottom:12px;">
      <div class="lh-info-title">Financial Details</div>
      <table class="lh-table" style="margin-bottom:0;">
        <tr><td style="padding:6px 10px;">Total Sale Price:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">\${fmtAmt(sale.totalPrice)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Down Payment (\${sale.downPaymentPercent}%):</td><td style="text-align:right;font-weight:bold;">\${fmtAmt(sale.downPaymentAmount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 24px;color:#64748b;font-size:9.5pt;">Booking Amount (included):</td><td style="text-align:right;color:#64748b;font-size:9.5pt;">\${fmtAmt(sale.bookingAmountPaid)}</td></tr>
        <tr style="background:#fffbeb;"><td style="padding:4px 10px 4px 24px;color:#b45309;font-size:9.5pt;">Remaining Down Payment Due:</td><td style="text-align:right;color:#b45309;font-weight:bold;font-size:9.5pt;">\${fmtAmt(sale.remainingDownPayment)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 10px;">Balance for Installments:</td><td style="text-align:right;font-weight:bold;color:#1a3c6e;">\${fmtAmt(sale.remainingAmount)}</td></tr>
        \${sale.onPossessionEnabled ? \`<tr><td style="padding:6px 10px;">On-Possession Amount:</td><td style="text-align:right;font-weight:bold;">\${fmtAmt(sale.onPossessionAmount)}</td></tr>\` : ''}
      </table>
    </div>
  \`;

  return buildLetterheadDocument({
    fitOnePage: true,
    sections: [
      { title: 'Plot Sale Agreement', bodyHtml: agreementBody }
    ]
  });
}`;

content = content.slice(0, agrIdx1) + newAgrFn + content.slice(agrIdx2 + oldAgrEnd.length);

// 6. Update generateScheduleHTML
const oldSchedTable = '<table class="lh-table">';
const newSchedTable = '<table class="lh-table lh-installment-table">';
if (!content.includes(oldSchedTable)) {
  throw new Error("Could not find oldSchedTable anchor in printUtils.ts");
}
content = content.replace(oldSchedTable, newSchedTable);

const oldSchedReturn = "  return buildLetterheadDocument({\n    sections: [\n      { title: 'Installment Plan', bodyHtml: content }\n    ]\n  });";
const newSchedReturn = "  return buildLetterheadDocument({\n    fitOnePage: true,\n    sections: [\n      { title: 'Installment Plan', bodyHtml: content }\n    ]\n  });";
if (!content.includes(oldSchedReturn)) {
  throw new Error("Could not find oldSchedReturn anchor in printUtils.ts");
}
content = content.replace(oldSchedReturn, newSchedReturn);

// 7. Update generateDownPaymentReceiptHTML
const oldDpStart = "export function generateDownPaymentReceiptHTML(";
const oldDpEnd = "  return buildLetterheadDocument({\n    sections: [\n      { title: 'Down Payment Receipt', bodyHtml: content }\n    ]\n  });\n}";
const dpIdx1 = content.indexOf(oldDpStart);
const dpIdx2 = content.indexOf(oldDpEnd);
if (dpIdx1 === -1 || dpIdx2 === -1) {
  throw new Error(`Could not find generateDownPaymentReceiptHTML anchors: idx1=${dpIdx1}, idx2=${dpIdx2}`);
}

const newDpFn = `export function generateDownPaymentReceiptHTML(
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
    plotSize: \`\${plot.size} \${plot.sizeUnit}\`,
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
}`;

content = content.slice(0, dpIdx1) + newDpFn + content.slice(dpIdx2 + oldDpEnd.length);

const output = isCrlf ? content.replace(/\n/g, '\r\n') : content;
fs.writeFileSync(filePath, output, 'utf8');
console.log('Successfully updated printUtils.ts via Node script!');
