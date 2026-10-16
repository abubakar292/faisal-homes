const fs = require('fs');

function fix(f) {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/<\/>\}\s*\n\s*\/>\}\s*\n\s*\/>/g, '</>}\n      />');
  c = c.replace(/<\/>\}\s*\n\s*\/>/g, '</>}\n      />');
  fs.writeFileSync(f, c, 'utf8');
}

fix('src/pages/reports/SaleReport.tsx');
fix('src/pages/reports/ShortageList.tsx');
console.log('Fixed two files');
