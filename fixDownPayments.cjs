const fs = require('fs');

['src/pages/payments/DownPayments.tsx'].forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/\\`/g, '`');
  c = c.replace(/\\\$/g, '$');
  fs.writeFileSync(f, c, 'utf8');
});

console.log('Fixed syntax errors');
