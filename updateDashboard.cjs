const fs = require('fs');

const file = 'd:/Faisal Homes/faisal-homes/src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
if (!content.includes('isInstallmentOverdue')) {
  content = content.replace(
    /import \{([^}]*)getDaysOverdue([^}]*)\} from '\.\.\/utils\/formatters';/,
    'import { $1getDaysOverdue$2, isInstallmentOverdue, getOutstanding } from \'../utils/formatters\';'
  );
}

// 2. State
if (!content.includes('const [sales, setSales] = useState<Sale[]>([])')) {
  content = content.replace(
    /const \[customers,    setCustomers\]    = useState<Customer\[\]>\(\[\]\);/,
    'const [customers,    setCustomers]    = useState<Customer[]>([]);\n  const [sales, setSales] = useState<Sale[]>([]);'
  );
}

// 3. setSales inside load()
if (!content.includes('setSales(s);')) {
  content = content.replace(
    /setCustomers\(c\);/,
    'setCustomers(c);\n        setSales(s);'
  );
}

// 4. Update overdueInsts and overdueAmount
content = content.replace(
  /const overdueInsts\s*=\s*installments\.filter\(i => i\.status === 'overdue'\);/,
  `const activeSales = sales.filter(s => s.status !== 'cancelled').map(s => s.id);
  const overdueInsts = installments.filter(i => activeSales.includes(i.saleId) && isInstallmentOverdue(i));`
);

content = content.replace(
  /const overdueAmount\s*=\s*overdueInsts\.reduce\(\(s, i\) => s \+ \(i\.amountDue - \(i\.amountPaid \|\| 0\)\), 0\);/,
  `const overdueAmount = overdueInsts.reduce((s, i) => s + getOutstanding(i), 0);`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated Dashboard.tsx');
