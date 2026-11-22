'use strict';
const ExcelJS = require('exceljs');
const { fmtDate } = require('./dates');

/** Convert a report object ({title, subtitle, columns, rows, totals, summary, notes}) into an .xlsx buffer. */
async function reportToXlsx(rep, companyName = 'FAISAL HOMES') {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();
  const ws = wb.addWorksheet(rep.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), { views: [{ state: 'frozen', ySplit: 4 }] });
  const n = rep.columns.length;
  ws.mergeCells(1, 1, 1, Math.max(n, 2));
  ws.getCell(1, 1).value = `${companyName} — ${rep.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF0B2545' } };
  ws.mergeCells(2, 1, 2, Math.max(n, 2));
  ws.getCell(2, 1).value = rep.subtitle || '';
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF5B6573' } };
  const headerRow = ws.getRow(4);
  rep.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
    cell.alignment = { vertical: 'middle', horizontal: ['money', 'number'].includes(c.type) ? 'right' : 'left' };
    ws.getColumn(i + 1).width = c.width || (c.type === 'money' ? 16 : c.type === 'date' ? 12 : c.type === 'number' ? 10 : 22);
  });
  const toCell = (c, r) => {
    const v = r[c.key];
    if (v === null || v === undefined || v === '') return null;
    const type = c.type === 'mixed' ? (r.type === 'money' ? 'money' : 'number') : c.type;
    if (type === 'money' || type === 'number') return Number(v);
    if (type === 'date') { const s = String(v).slice(0, 10); const [y, m, d] = s.split('-').map(Number); return y ? new Date(Date.UTC(y, m - 1, d)) : s; }
    return String(v);
  };
  const fmtFor = (c, r) => {
    const type = c.type === 'mixed' ? (r.type === 'money' ? 'money' : 'number') : c.type;
    return type === 'money' ? '#,##0.00' : type === 'date' ? 'dd-mm-yyyy' : type === 'number' ? '0.####' : undefined;
  };
  let rowNo = 5;
  for (const r of rep.rows) {
    const row = ws.getRow(rowNo++);
    rep.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = toCell(c, r);
      const f = fmtFor(c, r);
      if (f) cell.numFmt = f;
    });
  }
  if (rep.totals && Object.keys(rep.totals).length) {
    const row = ws.getRow(rowNo++);
    row.getCell(1).value = 'TOTAL';
    rep.columns.forEach((c, i) => {
      if (rep.totals[c.key] !== undefined) { row.getCell(i + 1).value = Number(rep.totals[c.key]); row.getCell(i + 1).numFmt = '#,##0.00'; }
    });
    row.font = { bold: true };
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F5' } }; });
  }
  if (rep.summary?.length) {
    rowNo++;
    ws.getRow(rowNo++).getCell(1).value = 'Summary';
    ws.getRow(rowNo - 1).font = { bold: true };
    for (const s of rep.summary) {
      const row = ws.getRow(rowNo++);
      row.getCell(1).value = s.label;
      row.getCell(2).value = Number(s.value);
      row.getCell(2).numFmt = '#,##0.00';
    }
  }
  if (rep.notes?.length) {
    rowNo++;
    for (const nt of rep.notes) { ws.getRow(rowNo++).getCell(1).value = nt; }
  }
  ws.getRow(3).getCell(1).value = `Generated ${fmtDate(new Date().toISOString())}`;
  ws.getRow(3).getCell(1).font = { size: 8, color: { argb: 'FF888888' } };
  return wb.xlsx.writeBuffer();
}

/** Export several raw tables into one workbook (full data export). */
async function tablesToXlsx(tables) {
  const wb = new ExcelJS.Workbook();
  for (const { name, rows } of tables) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    if (!rows.length) { ws.getCell(1, 1).value = '(no rows)'; continue; }
    const cols = Object.keys(rows[0]);
    ws.addRow(cols).font = { bold: true };
    for (const r of rows) ws.addRow(cols.map((k) => (r[k] !== null && typeof r[k] === 'object' && !(r[k] instanceof Date) ? JSON.stringify(r[k]) : r[k])));
    cols.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { reportToXlsx, tablesToXlsx };
