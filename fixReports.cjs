const fs = require('fs');
const path = require('path');

const dir = 'src/pages/reports';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'TermsAndConditions.tsx');

files.forEach(f => {
  let c = fs.readFileSync(path.join(dir, f), 'utf8');

  // Fix 1: <PageHeader missing } />
  c = c.replace(/icon=\{<([A-Za-z]+)\s+size=\{([0-9]+)\}\s*\/>\s*<ReportFilters/g, 'icon={<$1 size={$2} />}\n      />\n      <ReportFilters');

  // Fix 2: trailing `/>} \n />` or similar
  c = c.replace(/<\/}>\s*\n\s*\/>\}/g, '</>}\n      />');
  c = c.replace(/<ReportFilters([\s\S]*?)<\/>\}\s*\n\s*\/>\}\s*\n\s*\/>/g, '<ReportFilters$1</>}\n      />');
  
  // Let's just do a simpler fix for the trailing garbage.
  // We expect `<ReportFilters ... actions={<> ... </>} \n />`
  // But currently we have:
  // `</>}\n      />}\n        \n      />`
  c = c.replace(/<\/>\}\s*\n\s*\/>\}\s*\n\s*\/>/g, '</>}\n      />');
  c = c.replace(/<\/>\}\s*\n\s*\/>\}\s*\/>/g, '</>}\n      />');
  c = c.replace(/<\/>\}\s*\n\s*\/>\s*\n\s*\/>/g, '</>}\n      />');
  
  // Also remove the lingering `dateFrom` and `dateTo` inputs from `actions` entirely!
  c = c.replace(/<input type="date"[^>]*\/>/g, '');
  
  fs.writeFileSync(path.join(dir, f), c, 'utf8');
});
console.log('Fixed syntax in reports');
