const fs = require('fs');

let file = fs.readFileSync('src/pages/reports/ShortageList.tsx', 'utf8');

file = file.replace(/\\`/g, '`');
file = file.replace(/\\\$/g, '$');

fs.writeFileSync('src/pages/reports/ShortageList.tsx', file);

console.log('Fixed ShortageList');
