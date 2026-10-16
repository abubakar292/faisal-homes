const fs = require('fs');
const path = require('path');

const dir = 'src/pages/reports';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'TermsAndConditions.tsx');

files.forEach(f => {
  let c = fs.readFileSync(path.join(dir, f), 'utf8');
  
  // The corrupted state is something like:
  // <PageHeader ... icon={<Icon size={20} />
  // <ReportFilters ... />
  // ...
  // />
  //
  // Let's just restore the correct syntax.
  // I will find <ReportFilters and prepend `}\n      />\n` if it's missing the `/>` before it.
  
  if (c.includes('<ReportFilters')) {
    // Let's replace:
    // icon={<Icon size={20} />
    // <ReportFilters
    // with:
    // icon={<Icon size={20} />}
    // />
    // <ReportFilters
    c = c.replace(/icon=\{<([A-Za-z0-9]+)\s+size=\{([0-9]+)\}\s*\/>\s*<ReportFilters/g, 'icon={<$1 size={$2} />}\n      />\n      <ReportFilters');
    
    // Also we need to delete the lingering `/>` that might be lower down.
    // Let's see if there is an orphaned `/>` between ReportFilters and the next tag.
    // It's safer to just let typescript format it, but wait, the orphaned `/>` will be parsed as text or syntax error.
    // Actually, in `BookingReport.tsx`:
    // icon={<BookOpen size={20} />
    // <ReportFilters ... actions={<> ... </button>
    // </div>
    // }
    // />
    // Oh, the `actions=...` removal regex missed the `/>` because of `}`. 
    
    // Let's just reset all files from Git and do it correctly.
  }
});
