import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/utils/printUtils.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Ensure sortInstallments is imported from ./saleCalc
if (!content.includes('sortInstallments')) {
  content = content.replace(
    "import { formatCurrency, formatDate } from './formatters';",
    "import { formatCurrency, formatDate } from './formatters';\nimport { sortInstallments } from './saleCalc';"
  );
}

const scheduleRegex = /export function generateScheduleHTML\([\s\S]*?return buildLetterheadDocument\(\{[\s\S]*?sections:\s*\[\s*\{\s*title:\s*'Installment Plan',\s*bodyHtml:\s*content\s*\}\s*\]\s*\}\);\s*\}/;

const replacement = `export function generateScheduleHTML(
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

  const row = (entry: Installment) => \`
    <tr>
      <td style="text-align:center;font-weight:bold;">\${numLabel(entry)}</td>
      <td style="font-weight:600;">\${typeColumnLabel(entry)}</td>
      <td>\${fmtDate(entry.dueDate)}</td>
      <td style="text-align:right;font-weight:bold;">\${fmtAmt(entry.amountDue)}</td>
      <td style="text-align:center;">\${statusBadge(entry)}</td>
      <td style="text-align:center;">\${entry.status === 'paid' ? fmtDate(entry.paymentDate) : '-'}</td>
    </tr>
  \`;

  const thead = '<thead><tr style="background:#f1f5f9;"><th style="width:44px;text-align:center;">#</th><th>Type</th><th>Due Date</th><th style="text-align:right;">Amount</th><th style="text-align:center;">Status</th><th style="text-align:center;">Paid Date</th></tr></thead>';

  const content = \`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Customer</div>
        <div style="font-weight:bold;font-size:10.5pt;color:#1a3c6e;margin-top:2px;">\${customer.name}</div>
        <div style="font-size:9pt;color:#64748b;">\${customer.customerId} | \${customer.phone}</div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Plot Details</div>
        <div style="font-weight:bold;font-size:10.5pt;color:#1a3c6e;margin-top:2px;">\${plot.plotNumber}, Block \${plot.block}</div>
        <div style="font-size:9pt;color:#64748b;">\${plot.size} \${plot.sizeUnit} | \${plot.category}</div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;">
        <div style="font-size:8.5pt;color:#64748b;text-transform:uppercase;font-weight:bold;">Plan Overview</div>
        <div style="font-weight:bold;font-size:10.5pt;color:#1a3c6e;margin-top:2px;">\${fmtAmt(sale.totalPrice)}</div>
        <div style="font-size:9pt;color:#dc2626;">Remaining: \${fmtAmt(pendingTotal)}</div>
      </div>
    </div>

    <table class="lh-table lh-installment-table">
      \${thead}
      <tbody>
        \${sorted.map(row).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;font-weight:bold;">
          <td colspan="3" style="padding:6px 8px;">TOTAL PAID (\${paid.length} installments)</td>
          <td style="text-align:right;color:#16a34a;">\${fmtAmt(paidTotal)}</td>
          <td colspan="2"></td>
        </tr>
        <tr style="background:#f1f5f9;font-weight:bold;">
          <td colspan="3" style="padding:6px 8px;">REMAINING BALANCE (\${pending.length} installments)</td>
          <td style="text-align:right;color:#dc2626;">\${fmtAmt(pendingTotal)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  \`;

  return buildLetterheadDocument({
    fitOnePage: true,
    sections: [
      { title: 'Installment Plan', bodyHtml: content }
    ]
  });
}`;

if (!scheduleRegex.test(content)) {
  console.error('Regex for generateScheduleHTML failed in src/utils/printUtils.ts');
  process.exit(1);
}

content = content.replace(scheduleRegex, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated generateScheduleHTML with Type column and sortInstallments');
