const fs = require('fs');

// 1. types/index.ts
let types = fs.readFileSync('src/types/index.ts', 'utf8');
types = types.replace(/export type UserRole = 'admin' \| 'staff';/, "export type UserRole = 'admin' | 'staff' | 'owner';");
fs.writeFileSync('src/types/index.ts', types);

// 2. ReceivePayment.tsx
let receive = fs.readFileSync('src/pages/payments/ReceivePayment.tsx', 'utf8');
// It seems there's another lateFee field lingering
receive = receive.replace(/<FormField label="Late Fee \(Rs\.\)">[\s\S]*?<\/FormField>/g, '');
// just in case any value={lateFee} is left
receive = receive.replace(/value=\{lateFee\}/g, '');
receive = receive.replace(/onChange=\{e => setLateFee\(e\.target\.value\)\}/g, '');
fs.writeFileSync('src/pages/payments/ReceivePayment.tsx', receive);

// 3. AssignPlot.tsx
let assign = fs.readFileSync('src/pages/sales/AssignPlot.tsx', 'utf8');
// Add lateFee: 0 back to installments
assign = assign.replace(/amountPaid:\s*0,/g, 'amountPaid: 0, lateFee: 0,');
fs.writeFileSync('src/pages/sales/AssignPlot.tsx', assign);

// 4. CompanyInfo.tsx
let company = fs.readFileSync('src/pages/settings/CompanyInfo.tsx', 'utf8');
company = company.replace(/logo: '',\s*website: '',\s*tagline: ''/, "logo: '', website: '', tagline: '', lateFeePerDay: 0");
fs.writeFileSync('src/pages/settings/CompanyInfo.tsx', company);

// 5. printUtils.ts
let print = fs.readFileSync('src/utils/printUtils.ts', 'utf8');
print = print.replace(/customer\.nomineeDetails/g, 'customer.nominee');
fs.writeFileSync('src/utils/printUtils.ts', print);

console.log('Fixed build errors');
