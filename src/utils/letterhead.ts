import {
  LEGAL_NAME,
  SIGNATURES_LABEL,
  APPLICANT_LABEL,
  NOMINEE_LABEL,
  OFFICER_LABEL,
  REPORT_FOOTER_LABELS
} from '../config/letterhead';

export interface LetterheadSection {
  title: string;
  bodyHtml: string;
}

export interface ReceiptItem {
  receiptNo: string;
  date: string | Date;
  customerName: string;
  fatherName?: string;
  cnic?: string;
  phone?: string;
  plotNo: string;
  block?: string;
  plotSize?: string;
  category?: string;
  paymentType: string;
  amount: number;
  amountInWords?: string;
  paymentMethod: string;
  bankName?: string;
  chequeNumber?: string;
  totalPaidToDate?: number;
  remainingBalance: number;
  projectName: string;
}

export interface ReportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: string;
  totalsRow?: (string | number)[];
  companyName?: string;
  printDate?: string;
  printedBy?: string;
}

export interface BuildLetterheadOptions {
  layout?: 'document' | 'receipt-pair' | 'report';
  sections?: LetterheadSection[];
  repeatFooter?: boolean;
  fitOnePage?: boolean;
  receipt?: {
    title: string;
    data: ReceiptItem;
  };
  report?: ReportOptions;
}

export function numberToWords(amount: number): string {
  if (!amount || isNaN(amount)) return 'Zero Rupees Only';
  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertSection(num: number): string {
    let str = '';
    if (num >= 100) {
      str += units[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num > 0) {
      str += units[num] + ' ';
    }
    return str.trim();
  }

  let n = Math.floor(Math.abs(amount));
  let result = '';

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rem = n;

  if (crore > 0) result += convertSection(crore) + ' Crore ';
  if (lakh > 0) result += convertSection(lakh) + ' Lakh ';
  if (thousand > 0) result += convertSection(thousand) + ' Thousand ';
  if (rem > 0) result += convertSection(rem) + ' ';

  return result.trim() + ' Rupees Only';
}

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return '';
}

function fmtDateStr(date: string | Date | undefined | null): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-GB');
}

function fmtNumber(amount: number | undefined | null): string {
  if (amount === null || amount === undefined) return '0';
  return amount.toLocaleString('en-PK');
}

export const LETTERHEAD_CSS = `
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
  }
  .lh-page-origin {
    position: relative;
    width: 210mm;
  }
  .lh-notch-title {
    position: absolute;
    top: 33mm;
    left: 0;
    right: 0;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-style: italic;
    font-size: 19pt;
    line-height: 13mm;
    color: #111;
    pointer-events: none;
    z-index: 10;
  }
  .lh-notch-title.lh-title-sm {
    font-size: 15pt;
  }
  table.lh-doc {
    width: 210mm;
    min-height: 297mm;
    border-collapse: collapse;
    border-spacing: 0;
    margin: 0;
    padding: 0;
  }
  thead {
    display: table-header-group;
  }
  tfoot {
    display: table-footer-group;
  }
  thead td, tfoot td, tbody td {
    padding: 0;
    margin: 0;
  }
  tbody td {
    vertical-align: top;
  }
  .lh-header-wrap {
    width: 210mm;
    height: 52.4mm;
    overflow: hidden;
    line-height: 0;
    margin: 0;
    padding: 0;
  }
  .lh-header-img {
    width: 210mm;
    height: 52.4mm;
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .lh-content {
    padding: 5.6mm 14mm 4mm 14mm;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1a1a1a;
  }
  .lh-section-break {
    page-break-before: always;
    break-before: page;
  }
  .lh-section-title {
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-style: italic;
    font-size: 16pt;
    color: #1a1a1a;
    margin: 8mm 0 4mm 0;
  }
  .lh-footer-spacer {
    width: 210mm;
    height: 60mm;
  }
  .lh-footer-fixed {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 210mm;
    height: 60mm;
    background: #fff;
    overflow: hidden;
    z-index: 999;
  }
  .lh-sig-title {
    position: absolute;
    left: 13mm;
    top: 4.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
  }
  .lh-applicant-row {
    position: absolute;
    left: 13mm;
    top: 19.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
    white-space: nowrap;
  }
  .lh-nominee-row {
    position: absolute;
    left: 14mm;
    top: 31.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
    white-space: nowrap;
  }
  .lh-officer-row {
    position: absolute;
    left: 13mm;
    top: 46.5mm;
    font-size: 13pt;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    line-height: 1;
    white-space: nowrap;
  }
  .lh-blank-line {
    display: inline-block;
    width: 38mm;
    border-bottom: 1.5px solid #000;
    margin-left: 6px;
    vertical-align: baseline;
    height: 0;
  }
  .lh-logo-wrap {
    position: absolute;
    left: 160mm;
    top: 0mm;
    width: 38mm;
    height: 38mm;
  }
  .lh-footer-logo {
    width: 38mm;
    height: auto;
    display: block;
  }
  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .lh-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-bottom: 8px;
  }
  .lh-table th, .lh-table td {
    border: 1px solid #cbd5e1;
    padding: 4px 6px;
  }
  .lh-table th {
    background: #f1f5f9;
    font-weight: bold;
    text-align: left;
  }
  .lh-info-title {
    background: #f0f4f8;
    border-bottom: 2px solid #1a3c6e;
    padding: 3px 8px;
    font-weight: bold;
    font-size: 9.5pt;
    color: #1a3c6e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .lh-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 8.5pt;
    font-weight: bold;
  }
  .lh-copy-tag {
    display: inline-block;
    padding: 2px 8px;
    background: #1a3c6e;
    color: #fff;
    font-size: 9pt;
    font-weight: bold;
    border-radius: 2px;
    margin-bottom: 6px;
  }
  .lh-copy-tag.customer {
    background: #0d9488;
  }

  /* Receipt Pair Specific Styling */
  .lh-receipt-half {
    position: relative;
    width: 210mm;
    height: 148.5mm;
    overflow: hidden;
    box-sizing: border-box;
    padding: 0 10mm;
    background: #fff;
  }
  .lh-receipt-header-img {
    width: 210mm;
    height: 22.8mm;
    display: block;
    margin-left: -10mm;
    border: 0;
  }
  .lh-receipt-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 2.5mm;
    margin-bottom: 2.5mm;
  }
  .lh-receipt-title {
    flex: 1;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-style: italic;
    font-size: 15pt;
    color: #111;
  }
  .lh-receipt-chip {
    padding: 2px 8px;
    background: #1a3c6e;
    color: #fff;
    font-size: 8.5pt;
    font-weight: bold;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .lh-receipt-chip.customer {
    background: #0d9488;
  }
  .lh-receipt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    margin-bottom: 2.5mm;
  }
  .lh-receipt-table td {
    padding: 2.5px 6px;
    border: 1px solid #cbd5e1;
    vertical-align: middle;
  }
  .lh-receipt-label {
    color: #475569;
    font-weight: 600;
    background: #f8fafc;
    width: 22%;
  }
  .lh-receipt-val {
    color: #0f172a;
    width: 28%;
  }
  .lh-receipt-footer {
    position: absolute;
    bottom: 2.5mm;
    left: 10mm;
    right: 10mm;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .lh-receipt-footer-lines {
    font-size: 8pt;
    font-weight: bold;
    color: #1e293b;
    line-height: 1.8;
  }
  .lh-receipt-line {
    display: inline-block;
    width: 45mm;
    border-bottom: 1px solid #000;
    margin-left: 4px;
    vertical-align: baseline;
  }
  .lh-receipt-logo {
    width: 22mm;
    height: auto;
    display: block;
  }
  .lh-cut-line {
    position: absolute;
    top: 148.5mm;
    left: 0;
    width: 210mm;
    display: flex;
    align-items: center;
    z-index: 50;
    transform: translateY(-50%);
  }
  .lh-cut-scissors {
    margin-left: 4mm;
    margin-right: 4px;
    line-height: 0;
  }
  .lh-cut-dashed {
    flex: 1;
    border-bottom: 1.5px dashed #94a3b8;
    height: 0;
    margin-right: 4mm;
  }

  /* Report Specific Styling */
  .lh-report-page {
    width: 210mm;
    margin: 0;
    background: #fff;
  }
  .lh-report-page.landscape {
    width: 297mm;
  }
  .lh-report-header-img {
    width: 210mm;
    height: 22.8mm;
    display: block;
  }
  .lh-report-page.landscape .lh-report-header-img {
    width: 297mm;
  }
  .lh-report-title {
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-style: italic;
    font-size: 14pt;
    color: #111;
    margin: 3mm 0 1.5mm 0;
  }
  .lh-report-sub {
    text-align: center;
    font-size: 8.5pt;
    color: #64748b;
    margin-bottom: 3mm;
  }
  .lh-report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
  }
  .lh-report-table th, .lh-report-table td {
    border: 1px solid #cbd5e1;
    padding: 3px 5px;
  }
  .lh-report-table th {
    background: #1a3c6e;
    color: #fff;
    font-weight: bold;
    text-align: left;
    font-size: 8pt;
    text-transform: uppercase;
  }
  .lh-report-table tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .lh-report-totals-row {
    font-weight: bold;
    background: #f1f5f9;
    page-break-before: avoid;
    break-before: avoid;
  }
  .lh-report-footer-spacer {
    height: 28mm;
  }
  .lh-report-footer-wrap {
    width: 100%;
    height: 28mm;
    padding: 2mm 10mm 2mm 10mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-sizing: border-box;
    background: #fff;
    border-top: 1px solid #e2e8f0;
  }
  .lh-report-footer-lines {
    font-size: 8pt;
    font-weight: bold;
    color: #1e293b;
    line-height: 1.8;
  }
  .lh-report-footer-line {
    display: inline-block;
    width: 48mm;
    border-bottom: 1px solid #000;
    margin-left: 4px;
    vertical-align: baseline;
  }
  .lh-report-logo {
    width: 20mm;
    height: auto;
    display: block;
  }
`;

const FIT_ONE_PAGE_SCRIPT = `
  <script>
  (function() {
    function fit() {
      var contentEl = document.querySelector('.lh-content') || document.querySelector('.lh-section');
      if (!contentEl) return;

      var targetMaxBottom = (297 - 58) * 3.779527559;

      function isOverflowing() {
        var rect = contentEl.getBoundingClientRect();
        return rect.bottom > targetMaxBottom;
      }

      if (!isOverflowing()) return;

      // (1) Check if installment table exists to split into multi-column
      var instTable = document.querySelector('.lh-installment-table') || document.querySelector('table.lh-table');
      if (instTable && instTable.querySelectorAll('tbody tr').length > 10) {
        splitTable(instTable, 2);
        if (!isOverflowing()) return;

        splitTable(instTable, 3);
        if (!isOverflowing()) return;
      }

      // (2) Lower font size stepwise from 10.5pt to 7.5pt
      var fontSizes = ['10pt', '9.5pt', '9pt', '8.5pt', '8pt', '7.5pt'];
      for (var i = 0; i < fontSizes.length; i++) {
        contentEl.style.fontSize = fontSizes[i];
        var cells = contentEl.querySelectorAll('td, th');
        for (var c = 0; c < cells.length; c++) {
          cells[c].style.padding = '2px 3px';
        }
        if (!isOverflowing()) return;
      }

      // (3) CSS zoom down to a minimum of 0.7
      var zooms = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7];
      for (var z = 0; z < zooms.length; z++) {
        contentEl.style.zoom = zooms[z];
        if (!isOverflowing()) return;
      }

      // (4) LAST RESORT only: keep 210mm width, increase page height
      var rect = contentEl.getBoundingClientRect();
      var neededMm = Math.ceil(52.4 + (rect.height / 3.779527559) + 62);
      if (neededMm > 297) {
        var styleEl = document.createElement('style');
        styleEl.innerHTML = '@page { size: 210mm ' + neededMm + 'mm !important; margin: 0; }' +
                            'table.lh-doc { min-height: ' + neededMm + 'mm !important; }' +
                            '.lh-footer-fixed { position: fixed; bottom: 0; }';
        document.head.appendChild(styleEl);
      }
    }

    function splitTable(table, numCols) {
      var parent = table.parentElement;
      if (!parent) return;

      var origRows = table.__origRows;
      if (!origRows) {
        origRows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
        table.__origRows = origRows;
      }

      var container = document.querySelector('.lh-multicol-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'lh-multicol-container';
        container.style.display = 'flex';
        container.style.gap = '8px';
        container.style.width = '100%';
        parent.insertBefore(container, table);
        table.style.display = 'none';
      } else {
        container.innerHTML = '';
      }

      var rowsPerCol = Math.ceil(origRows.length / numCols);
      for (var col = 0; col < numCols; col++) {
        var subTable = document.createElement('table');
        subTable.className = 'lh-table lh-subtable';
        subTable.style.flex = '1';
        subTable.style.fontSize = '8pt';
        subTable.style.marginBottom = '0';
        subTable.innerHTML = '<thead><tr style=\"background:#f1f5f9;\"><th style=\"width:24px;text-align:center;padding:2px 3px;\">#</th><th style=\"padding:2px 3px;\">Due Date</th><th style=\"text-align:right;padding:2px 3px;\">Amount</th><th style=\"text-align:center;padding:2px 3px;\">Status</th></tr></thead><tbody></tbody>';
        var tbody = subTable.querySelector('tbody');

        var start = col * rowsPerCol;
        var end = Math.min(start + rowsPerCol, origRows.length);
        for (var r = start; r < end; r++) {
          var clone = origRows[r].cloneNode(true);
          var tds = clone.querySelectorAll('td');
          if (tds.length >= 4) {
            tds[0].style.padding = '2px 3px';
            tds[1].style.padding = '2px 3px';
            tds[2].style.padding = '2px 3px';
            tds[3].style.padding = '2px 3px';
            if (tds.length > 4) {
              tds[4].parentNode.removeChild(tds[4]);
            }
          }
          tbody.appendChild(clone);
        }
        container.appendChild(subTable);
      }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      fit();
    } else {
      window.addEventListener('DOMContentLoaded', fit);
    }
  })();
  </script>
`;

function buildReceiptHalfHTML(
  data: ReceiptItem,
  title: string,
  copyLabel: string,
  isCustomer: boolean,
  headerImgUrl: string,
  logoImgUrl: string
): string {
  const words = data.amountInWords || numberToWords(data.amount);
  const blockText = data.block ? `Block ${data.block}` : '';
  const plotDesc = [data.plotNo, blockText].filter(Boolean).join(', ');

  return `
    <div class="lh-receipt-half">
      <img class="lh-receipt-header-img" src="${headerImgUrl}" alt="Header" />
      <div class="lh-receipt-title-row">
        <div style="width:70px;"></div>
        <div class="lh-receipt-title">${title}</div>
        <div class="lh-receipt-chip${isCustomer ? ' customer' : ''}">${copyLabel}</div>
      </div>

      <table class="lh-receipt-table">
        <tr>
          <td class="lh-receipt-label">Receipt #:</td>
          <td class="lh-receipt-val" style="font-weight:bold;color:#1a3c6e;">${data.receiptNo}</td>
          <td class="lh-receipt-label">Date:</td>
          <td class="lh-receipt-val">${fmtDateStr(data.date)}</td>
        </tr>
        <tr>
          <td class="lh-receipt-label">Customer Name:</td>
          <td class="lh-receipt-val" style="font-weight:bold;">${data.customerName}</td>
          <td class="lh-receipt-label">Father Name:</td>
          <td class="lh-receipt-val">${data.fatherName || '-'}</td>
        </tr>
        <tr>
          <td class="lh-receipt-label">Plot Details:</td>
          <td class="lh-receipt-val" style="font-weight:bold;color:#1a3c6e;">${plotDesc}</td>
          <td class="lh-receipt-label">Project:</td>
          <td class="lh-receipt-val">${data.projectName}</td>
        </tr>
        <tr>
          <td class="lh-receipt-label">Payment Type:</td>
          <td class="lh-receipt-val" style="font-weight:600;">${data.paymentType}</td>
          <td class="lh-receipt-label">Payment Method:</td>
          <td class="lh-receipt-val">${data.paymentMethod}${data.bankName ? ` (${data.bankName})` : ''}</td>
        </tr>
        <tr>
          <td class="lh-receipt-label">Amount Received:</td>
          <td class="lh-receipt-val" style="font-weight:bold;font-size:10pt;color:#1a3c6e;">Rs. ${fmtNumber(data.amount)}</td>
          <td class="lh-receipt-label">Remaining Balance:</td>
          <td class="lh-receipt-val" style="font-weight:bold;color:#dc2626;">Rs. ${fmtNumber(data.remainingBalance)}</td>
        </tr>
        <tr>
          <td class="lh-receipt-label">Amount in Words:</td>
          <td colspan="3" class="lh-receipt-val" style="font-style:italic;font-weight:600;color:#334155;">${words}</td>
        </tr>
      </table>

      <div class="lh-receipt-footer">
        <div class="lh-receipt-footer-lines">
          <div>${APPLICANT_LABEL} <span class="lh-receipt-line"></span></div>
          <div style="margin-top:1.5mm;">${OFFICER_LABEL} <span class="lh-receipt-line"></span></div>
        </div>
        <img class="lh-receipt-logo" src="${logoImgUrl}" alt="SK Logo" />
      </div>
    </div>
  `;
}

function buildReceiptPairHTML(receiptTitle: string, data: ReceiptItem, headerCompactUrl: string, logoImgUrl: string): string {
  const scissorsSvg = `
    <svg class="lh-cut-scissors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  `;

  const topHalf = buildReceiptHalfHTML(data, receiptTitle, 'Customer Copy', true, headerCompactUrl, logoImgUrl);
  const bottomHalf = buildReceiptHalfHTML(data, receiptTitle, 'Office Copy', false, headerCompactUrl, logoImgUrl);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${receiptTitle}</title>
  <style>
${LETTERHEAD_CSS}
  </style>
</head>
<body>
  <div class="lh-page-origin" style="height:297mm;overflow:hidden;position:relative;">
    ${topHalf}
    <div class="lh-cut-line">
      ${scissorsSvg}
      <div class="lh-cut-dashed"></div>
    </div>
    ${bottomHalf}
  </div>
</body>
</html>`;
}

function buildReportDocumentHTML(opt: ReportOptions, headerCompactUrl: string, logoImgUrl: string): string {
  const isLandscape = opt.headers.length > 8;
  const printDateStr = opt.printDate || fmtDateStr(new Date());
  const printedByStr = opt.printedBy ? ` by ${opt.printedBy}` : '';
  const subtitleLine = `${opt.subtitle ? opt.subtitle + ' | ' : ''}Printed on ${printDateStr}${printedByStr}`;

  const theadCols = opt.headers.map((h) => `<th>${h}</th>`).join('');
  const tbodyRows = opt.rows.map((row) => {
    const tds = row.map((cell) => `<td>${cell !== undefined && cell !== null ? cell : ''}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const totalsHtml = opt.totalsRow
    ? `<tr class="lh-report-totals-row">${opt.totalsRow.map((c) => `<td>${c !== undefined && c !== null ? c : ''}</td>`).join('')}</tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${opt.title || 'Report'}</title>
  <style>
${LETTERHEAD_CSS}
${isLandscape ? `
  @page {
    size: A4 landscape;
    margin: 0;
  }
  html, body, .lh-page-origin {
    width: 297mm !important;
  }
` : ''}
  </style>
</head>
<body>
  <div class="lh-page-origin ${isLandscape ? 'landscape' : ''}">
    <table class="lh-report-table-doc" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <td style="padding:0;">
            <img class="lh-report-header-img" src="${headerCompactUrl}" alt="Header" />
            <div class="lh-report-title">${opt.title}</div>
            <div class="lh-report-sub">${subtitleLine}</div>
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td style="padding:0;">
            <div class="lh-report-footer-wrap">
              <div class="lh-report-footer-lines">
                <div>${REPORT_FOOTER_LABELS.preparedBy} <span class="lh-report-footer-line"></span></div>
                <div style="margin-top:1.5mm;">${REPORT_FOOTER_LABELS.officer} <span class="lh-report-footer-line"></span></div>
              </div>
              <img class="lh-report-logo" src="${logoImgUrl}" alt="SK Logo" />
            </div>
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td style="padding:4mm 10mm;">
            <table class="lh-report-table">
              <thead>
                <tr>${theadCols}</tr>
              </thead>
              <tbody>
                ${tbodyRows}
                ${totalsHtml}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

export function buildLetterheadDocument(options: BuildLetterheadOptions): string {
  const origin = getOrigin();
  const headerImgUrl = origin
    ? new URL('/brand/letterhead/letterhead-header.png', origin).href
    : '/brand/letterhead/letterhead-header.png';
  const headerCompactUrl = origin
    ? new URL('/brand/letterhead/letterhead-header-compact.png', origin).href
    : '/brand/letterhead/letterhead-header-compact.png';
  const logoImgUrl = origin
    ? new URL('/brand/letterhead/sk-logo-gray.png', origin).href
    : '/brand/letterhead/sk-logo-gray.png';

  // Handle receipt-pair layout
  if (options.layout === 'receipt-pair' && options.receipt) {
    return buildReceiptPairHTML(options.receipt.title, options.receipt.data, headerCompactUrl, logoImgUrl);
  }

  // Handle report layout
  if (options.layout === 'report' && options.report) {
    return buildReportDocumentHTML(options.report, headerCompactUrl, logoImgUrl);
  }

  // Handle standard 'document' layout
  const { sections = [], repeatFooter = true, fitOnePage = false } = options;
  const section0 = sections[0] || { title: '', bodyHtml: '' };
  const isLong = section0.title.length > 25;

  let bodyContent = `
    <div class="lh-section lh-section-first">
      <div class="lh-content">
        ${section0.bodyHtml}
      </div>
    </div>
  `;

  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    bodyContent += `
      <div class="lh-section-break"></div>
      <div class="lh-section">
        <div class="lh-section-title">${sec.title}</div>
        <div class="lh-content">
          ${sec.bodyHtml}
        </div>
      </div>
    `;
  }

  const footerFixedMarkup = repeatFooter
    ? `
      <div class="lh-footer-fixed">
        <div class="lh-sig-title">${SIGNATURES_LABEL}</div>
        <div class="lh-applicant-row">${APPLICANT_LABEL} <span class="lh-blank-line"></span></div>
        <div class="lh-nominee-row">${NOMINEE_LABEL} <span class="lh-blank-line"></span></div>
        <div class="lh-officer-row">${OFFICER_LABEL} <span class="lh-blank-line"></span></div>
        <div class="lh-logo-wrap">
          <img class="lh-footer-logo" src="${logoImgUrl}" alt="SK Logo" />
        </div>
      </div>
    `
    : '';

  const footerSpacerMarkup = repeatFooter
    ? `
      <tfoot>
        <tr>
          <td>
            <div class="lh-footer-spacer"></div>
          </td>
        </tr>
      </tfoot>
    `
    : '';

  const fitScript = fitOnePage ? FIT_ONE_PAGE_SCRIPT : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${section0.title || 'Document'}</title>
  <style>
${LETTERHEAD_CSS}
  </style>
</head>
<body>
  <div class="lh-page-origin">
    <div class="lh-notch-title ${isLong ? 'lh-title-sm' : ''}">${section0.title}</div>
    ${footerFixedMarkup}
    <table class="lh-doc">
      <thead>
        <tr>
          <td>
            <div class="lh-header-wrap">
              <img class="lh-header-img" src="${headerImgUrl}" alt="Letterhead Header" />
            </div>
          </td>
        </tr>
      </thead>
      ${footerSpacerMarkup}
      <tbody>
        <tr>
          <td>
            ${bodyContent}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  ${fitScript}
</body>
</html>`;
}
