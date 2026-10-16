const fs = require('fs');

// 1. CompanyInfo.tsx
let company = fs.readFileSync('src/pages/settings/CompanyInfo.tsx', 'utf8');
company = company.replace(/,\s*lateFeePerDay:\s*\d+/, '');
company = company.replace(/<FormField label="Late Fee \/ Day \(Rs\.\)">[\s\S]*?<\/FormField>/, '');
fs.writeFileSync('src/pages/settings/CompanyInfo.tsx', company);

// 2. InstallmentReport.tsx
let instRep = fs.readFileSync('src/pages/reports/InstallmentReport.tsx', 'utf8');
instRep = instRep.replace(/i\.amountPaid, i\.lateFee \|\| 0, i\.paymentMethod \|\| '',/, "i.amountPaid, i.paymentMethod || '',");
instRep = instRep.replace(/<div className="card text-center"><p className="text-xl font-bold text-red-500">\{formatCurrency\(filtered\.reduce\(\(s, i\) => s \+ \(i\.lateFee \|\| 0\), 0\)\)\}<\/p><p className="text-xs text-slate-500 mt-1">Total Late Fees<\/p><\/div>/, '');
instRep = instRep.replace(/<th className="table-th text-right">Late Fee<\/th>/, '');
instRep = instRep.replace(/<td className="table-td text-red-500">\{formatCurrency\(i\.lateFee \|\| 0\)\}<\/td>/, '');
fs.writeFileSync('src/pages/reports/InstallmentReport.tsx', instRep);

// 3. PendingPaymentsReport.tsx
let pendingRep = fs.readFileSync('src/pages/reports/PendingPaymentsReport.tsx', 'utf8');
pendingRep = pendingRep.replace(/const lateFee = days > 0 \? days \* 500 : 0;\s*/, '');
pendingRep = pendingRep.replace(/\$\{lateFee > 0 \? `\\nLate Fee: \$\{formatCurrency\(lateFee\)\}` : ''\}/, '');
fs.writeFileSync('src/pages/reports/PendingPaymentsReport.tsx', pendingRep);

// 4. ReceivePayment.tsx
let receivePay = fs.readFileSync('src/pages/payments/ReceivePayment.tsx', 'utf8');
receivePay = receivePay.replace(/const \[lateFee,\s*setLateFee\]\s*=\s*useState\('0'\);/, '');
receivePay = receivePay.replace(/setLateFee\(days > 0 \? String\(days \* \(comp\?\.lateFeePerDay \|\| 500\)\) : '0'\);/, '');
receivePay = receivePay.replace(/setLateFee\(days > 0 \? String\(days \* \(company\?\.lateFeePerDay \|\| 500\)\) : '0'\);/, '');
receivePay = receivePay.replace(/const totalToPay\s*=\s*\(Number\(amountPaid\) \|\| 0\) \+ \(Number\(lateFee\) \|\| 0\);/, "const totalToPay = (Number(amountPaid) || 0);");
receivePay = receivePay.replace(/lateFee:\s*Number\(lateFee \|\| 0\),/g, 'lateFee: 0,');
receivePay = receivePay.replace(/setLateFee\('0'\);/, '');
receivePay = receivePay.replace(/\[\s*'Late Fee'[^\]]+\]\s*,/, '');
receivePay = receivePay.replace(/<div className="card space-y-4">\s*<h3 className="form-section-header">Fee & Adjustment<\/h3>\s*<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">\s*<FormField label="Late Fee \(Rs\.\)">\s*<input[^>]+value=\{lateFee\}[^>]+onChange=\{e => setLateFee\(e\.target\.value\)\}[^>]+>\s*<\/FormField>\s*<\/div>\s*<\/div>/, '');
fs.writeFileSync('src/pages/payments/ReceivePayment.tsx', receivePay);

console.log('Removed late fees');
