'use strict';
const PDFDocument = require('pdfkit');
const settings = require('./settings');
const { formatPKR, toPaisa } = require('./money');
const { fmtDate, today, dateOf } = require('./dates');
const { amountInWords } = require('./words');
const { getLogo } = require('../routes/public');

const NAVY = '#0b2545';
const GOLD = '#b08d2f';
const GREY = '#5b6573';
const LIGHT = '#eef1f5';
const METHOD = { CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque', OTHER: 'Other' };
const KIND = { BOOKING: 'Booking', DOWN_PAYMENT: 'Down Payment', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-Yearly', YEARLY: 'Yearly', BALLOON: 'Extra', FULL: 'Full', CUSTOM: 'Custom' };

async function context() {
  const all = await settings.getAll();
  const style = all.display?.number_format || 'intl';
  let logo = null;
  try { logo = await getLogo(); } catch (e) { console.error('[pdf] logo not loaded:', e.message); }
  return { company: all.company || {}, receipt: all.receipt || {}, style, logo, money: (v) => formatPKR(v, style) };
}

/** Stream a PDF to the response. builder(doc, ctx) draws the content. */
async function sendPdf(res, filename, builder, download) {
  const ctx = await context();
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: { Title: filename, Author: ctx.company.name || 'FAISAL HOMES' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  doc.pipe(res);
  await builder(doc, ctx);
  footerOnAllPages(doc, ctx);
  doc.end();
}

/** Build a PDF into a Buffer (used by tests and exports). */
async function buildPdf(builder) {
  const ctx = await context();
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((r) => doc.on('end', r));
  await builder(doc, ctx);
  footerOnAllPages(doc, ctx);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

function footerOnAllPages(doc, ctx) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 22;
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(7).fillColor(GREY).text(`${ctx.company.name || 'FAISAL HOMES'} · Printed ${fmtDate(today())}`, 36, bottom, { width: 300, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.width - 136, bottom, { width: 100, align: 'right', lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

function header(doc, ctx, y = 36, { compact = false } = {}) {
  const x = 36;
  const w = doc.page.width - 72;
  let tx = x;
  if (ctx.logo) {
    try { doc.image(ctx.logo, x, y, { fit: compact ? [46, 46] : [58, 58] }); tx = x + (compact ? 54 : 66); } catch (_) { /* bad image: skip */ }
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(compact ? 16 : 20).text(ctx.company.name || 'FAISAL HOMES', tx, y + 2, { width: w - (tx - x) - 150 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GOLD).text(ctx.company.tagline || '', tx, doc.y + 1, { width: w - (tx - x) - 150 });
  const contact = [ctx.company.address, [ctx.company.phone, ctx.company.email].filter(Boolean).join('  ·  '), ctx.company.website].filter(Boolean).join('\n');
  if (contact) doc.fillColor(GREY).fontSize(7.5).text(contact, tx, doc.y + 1, { width: w - (tx - x) - 150 });
  const bottom = Math.max(doc.y, y + (compact ? 46 : 58)) + 6;
  doc.moveTo(x, bottom).lineTo(x + w, bottom).lineWidth(1.5).strokeColor(GOLD).stroke();
  doc.lineWidth(1);
  return bottom + 8;
}

function titleBox(doc, title, subtitle, y) {
  const w = 170; const x = doc.page.width - 36 - w;
  doc.rect(x, y, w, subtitle ? 34 : 24).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text(title, x, y + 6, { width: w, align: 'center' });
  if (subtitle) doc.font('Helvetica').fontSize(7.5).fillColor('#e9d9a6').text(subtitle, x, y + 20, { width: w, align: 'center' });
  doc.fillColor('#000');
}

function kv(doc, items, x, y, w, { labelW = 82, size = 8.5, gap = 3 } = {}) {
  let cy = y;
  for (const [k, v] of items) {
    doc.font('Helvetica').fontSize(size).fillColor(GREY).text(k, x, cy, { width: labelW });
    doc.font('Helvetica-Bold').fillColor('#111').text(v === null || v === undefined || v === '' ? '-' : String(v), x + labelW, cy, { width: w - labelW });
    cy = Math.max(doc.y, cy + size + 2) + gap;
  }
  return cy;
}

function stamp(doc, text, color, x, y) {
  doc.save();
  doc.rotate(-18, { origin: [x, y] });
  doc.font('Helvetica-Bold').fontSize(40).fillColor(color).opacity(0.18).text(text, x - 150, y - 20, { width: 300, align: 'center' });
  doc.restore();
  doc.opacity(1);
}

// ------------------------------------------------------------------- receipt (customer + office copy on one A4)
function receiptCopy(doc, ctx, r, y0, copyLabel, duplicate) {
  const x = 36; const w = doc.page.width - 72;
  let y = header(doc, ctx, y0, { compact: true });
  titleBox(doc, 'PAYMENT RECEIPT', `${copyLabel}${duplicate ? ' · DUPLICATE' : ''}`, y0);
  const isCharge = r.purpose === 'CHARGE';
  const half = (w - 16) / 2;
  const left = [
    ['Receipt No', r.receipt_no], ['Date', fmtDate(r.payment_date)], ['Customer', r.customer_name],
    ['Father Name', r.customer_father_name], ['CNIC', r.customer_cnic], ['Customer ID', r.customer_code],
  ];
  const right = [
    ['Society', r.society_name], ['Block', r.block_name], ['Plot No', `${r.plot_no}${r.street_no ? ` (Street ${r.street_no})` : ''}`],
    ['Plot Size', `${Number(r.size_marla)} Marla`], ['Booking No', r.booking_no], ['Payment For', isCharge ? r.charge_description : 'Plot price / installment'],
  ];
  const y1 = kv(doc, left, x, y, half, { size: 8.3, gap: 2 });
  const y2 = kv(doc, right, x + half + 16, y, half, { size: 8.3, gap: 2 });
  y = Math.max(y1, y2) + 4;

  // amounts box
  const boxH = 64;
  doc.rect(x, y, w, boxH).fill(LIGHT);
  const cols = isCharge
    ? [['Total Plot Price', ctx.money(r.final_price_snapshot)], ['Plot Balance (unchanged)', ctx.money(r.balance_after)], ['Amount Received', ctx.money(r.amount)]]
    : [['Total Plot Price', ctx.money(r.final_price_snapshot)], ['Previous Balance', ctx.money(r.balance_before)], ['Amount Received', ctx.money(r.amount)], ['Remaining Balance', ctx.money(r.balance_after)]];
  const cw = w / cols.length;
  cols.forEach(([k, v], i) => {
    const cx = x + i * cw;
    const big = k === 'Amount Received';
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(k.toUpperCase(), cx + 8, y + 8, { width: cw - 16 });
    doc.font('Helvetica-Bold').fontSize(big ? 14 : 11).fillColor(big ? NAVY : '#111').text(v, cx + 8, y + 22, { width: cw - 16 });
  });
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#333').text(amountInWords(r.amount, ctx.style), x + 8, y + 46, { width: w - 16 });
  y += boxH + 6;
  const pm = `${METHOD[r.method] || r.method}${r.reference_no ? ` · Ref/Cheque: ${r.reference_no}` : ''}${r.bank_name ? ` · ${r.bank_name}` : ''}`;
  y = kv(doc, [['Payment Method', pm], ...(r.notes ? [['Notes', r.notes]] : [])], x, y, w, { labelW: 90, size: 8.3, gap: 2 });

  // signatures
  const sy = y0 + 330;
  const sw = (w - 40) / 3;
  [['Received By', r.created_by_name], ['Customer Signature', ''], [ctx.receipt.signature_label || 'Authorized Signature', '']].forEach(([lbl, name], i) => {
    const sx = x + i * (sw + 20);
    if (name) doc.font('Helvetica').fontSize(8).fillColor('#111').text(name, sx, sy - 12, { width: sw, align: 'center' });
    doc.moveTo(sx, sy).lineTo(sx + sw, sy).strokeColor('#999').stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(lbl, sx, sy + 3, { width: sw, align: 'center' });
  });
  if (ctx.receipt.footer_note) doc.fontSize(6.8).fillColor(GREY).text(ctx.receipt.footer_note, x, sy + 18, { width: w, align: 'center' });
  if (r.status === 'REVERSED') {
    stamp(doc, 'REVERSED', '#c0392b', doc.page.width / 2, y0 + 170);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#c0392b').text(`REVERSED on ${fmtDate(String(r.reversed_at).slice(0, 10))}: ${r.reversal_reason || ''}`, x, sy - 34, { width: w, align: 'center' });
  } else if (duplicate) {
    stamp(doc, 'DUPLICATE', '#7f8c8d', doc.page.width / 2, y0 + 170);
  }
}

function receipt(doc, ctx, r, { duplicate = false } = {}) {
  receiptCopy(doc, ctx, r, 30, 'CUSTOMER COPY', duplicate);
  const mid = doc.page.height / 2;
  doc.save().dash(4, { space: 4 }).moveTo(20, mid).lineTo(doc.page.width - 20, mid).strokeColor('#aaa').stroke().undash().restore();
  doc.fontSize(6.5).fillColor('#aaa').text('cut here', doc.page.width / 2 - 20, mid - 9, { width: 40, align: 'center' });
  receiptCopy(doc, ctx, r, mid + 14, 'OFFICE COPY', duplicate);
}

// ------------------------------------------------------------------- simple table helper
function table(doc, columns, rows, { x = 36, y, width, fontSize = 8, headerFill = NAVY, zebra = true, money } = {}) {
  width = width || doc.page.width - 72;
  const totalW = columns.reduce((s, c) => s + (c.w || 1), 0);
  const ws = columns.map((c) => ((c.w || 1) / totalW) * width);
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const fmt = (c, v) => {
    if (v === null || v === undefined || v === '') return '';
    if (c.type === 'money') return money ? money(v) : String(v);
    if (c.type === 'date') {
      if (v instanceof Date) return fmtDate(dateOf(v));
      return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fmtDate(String(v).slice(0, 10)) : String(v); // e.g. the "TOTAL" label
    }
    if (c.type === 'number') return String(Number(v));
    return String(v);
  };
  const drawHeader = () => {
    doc.font('Helvetica-Bold').fontSize(fontSize);
    // Long headers (e.g. "Remaining Payable") wrap onto a second line instead of being cut off.
    const h = Math.max(fontSize + 10, ...columns.map((c, i) => doc.heightOfString(c.header, { width: ws[i] - 6 }) + 9));
    doc.rect(x, y, width, h).fill(headerFill);
    let cx = x;
    columns.forEach((c, i) => {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#fff')
        .text(c.header, cx + 3, y + 5, { width: ws[i] - 6, align: ['money', 'number'].includes(c.type) ? 'right' : 'left' });
      cx += ws[i];
    });
    y += h;
  };
  drawHeader();
  rows.forEach((r, ri) => {
    const cells = columns.map((c) => (typeof c.get === 'function' ? String(c.get(r) ?? '') : fmt(c, r[c.key])));
    doc.font(r._bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t || ' ', { width: ws[i] - 6 }))) + 6;
    if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top; drawHeader(); }
    if (r._fill) doc.rect(x, y, width, h).fill(r._fill);
    else if (zebra && ri % 2) doc.rect(x, y, width, h).fill('#f6f8fa');
    let cx = x;
    cells.forEach((t, i) => {
      const c = columns[i];
      doc.font(r._bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(r._color || '#111')
        .text(t, cx + 3, y + 3, { width: ws[i] - 6, align: ['money', 'number'].includes(c.type) ? 'right' : 'left' });
      cx += ws[i];
    });
    y += h;
  });
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor('#ccc').stroke();
  return y;
}

// ------------------------------------------------------------------- booking confirmation
function bookingConfirmation(doc, ctx, b, schedule) {
  let y = header(doc, ctx);
  titleBox(doc, 'BOOKING CONFIRMATION', `${b.booking_no} · ${fmtDate(b.booking_date)}`, 36);
  if (b.status === 'CANCELLED') stamp(doc, 'CANCELLED', '#c0392b', doc.page.width / 2, 300);
  const x = 36; const w = doc.page.width - 72; const half = (w - 20) / 2;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('BUYER DETAILS', x, y);
  doc.text('PLOT DETAILS', x + half + 20, y);
  y += 14;
  const feats = [b.is_corner && 'Corner', b.is_main_road && 'Main Road', b.is_park_facing && 'Park Facing'].filter(Boolean).join(', ');
  const y1 = kv(doc, [['Name', b.customer_name], ['Father Name', b.customer_father_name], ['CNIC', b.customer_cnic], ['Mobile', b.customer_mobile],
    ['Address', b.customer_address], ['Customer ID', b.customer_code]], x, y, half);
  const y2 = kv(doc, [['Society', b.society_name], ['Block', b.block_name], ['Plot No', b.plot_no], ['Street', b.street_no], ['Size', `${Number(b.size_marla)} Marla`],
    ['Dimensions', b.front_ft && b.depth_ft ? `${Number(b.front_ft)} ft × ${Number(b.depth_ft)} ft` : null], ['Category', `${b.category}${feats ? ` · ${feats}` : ''}`]], x + half + 20, y, half);
  y = Math.max(y1, y2) + 6;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('PRICE & PAYMENT PLAN', x, y);
  y += 14;
  const planName = { FULL: 'Full Payment', MONTHLY: 'Monthly Installments', QUARTERLY: 'Quarterly Installments', HALF_YEARLY: 'Half-Yearly Installments', YEARLY: 'Yearly Installments', CUSTOM: 'Custom Schedule' }[b.plan_type];
  const y3 = kv(doc, [['Rate per Marla', ctx.money(b.rate_per_marla)], ['Total Price', ctx.money(b.total_price)], ['Discount', ctx.money(b.discount)], ['Final Price', ctx.money(b.final_price)]], x, y, half, { labelW: 95 });
  const y4 = kv(doc, [['Booking Amount', ctx.money(b.booking_amount)], ['Down Payment', ctx.money(b.down_payment)], ['Payment Plan', planName], ['Paid to date', ctx.money(b.paid)], ['Balance', ctx.money(b.balance)]], x + half + 20, y, half, { labelW: 95 });
  y = Math.max(y3, y4) + 8;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('PAYMENT SCHEDULE', x, y);
  y += 14;
  const rows = schedule.map((s) => ({
    ...s,
    status: toPaisa(s.paid_amount) >= toPaisa(s.amount) ? 'Paid' : toPaisa(s.paid_amount) > 0 ? 'Partial' : s.due_date < today() ? 'Overdue' : 'Due',
  }));
  const tot = schedule.reduce((a, s) => a + toPaisa(s.amount), 0);
  const paid = schedule.reduce((a, s) => a + toPaisa(s.paid_amount), 0);
  rows.push({ seq_no: '', label: 'TOTAL', due_date: null, amount: tot / 100, paid_amount: paid / 100, status: '', _bold: true, _fill: LIGHT });
  y = table(doc, [
    { key: 'seq_no', header: '#', w: 0.4 }, { key: 'label', header: 'Description', w: 3 }, { key: 'due_date', header: 'Due Date', type: 'date', w: 1.2 },
    { key: 'amount', header: 'Amount', type: 'money', w: 1.5 }, { key: 'paid_amount', header: 'Paid', type: 'money', w: 1.5 }, { key: 'status', header: 'Status', w: 0.9 },
  ], rows, { y, money: ctx.money, fontSize: 8 });
  y += 12;
  if (ctx.receipt.booking_terms) {
    if (y > doc.page.height - 200) { doc.addPage(); y = 40; }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('TERMS & CONDITIONS', x, y);
    doc.font('Helvetica').fontSize(8).fillColor('#333').text(ctx.receipt.booking_terms, x, doc.y + 3, { width: w });
    y = doc.y + 10;
  }
  if (y > doc.page.height - 110) { doc.addPage(); y = 60; }
  const sy = Math.max(y + 40, doc.page.height - 120);
  const sw = (w - 40) / 3;
  ['Buyer Signature', 'Sales Officer', ctx.receipt.signature_label || 'Authorized Signature'].forEach((lbl, i) => {
    const sx = x + i * (sw + 20);
    doc.moveTo(sx, sy).lineTo(sx + sw, sy).strokeColor('#999').stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(lbl, sx, sy + 4, { width: sw, align: 'center' });
  });
}

// ------------------------------------------------------------------- transfer letter
function transferLetter(doc, ctx, t) {
  let y = header(doc, ctx);
  titleBox(doc, 'PLOT TRANSFER LETTER', `${t.transfer_no} · ${fmtDate(t.transfer_date)}`, 36);
  const x = 36; const w = doc.page.width - 72;
  y += 6;
  doc.font('Helvetica').fontSize(10).fillColor('#111').text(
    `This is to certify that Plot No. ${t.plot_no}${t.street_no ? `, Street ${t.street_no}` : ''}, Block ${t.block_name}, ${t.society_name}, measuring ${Number(t.size_marla)} Marla `
    + `(Booking No. ${t.booking_no}), previously held by ${t.from_name}${t.from_father_name ? ` S/O ${t.from_father_name}` : ''} (CNIC ${t.from_cnic}), `
    + `has been transferred to ${t.to_name}${t.to_father_name ? ` S/O ${t.to_father_name}` : ''} (CNIC ${t.to_cnic}) with effect from ${fmtDate(t.transfer_date)}.`,
    x, y, { width: w, align: 'justify', lineGap: 3 });
  y = doc.y + 14;
  const half = (w - 20) / 2;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('TRANSFEROR (PREVIOUS OWNER)', x, y);
  doc.text('TRANSFEREE (NEW OWNER)', x + half + 20, y);
  y += 14;
  const y1 = kv(doc, [['Name', t.from_name], ['Father Name', t.from_father_name], ['CNIC', t.from_cnic], ['Mobile', t.from_mobile], ['Address', t.from_address], ['Customer ID', t.from_code]], x, y, half);
  const y2 = kv(doc, [['Name', t.to_name], ['Father Name', t.to_father_name], ['CNIC', t.to_cnic], ['Mobile', t.to_mobile], ['Address', t.to_address], ['Customer ID', t.to_code]], x + half + 20, y, half);
  y = Math.max(y1, y2) + 8;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('FINANCIAL STATUS AT TRANSFER', x, y);
  y += 14;
  y = kv(doc, [['Total Plot Price', ctx.money(t.final_price)], ['Amount Paid', ctx.money(t.paid_at_transfer)], ['Remaining Balance', ctx.money(t.balance_at_transfer)],
    ['Overdue at Transfer', ctx.money(t.overdue_at_transfer)], ['Transfer Fee', ctx.money(t.transfer_fee)], ['Fee Paid By', t.fee_paid_by === 'TO' ? 'Transferee' : 'Transferor']], x, y, w, { labelW: 140 });
  if (t.dues_override) {
    y += 4;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#a04000').text(`Transfer approved with pending dues. Reason: ${t.override_reason}`, x, y, { width: w });
    y = doc.y + 4;
  }
  y += 6;
  doc.font('Helvetica').fontSize(9).fillColor('#111').text(
    'The transferee accepts all terms of the original booking and is responsible for paying the remaining balance and all future installments as per the payment schedule. '
    + 'The transferor has no further claim on the above plot.', x, y, { width: w, align: 'justify', lineGap: 2 });
  if (t.notes) doc.moveDown(0.5).fontSize(8.5).fillColor(GREY).text(`Notes: ${t.notes}`, { width: w });
  const sy = doc.page.height - 180;
  const sw = (w - 40) / 3;
  [['Transferor', t.from_name], ['Transferee', t.to_name], [ctx.receipt.signature_label || 'Authorized Signature', t.approved_by_name]].forEach(([lbl, n], i) => {
    const sx = x + i * (sw + 20);
    doc.moveTo(sx, sy).lineTo(sx + sw, sy).strokeColor('#999').stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`${lbl}${n ? `\n${n}` : ''}`, sx, sy + 4, { width: sw, align: 'center' });
  });
  const wy = sy + 60;
  [['Witness 1', t.witness_1], ['Witness 2', t.witness_2]].forEach(([lbl, n], i) => {
    const sx = x + i * (sw + 20);
    doc.moveTo(sx, wy).lineTo(sx + sw, wy).strokeColor('#999').stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`${lbl}${n ? `: ${n}` : ''}`, sx, wy + 4, { width: sw, align: 'center' });
  });
}

// ------------------------------------------------------------------- generic report
function report(doc, ctx, rep) {
  const many = rep.columns.length > 7;
  let y = header(doc, ctx, doc.page.margins.top, { compact: true });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(rep.title, doc.page.margins.left, y);
  if (rep.subtitle) doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(rep.subtitle);
  y = doc.y + 8;
  const cols = rep.columns.map((c) => ({
    key: c.key, header: c.header, type: c.type === 'mixed' ? 'text' : c.type,
    w: c.type === 'money' ? 1.4 : c.type === 'date' ? 1 : c.type === 'number' ? 0.8 : c.width ? c.width / 12 : 1.6,
    get: c.type === 'mixed' ? (r) => (r.type === 'money' ? ctx.money(r[c.key]) : String(r[c.key])) : undefined,
  }));
  if (rep.columns.some((c) => c.type === 'mixed')) cols.forEach((c) => { if (c.get) c.type = 'number'; });
  const rows = rep.rows.slice();
  if (rep.totals && Object.keys(rep.totals).length) {
    const t = { _bold: true, _fill: LIGHT };
    t[rep.columns[0].key] = 'TOTAL';
    Object.assign(t, rep.totals);
    rows.push(t);
  }
  y = table(doc, cols, rows, { y, x: doc.page.margins.left, width: doc.page.width - doc.page.margins.left - doc.page.margins.right, money: (v) => formatPKR(v, ctx.style, { symbol: false }), fontSize: many ? 7 : 8 });
  if (rep.summary?.length) {
    y += 10;
    if (y > doc.page.height - 120) { doc.addPage(); y = doc.page.margins.top; }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Summary', doc.page.margins.left, y);
    kv(doc, rep.summary.map((s) => [s.label, ctx.money(s.value)]), doc.page.margins.left, doc.y + 4, 360, { labelW: 200 });
  }
  if (rep.notes?.length) {
    doc.moveDown(0.6).font('Helvetica-Oblique').fontSize(7.5).fillColor(GREY);
    rep.notes.forEach((n) => doc.text(n, doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }));
  }
}

/** Reports with many columns are printed landscape (page breaks reuse the document layout). */
async function sendReportPdf(res, filename, rep, download) {
  const ctx = await context();
  const landscape = rep.columns.length > 7;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 30, bufferPages: true, info: { Title: rep.title } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  doc.pipe(res);
  report(doc, ctx, rep);
  footerOnAllPages(doc, ctx);
  doc.end();
}

module.exports = { sendPdf, buildPdf, receipt, bookingConfirmation, transferLetter, sendReportPdf, report, context };
