const fs = require('fs');
const path = require('path');

const dir = 'src/pages/reports';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'TermsAndConditions.tsx');

files.forEach(f => {
  let c = fs.readFileSync(path.join(dir, f), 'utf8');

  // Fix the inputs that contain dateFrom, dateTo, selectedDate
  // We can just use string replacement or a less restrictive regex.
  c = c.replace(/<input type="date"[\s\S]*?onChange=\{e => setDateFrom\(e\.target\.value\)\}\s*\/>/g, '');
  c = c.replace(/<input type="date"[\s\S]*?onChange=\{e => setDateTo\(e\.target\.value\)\}\s*\/>/g, '');
  c = c.replace(/<input type="date"[\s\S]*?onChange=\{e => setSelectedDate\(e\.target\.value\)\}\s*\/>/g, '');
  
  if (f === 'DealerCommissionReport.tsx') {
    c = c.replace(/const \[dateFrom, setDateFrom\] = useState\(''\);/g, "const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });\n  const [search, setSearch] = useState('');");
    c = c.replace(/const \[dateTo, setDateTo\] = useState\(formatDateInput\(new Date\(\)\)\);/g, "");
    c = c.replace(/if \(dateFrom && d < new Date\(dateFrom\)\) return false;/g, "if (dateRange.start && d < dateRange.start) return false;");
    c = c.replace(/if \(dateTo && d > new Date\(dateTo \+ 'T23:59:59'\)\) return false;/g, "if (dateRange.end && d > dateRange.end) return false;");
    
    // In DealerCommissionReport, the date filtering logic was skipped earlier? Let's check.
    // Let's also remove `dateFrom`/`dateTo` from anywhere else.
  }
  
  if (f === 'ShortageList.tsx') {
    if (!c.includes('const [dateRange')) {
      c = c.replace(/const ShortageList: React\.FC = \(\) => \{/g, "$&\n  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });\n  const [search, setSearch] = useState('');");
    }
  }

  fs.writeFileSync(path.join(dir, f), c, 'utf8');
});

console.log('Fixed JSX date inputs');
