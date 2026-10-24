import type { Sale, Customer, Plot, Installment, CompanySettings } from '../types';
import { formatCurrency, formatDate } from './formatters';
import { sortInstallments } from './saleCalc';
import { buildLetterheadDocument } from './letterhead';

export interface ScheduleLayoutResult {
  c: number;
  fontPt: number;
  rh: number;
  isShort: boolean;
  pageHeight: number;
}

/**
 * Computes deterministic layout parameters for the Installment Plan print document:
 * Free content height H = 297 - 52.4 (header) - 58 (footer) - 8 (padding) = 178.6 mm
 * Top info cards: ~23 mm
 * Bottom totals strip: ~11 mm
 * Margins/gaps: ~4 mm
 * Table area T = H - 23 - 11 - 4 = 140.6 mm (about 136-140 mm)
 *
 * Row height rh = fontPt * 0.3528 * 1.55 + 0.6 mm
 */
export function computeScheduleLayout(n: number): ScheduleLayoutResult {
  const H = 297 - 52.4 - 58 - 8; // 178.6 mm
  const T = 138.0;               // Table area in mm

  const getRh = (pt: number) => pt * 0.3528 * 1.55 + 0.6;
  const fonts = [9, 8.5, 8, 7.5, 7];

  // Short plans: 5-12 rows
  if (n <= 12) {
    const c = 1;
    const fontPt = 9;
    const rh = 7; // max row height 7 mm
    return { c, fontPt, rh, isShort: true, pageHeight: 297 };
  }

  // Choose smallest c in 1..4 and largest font in [9, 8.5, 8, 7.5, 7] pt such that (ceil(n / c) + 1) * rh <= T
  for (let c = 1; c <= 4; c++) {
    for (const fontPt of fonts) {
      const rh = getRh(fontPt);
      const rowsPerBlock = Math.ceil(n / c) + 1; // include thead header row
      if (rowsPerBlock * rh <= T) {
        return { c, fontPt, rh, isShort: false, pageHeight: 297 };
      }
    }
  }

  // If nothing fits (e.g. 180 rows), keep c = 4, font 7 pt, and increase the page height
  const c = 4;
  const fontPt = 7;
  const rh = getRh(fontPt);
  const rowsPerBlock = Math.ceil(n / c) + 1;
  const tableHeightNeeded = rowsPerBlock * rh;
  const freeNeeded = 23 + 11 + 6 + tableHeightNeeded;
  const pageHeight = Math.ceil(52.4 + 58 + 8 + freeNeeded);
  return { c, fontPt, rh, isShort: false, pageHeight };
}

/**
 * Generates the complete, deterministic Installment Plan HTML document:
 * - Always exactly 1 page
 * - All rows included in c side-by-side equal-width blocks
 * - No big empty gap on short plans
 */
export function generateScheduleDocumentHTML(
  sale: Sale,
  customer: Customer,
  plot: Plot,
  schedule: Installment[],
  company?: CompanySettings
): string {
  const sorted = sortInstallments(schedule);
  const n = sorted.length;
  const layout = computeScheduleLayout(n);
  const { c, fontPt, rh, isShort, pageHeight } = layout;

  const paid = sorted.filter(s => s.status === 'paid');
  const pending = sorted.filter(s => s.status !== 'paid');
  const paidTotal = paid.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
  const pendingTotal = pending.reduce((sum, s) => sum + ((s.amountDue || 0) - (s.amountPaid || 0)), 0);
  const totalPlanAmount = sale.finalPrice || sale.totalPrice || (paidTotal + pendingTotal);

  const totalSemiAnnuals = sorted.filter(s => s.type === 'semi_annual').length;
  const hasTypeColumn = sorted.some(
    s => s.type === 'semi_annual' || s.type === 'on_possession' || s.type === 'down_payment'
  );

  // Top 3 Info Cards (~23 mm height)
  const infoCardsHtml = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; height: 23mm; margin-bottom: 2mm; box-sizing: border-box;">
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2mm 3mm; background: #fff; overflow: hidden; box-sizing: border-box;">
        <div style="font-size: 6.5pt; color: #64748b; text-transform: uppercase; font-weight: bold; line-height: 1;">Customer</div>
        <div style="font-weight: bold; font-size: 9pt; color: #1a3c6e; margin-top: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">${customer.name}</div>
        <div style="font-size: 7.5pt; color: #475569; margin-top: 0.5mm; line-height: 1.2;">${customer.customerId || ''} | ${customer.phone || ''}</div>
      </div>
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2mm 3mm; background: #fff; overflow: hidden; box-sizing: border-box;">
        <div style="font-size: 6.5pt; color: #64748b; text-transform: uppercase; font-weight: bold; line-height: 1;">Plot Details</div>
        <div style="font-weight: bold; font-size: 9pt; color: #1a3c6e; margin-top: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">Plot ${plot.plotNumber}, Block ${plot.block}</div>
        <div style="font-size: 7.5pt; color: #475569; margin-top: 0.5mm; line-height: 1.2;">${plot.size} ${plot.sizeUnit} | ${plot.category || 'Standard'}</div>
      </div>
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2mm 3mm; background: #fff; overflow: hidden; box-sizing: border-box;">
        <div style="font-size: 6.5pt; color: #64748b; text-transform: uppercase; font-weight: bold; line-height: 1;">Plan Overview</div>
        <div style="font-weight: bold; font-size: 9pt; color: #1a3c6e; margin-top: 1mm; line-height: 1.2;">${formatCurrency(totalPlanAmount)}</div>
        <div style="font-size: 7.5pt; color: #dc2626; margin-top: 0.5mm; line-height: 1.2;">Remaining: ${formatCurrency(pendingTotal)}</div>
      </div>
    </div>
  `;

  // Render Table Blocks
  const rowsPerBlock = Math.ceil(n / c);
  const padY = isShort ? 1.5 : 0.25;
  const padX = c >= 4 ? 0.7 : 1.2;

  const renderStatus = (entry: Installment) => {
    if (entry.status === 'paid') {
      return '<span style="color:#16a34a;font-weight:bold;">Paid</span>';
    }
    if (entry.status === 'cancelled') {
      return '<span style="color:#dc2626;font-weight:bold;">Cancelled</span>';
    }
    const due = new Date(entry.dueDate);
    if (due < new Date()) {
      return '<span style="color:#dc2626;font-weight:bold;">Overdue</span>';
    }
    return '<span style="color:#64748b;">Pending</span>';
  };

  const renderTypeLabel = (entry: Installment) => {
    if (entry.type === 'semi_annual') {
      const idx = entry.installmentNumber;
      const tot = entry.totalInstallments || totalSemiAnnuals || 6;
      return `Semi-Annual ${idx} of ${tot}`;
    }
    if (entry.type === 'on_possession') return 'On Possession';
    if (entry.type === 'down_payment') return 'Down Payment';
    return 'Monthly';
  };

  const renderNumber = (entry: Installment) => {
    if (entry.type === 'semi_annual') return `#`;
    if (entry.type === 'on_possession') return `Poss`;
    if (entry.type === 'down_payment') return `DP`;
    return `#${entry.installmentNumber}`;
  };

  const blocks: string[] = [];

  for (let b = 0; b < c; b++) {
    const chunk = sorted.slice(b * rowsPerBlock, (b + 1) * rowsPerBlock);
    if (chunk.length === 0) continue;

    const thead = hasTypeColumn
      ? `<thead>
          <tr style="background:#f1f5f9;height:${rh}mm;border-bottom:1.5px solid #cbd5e1;">
            <th style="padding:${padY}mm ${padX}mm;text-align:center;width:12%;font-size:${fontPt}pt;">No.</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:left;width:28%;font-size:${fontPt}pt;">Type</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:center;width:22%;font-size:${fontPt}pt;">Due date</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:right;width:22%;font-size:${fontPt}pt;">Amount</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:center;width:16%;font-size:${fontPt}pt;">Status</th>
          </tr>
        </thead>`
      : `<thead>
          <tr style="background:#f1f5f9;height:${rh}mm;border-bottom:1.5px solid #cbd5e1;">
            <th style="padding:${padY}mm ${padX}mm;text-align:center;width:14%;font-size:${fontPt}pt;">No.</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:center;width:30%;font-size:${fontPt}pt;">Due date</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:right;width:34%;font-size:${fontPt}pt;">Amount</th>
            <th style="padding:${padY}mm ${padX}mm;text-align:center;width:22%;font-size:${fontPt}pt;">Status</th>
          </tr>
        </thead>`;

    const tbodyRows = chunk.map(row => {
      const isSemi = row.type === 'semi_annual';
      const bgStyle = isSemi ? 'background:#fffbeb;' : '';
      const borderStyle = 'border-bottom:1px solid #e2e8f0;';

      if (hasTypeColumn) {
        return `
          <tr style="height:${rh}mm;box-sizing:border-box;${borderStyle}${bgStyle}">
            <td style="padding:${padY}mm ${padX}mm;text-align:center;font-weight:bold;white-space:nowrap;">${renderNumber(row)}</td>
            <td style="padding:${padY}mm ${padX}mm;text-align:left;white-space:nowrap;font-weight:${isSemi ? 'bold' : 'normal'};color:${isSemi ? '#b45309' : '#1e293b'};">${renderTypeLabel(row)}</td>
            <td style="padding:${padY}mm ${padX}mm;text-align:center;white-space:nowrap;">${formatDate(row.dueDate)}</td>
            <td style="padding:${padY}mm ${padX}mm;text-align:right;font-weight:bold;white-space:nowrap;">${formatCurrency(row.amountDue)}</td>
            <td style="padding:${padY}mm ${padX}mm;text-align:center;white-space:nowrap;">${renderStatus(row)}</td>
          </tr>
        `;
      }

      return `
        <tr style="height:${rh}mm;box-sizing:border-box;${borderStyle}${bgStyle}">
          <td style="padding:${padY}mm ${padX}mm;text-align:center;font-weight:bold;white-space:nowrap;">${renderNumber(row)}</td>
          <td style="padding:${padY}mm ${padX}mm;text-align:center;white-space:nowrap;">${formatDate(row.dueDate)}</td>
          <td style="padding:${padY}mm ${padX}mm;text-align:right;font-weight:bold;white-space:nowrap;">${formatCurrency(row.amountDue)}</td>
          <td style="padding:${padY}mm ${padX}mm;text-align:center;white-space:nowrap;">${renderStatus(row)}</td>
        </tr>
      `;
    }).join('');

    blocks.push(`
      <div style="flex:1;min-width:0;">
        <table style="width:100%;border-collapse:collapse;font-size:${fontPt}pt;line-height:1.25;">
          ${thead}
          <tbody>
            ${tbodyRows}
          </tbody>
        </table>
      </div>
    `);
  }

  // Short plan vertical centering
  let tableWrapperStyle = 'width:100%;';
  if (isShort) {
    const tableHeightMm = (n + 1) * rh;
    const T = 138.0;
    const freeSpace = Math.max(0, T - tableHeightMm);
    const vertMargin = Math.floor(freeSpace / 2);
    tableWrapperStyle += `margin-top:${vertMargin}mm;margin-bottom:${vertMargin}mm;`;
  }

  const tableAreaHtml = `
    <div style="${tableWrapperStyle}">
      <div style="display:flex;gap:3mm;width:100%;align-items:flex-start;">
        ${blocks.join('')}
      </div>
    </div>
  `;

  // Bottom Totals Strip (~11 mm height)
  const totalsStripHtml = `
    <div style="height:11mm;display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;padding:1.5mm 3mm;align-items:center;box-sizing:border-box;margin-top:2mm;font-size:${Math.max(7.5, fontPt)}pt;">
      <div>
        <span style="color:#64748b;font-size:6.5pt;text-transform:uppercase;font-weight:bold;display:block;line-height:1;">Total Paid</span>
        <span style="font-weight:bold;color:#16a34a;font-size:${Math.max(7.5, fontPt)}pt;line-height:1.2;">${formatCurrency(paidTotal)}</span>
      </div>
      <div>
        <span style="color:#64748b;font-size:6.5pt;text-transform:uppercase;font-weight:bold;display:block;line-height:1;">Remaining Balance</span>
        <span style="font-weight:bold;color:#dc2626;font-size:${Math.max(7.5, fontPt)}pt;line-height:1.2;">${formatCurrency(pendingTotal)}</span>
      </div>
      <div>
        <span style="color:#64748b;font-size:6.5pt;text-transform:uppercase;font-weight:bold;display:block;line-height:1;">Plan Total</span>
        <span style="font-weight:bold;color:#1a3c6e;font-size:${Math.max(7.5, fontPt)}pt;line-height:1.2;">${formatCurrency(totalPlanAmount)}</span>
      </div>
      <div>
        <span style="color:#64748b;font-size:6.5pt;text-transform:uppercase;font-weight:bold;display:block;line-height:1;">Installments</span>
        <span style="font-weight:bold;color:#1e293b;font-size:${Math.max(7.5, fontPt)}pt;line-height:1.2;">${paid.length} Paid / ${sorted.length} Total</span>
      </div>
    </div>
  `;

  const styleOverrides = `
    <style>
      .lh-content { padding: 3mm 14mm 0 14mm !important; }
      .lh-footer-spacer { height: 58mm !important; }
      .lh-footer-fixed { height: 58mm !important; }
    </style>
  `;

  const bodyHtml = `
    ${styleOverrides}
    ${infoCardsHtml}
    ${tableAreaHtml}
    ${totalsStripHtml}
  `;

  return buildLetterheadDocument({
    fitOnePage: false,
    pageHeightMm: pageHeight !== 297 ? pageHeight : undefined,
    sections: [
      { title: 'Installment Plan', bodyHtml }
    ]
  });
}
