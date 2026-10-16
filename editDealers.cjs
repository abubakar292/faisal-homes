const fs = require('fs');

let addDealer = fs.readFileSync('src/pages/dealers/AddDealer.tsx', 'utf8');

// Remove commissionType, commissionRate
addDealer = addDealer.replace(/commissionType:\s*'percentage',\s*commissionRate:\s*'',\s*/, "");
addDealer = addDealer.replace(/commissionType: d\.commissionType,\s*commissionRate: String\(d\.commissionRate\),\s*/, "");
addDealer = addDealer.replace(/if \(!form\.commissionRate \|\| isNaN\(Number\(form\.commissionRate\)\)\) e\.commissionRate = 'Commission rate required';/, "");
addDealer = addDealer.replace(/commissionType:\s*form\.commissionType\s*as\s*Dealer\['commissionType'\],\s*commissionRate:\s*Number\(form\.commissionRate\),\s*/, "");
addDealer = addDealer.replace(/<FormField label="Commission Type">[\s\S]*?<\/FormField>/g, "");
addDealer = addDealer.replace(/<FormField label="Commission Rate">[\s\S]*?<\/FormField>/g, "");
addDealer = addDealer.replace(/<FormField label="Commission Rate\/\%">[\s\S]*?<\/FormField>/g, "");

fs.writeFileSync('src/pages/dealers/AddDealer.tsx', addDealer);

let dealerList = fs.readFileSync('src/pages/dealers/DealerList.tsx', 'utf8');

// Remove commissionType, commissionRate columns
dealerList = dealerList.replace(/\{\s*key:\s*'commissionType'[\s\S]*?\},/, "");
dealerList = dealerList.replace(/\{\s*key:\s*'commissionRate'[\s\S]*?\},/, "");

fs.writeFileSync('src/pages/dealers/DealerList.tsx', dealerList);

console.log('Fixed Dealers');
