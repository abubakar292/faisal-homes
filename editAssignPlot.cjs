const fs = require('fs');

let code = fs.readFileSync('src/pages/sales/AssignPlot.tsx', 'utf8');

// Step 1: Rounding fix
code = code.replace(
  /const planValid\s*=\s*Math\.abs\(\(grandTotal \+ semiAnnualTotal\) - remainingForInstallments\) < 1;/,
  `const difference = Math.abs((grandTotal + semiAnnualTotal) - remainingForInstallments);
  const isExact = difference < 1;
  const isRounding = difference >= 1 && difference <= 100;
  const isMismatch = difference > 100;
  const planValid = isExact || isRounding;`
);

code = code.replace(
  /\{\s*remainingForInstallments > 0 && !planValid && \([\s\S]*?Grand total[\s\S]*?≠ Remaining[\s\S]*?<\/div>\s*\)\s*\}/,
  `{remainingForInstallments > 0 && isMismatch && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle size={13} />
                ❌ Difference: Rs. {formatCurrency(difference)} — please adjust. (Grand total: {formatCurrency(grandTotal + semiAnnualTotal)}, Required: {formatCurrency(remainingForInstallments)})
              </div>
            )}
            {remainingForInstallments > 0 && isRounding && (
              <div className="mt-2 flex items-center justify-between gap-1.5 text-xs font-medium text-amber-600">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  ⚠️ Rs. {formatCurrency(difference)} rounding difference (acceptable)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const diff = remainingForInstallments - (grandTotal + semiAnnualTotal);
                    const newRows = [...rows];
                    const lastRow = newRows[newRows.length - 1];
                    lastRow.monthlyAmount = Math.round(lastRow.monthlyAmount + (diff / lastRow.months));
                    lastRow.totalAmount = lastRow.months * lastRow.monthlyAmount;
                    setRows(newRows);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '10px' }}
                >
                  Auto-fix
                </button>
              </div>
            )}`
);

code = code.replace(
  /\{\s*remainingForInstallments > 0 && planValid && \([\s\S]*?✅ Installment plan matches[\s\S]*?<\/div>\s*\)\s*\}/,
  `{remainingForInstallments > 0 && isExact && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-600">
                <CheckCircle size={13} />
                ✅ Perfect match
              </div>
            )}`
);

// Step 2: Dealer dropdown
// Add Dealer import if not there
if (!code.includes('Dealer,')) {
  code = code.replace(/import type \{([^}]+)\}/, 'import type { Dealer, $1 }');
}

// Add state for dealers
code = code.replace(
  /const \[customers,\s*setCustomers\]\s*=\s*useState<Customer\[\]>\(\[\]\);/,
  `const [customers, setCustomers] = useState<Customer[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [selectedDealerId, setSelectedDealerId] = useState('');`
);

// Add dealer fetch to load
code = code.replace(
  /getCollection<Booking>\('bookings'\),/,
  `getCollection<Booking>('bookings'),
      getCollection<Dealer>('dealers'),`
);
code = code.replace(
  /\.then\(\(\[c, p, b\]\) => \{/,
  `.then(([c, p, b, d]) => {
      setDealers(d);`
);

// Replace Dealer Information UI
const oldDealerUI = `        {/* ── Dealer Information (inline, optional) ── */}
        <div className="card space-y-4">
          <h3 className="form-section-header">Dealer Information <span className="text-slate-400 font-normal normal-case">(Optional)</span></h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Dealer Name">
              <input
                className="input-field"
                value={dealerName}
                onChange={e => setDealerName(e.target.value)}
                placeholder="Dealer full name"
              />
            </FormField>

            <FormField label="Dealer Phone">
              <input
                className="input-field"
                value={dealerPhone}
                onChange={e => setDealerPhone(e.target.value)}
                placeholder="03XX-XXXXXXX"
              />
            </FormField>

            <FormField label="Commission %" hint="Applied on Final Price">
              <input
                className="input-field"
                type="number"
                value={dealerCommissionPct || ''}
                onChange={e => setDealerCommissionPct(Number(e.target.value))}
                placeholder="e.g., 2"
                min="0"
                max="100"
                step="0.1"
              />
            </FormField>

            <FormField label="Commission Amount (Rs.)" hint="Auto-calculated, editable">
              <input
                className="input-field font-semibold"
                type="number"
                value={dealerCommissionAmt || ''}
                onChange={e => setDealerCommissionAmt(Number(e.target.value))}
                placeholder="Auto-calculated"
                min="0"
                style={{ color: '#1a3c6e' }}
              />
            </FormField>

            <FormField label="Commission Status">
              <select
                className="input-field"
                value={dealerCommissionStatus}
                onChange={e => setDealerCommissionStatus(e.target.value as 'paid' | 'pending')}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </FormField>
          </div>`;

const newDealerUI = `        {/* ── Dealer Information (inline, optional) ── */}
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="form-section-header mb-0">Dealer Information <span className="text-slate-400 font-normal normal-case">(Optional)</span></h3>
            {selectedDealerId && (
              <button 
                type="button" 
                onClick={() => {
                  setSelectedDealerId('');
                  setDealerName('');
                  setDealerPhone('');
                  setDealerCommissionPct(0);
                  setDealerCommissionAmt(0);
                }} 
                className="text-xs text-red-500 hover:underline"
              >
                ✕ Clear Dealer
              </button>
            )}
          </div>

          <FormField label="Select Dealer">
            <SearchableSelect
              options={[
                { value: '', label: 'No Dealer' },
                ...dealers.map(d => ({ value: d.id, label: \`\${d.name} — \${d.phone}\` }))
              ]}
              value={selectedDealerId}
              onChange={(val) => {
                setSelectedDealerId(val);
                const d = dealers.find(x => x.id === val);
                if (d) {
                  setDealerName(d.name);
                  setDealerPhone(d.phone);
                  setDealerCommissionPct(d.commissionRate || 0);
                  setDealerCommissionAmt((finalPrice * (d.commissionRate || 0)) / 100);
                } else {
                  setDealerName('');
                  setDealerPhone('');
                  setDealerCommissionPct(0);
                  setDealerCommissionAmt(0);
                }
              }}
              placeholder="Search dealer by name or phone..."
            />
          </FormField>

          {selectedDealerId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <FormField label="Dealer Name">
                <input className="input-field bg-slate-100" value={dealerName} readOnly />
              </FormField>

              <FormField label="Dealer Phone">
                <input className="input-field bg-slate-100" value={dealerPhone} readOnly />
              </FormField>

              <FormField label="Commission %">
                <input className="input-field bg-slate-100" type="number" value={dealerCommissionPct || ''} readOnly />
              </FormField>

              <FormField label="Commission Amount (Rs.)">
                <input className="input-field bg-slate-100 font-semibold" type="number" value={dealerCommissionAmt || ''} readOnly style={{ color: '#1a3c6e' }} />
              </FormField>

              <FormField label="Commission Status">
                <select
                  className="input-field"
                  value={dealerCommissionStatus}
                  onChange={e => setDealerCommissionStatus(e.target.value as 'paid' | 'pending')}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </FormField>
            </div>
          )}`;

code = code.replace(oldDealerUI, newDealerUI);

// Step 3: Remaining Down Payment in Installment Schedule
// Add state
code = code.replace(
  /const \[dealerCommissionStatus, setDealerCommissionStatus\] = useState<'pending'\|'paid'>\('pending'\);/,
  `const [dealerCommissionStatus, setDealerCommissionStatus] = useState<'pending'|'paid'>('pending');
  const [includeRemainingDownPayment, setIncludeRemainingDownPayment] = useState(false);`
);

// Toggle UI
const downPaymentUI = `              <input
                type="number"
                className="input-field font-semibold"
                value={remainingDownPayment}
                readOnly
                style={{ background: remainingDownPayment > 0 ? '#fffbeb' : '#f8fafc', color: remainingDownPayment > 0 ? '#b45309' : '#94a3b8' }}
              />`;
              
const downPaymentUINew = `              <input
                type="number"
                className="input-field font-semibold"
                value={remainingDownPayment}
                readOnly
                style={{ background: remainingDownPayment > 0 ? '#fffbeb' : '#f8fafc', color: remainingDownPayment > 0 ? '#b45309' : '#94a3b8' }}
              />
              {remainingDownPayment > 0 && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5" checked={includeRemainingDownPayment} onChange={e => setIncludeRemainingDownPayment(e.target.checked)} />
                  <span className="text-[11px] font-medium text-slate-600">Include in Schedule</span>
                </label>
              )}`;

code = code.replace(downPaymentUI, downPaymentUINew);

// Modify generated installments
code = code.replace(
  /if \(remainingDownPayment > 0\) \{/,
  `if (remainingDownPayment > 0 && includeRemainingDownPayment) {`
);

// Effect on lateFee (Change 4)
code = code.replace(/lateFee: 0,/g, '');
code = code.replace(/lateFee:\s*0,/g, '');

fs.writeFileSync('src/pages/sales/AssignPlot.tsx', code);
console.log('Successfully edited AssignPlot.tsx');
