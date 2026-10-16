const fs = require('fs');
let content = fs.readFileSync('src/pages/sales/AssignPlot.tsx', 'utf8');

// 1. Down Payment JSX
const dpRegex = /              <FormField label="Down Payment %" required error=\{errors\.downPaymentPercent\}>[\s\S]*?<\/FormField>\s*<\/div>/;
const newDp = `              <FormField label="Down Payment %" required error={errors.downPaymentPercent}>
                <div className="relative">
                  <input
                    className={\`input-field \${errors.downPaymentPercent ? 'input-error' : ''}\`}
                    type="number"
                    value={downPaymentPercent || ''}
                    onChange={e => onPercentChange(Number(e.target.value))}
                    min="0" max="100" step="0.1"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                </div>
              </FormField>

              <FormField label="Down Payment Amount (Rs.)" required error={errors.downPaymentAmount}>
                <input
                  className={\`input-field font-semibold \${errors.downPaymentAmount ? 'input-error' : ''}\`}
                  type="number"
                  value={downPaymentAmount || ''}
                  onChange={e => onAmountChange(Number(e.target.value))}
                  min="0" max={finalPrice}
                />
                {downPaymentAmount > 0 && <div className="text-xs text-slate-500 mt-1">Rs. {formatCurrency(downPaymentAmount)}</div>}
              </FormField>
            </div>`;
content = content.replace(dpRegex, newDp);

// 2. Custom Installment Plan header for planMonths and Remaining Indicator
const planHeaderRegex = /          <div className="flex items-center justify-between">\s*<h3 className="form-section-header mb-0">Custom Installment Plan<\/h3>\s*<button\s*type="button"\s*onClick=\{addRow\}[\s\S]*?<\/button>\s*<\/div>/;
const newPlanHeader = `          <div className="flex items-center justify-between mb-2">
            <h3 className="form-section-header mb-0">Custom Installment Plan</h3>
            <div className="flex gap-2">
              <button type="button" onClick={balanceLastRow} className="btn btn-secondary py-1.5 text-xs">
                Balance last row
              </button>
              <button type="button" onClick={addRow} className="btn btn-primary py-1.5 text-xs flex items-center gap-1">
                <Plus size={14} /> Add Row
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField label="Total plan duration (months)">
              <input type="number" className="input-field" value={planMonths} onChange={e => setPlanMonths(Number(e.target.value))} min="1" />
            </FormField>
            
            <div className="flex flex-col justify-end pb-2">
              {(() => {
                const usedAmount = rows.reduce((sum, r) => sum + r.totalAmount, 0);
                const semiTotal = semiAnnualEnabled ? Math.floor(planMonths / 6) * semiAnnualAmount : 0;
                const remain = remainingForInstallments - semiTotal - usedAmount;
                let colorClass = 'text-green-600';
                if (remain > 0) colorClass = 'text-amber-600';
                if (remain < 0) colorClass = 'text-red-600';
                return (
                  <div className={\`font-bold \${colorClass} transition-colors duration-300\`}>
                    Remaining to allocate: Rs. {formatCurrency(remain)}
                  </div>
                );
              })()}
            </div>
          </div>`;
content = content.replace(planHeaderRegex, newPlanHeader);

// 3. Edit Rows JSX
const rowJsxRegex = /                    <td className="p-2">\s*<input\s*type="number"[\s\S]*?readOnly[\s\S]*?<\/td>/;
const newRowJsx = `                    <td className="p-2">
                      <input
                        type="number"
                        className="input-field py-1"
                        value={row.totalAmount || ''}
                        onChange={e => updateRow(row.id, 'totalAmount', Number(e.target.value))}
                        min="0"
                      />
                    </td>`;
content = content.replace(rowJsxRegex, newRowJsx);

// Wait, the row inputs have \`readOnly\` and \`value={row.totalAmount > 0 ? formatCurrency(row.totalAmount) : '—'}\`
// Let's accurately replace the totalAmount td.
const totalTdRegex = /<td className="p-2">\s*<input\s*type="text"[\s\S]*?value=\{row\.totalAmount > 0 \? formatCurrency\(row\.totalAmount\) : '—'\}[\s\S]*?readOnly[\s\S]*?<\/td>/;
content = content.replace(totalTdRegex, newRowJsx);

// Wait, the monthlyAmount td might also need checking if it has any issue. Let's just do totalAmount.
// What about the semiAnnual math?
// Plan math updated: totalMonths = sum(row.months); exactMonthlyTotal = sum(row.totalAmount); 
// semiAnnualCount = semiAnnualEnabled ? Math.floor(totalMonths / 6) : 0; 
// semiAnnualTotal = semiAnnualCount * semiAnnualAmount; 
// difference = Math.abs(exactMonthlyTotal + semiAnnualTotal - remainingForInstallments);

const summaryRegex = /                  const totalMonths = rows\.reduce\(\(s, r\) => s \+ r\.months, 0\);[\s\S]*?const planValid = isExact \|\| isRounding;/;
const newSummary = `                  const totalMonths = rows.reduce((s, r) => s + r.months, 0);
                  const exactMonthlyTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
                  const semiAnnualCount = semiAnnualEnabled ? Math.floor(totalMonths / 6) : 0;
                  const semiAnnualTotal = semiAnnualCount * semiAnnualAmount;
                  const grandTotal = exactMonthlyTotal;
                  
                  const diffRaw = exactMonthlyTotal + semiAnnualTotal - remainingForInstallments;
                  const difference = Math.abs(diffRaw);
                  
                  const isExact = difference < 1;
                  const isRounding = difference >= 1 && difference <= 100;
                  const isMismatch = difference > 100;
                  const planValid = isExact || isRounding;`;
content = content.replace(summaryRegex, newSummary);

fs.writeFileSync('src/pages/sales/AssignPlot.tsx', content, 'utf8');
console.log("Done");
