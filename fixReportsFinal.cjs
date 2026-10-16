const fs = require('fs');
const path = require('path');

// 1. Fix DownPayments.tsx
let dp = fs.readFileSync('src/pages/payments/DownPayments.tsx', 'utf8');
dp = dp.replace(/saleDate: sale\.saleDate\.toDate\(\),/g, 'saleDate: new Date(sale.saleDate),');
fs.writeFileSync('src/pages/payments/DownPayments.tsx', dp, 'utf8');

const dir = 'src/pages/reports';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'TermsAndConditions.tsx');

files.forEach(f => {
  let c = fs.readFileSync(path.join(dir, f), 'utf8');

  // Fix lingering date inputs in JSX
  c = c.replace(/<input[^>]*type="date"[^>]*\/>/g, '');
  
  // Fix lingering selectedDate input in JSX
  // Actually DailyReport had selectedDate input, but the regex above matches type="date"
  
  // DailyReport specific fixes
  if (f === 'DailyReport.tsx') {
    c = c.replace(/const date = new Date\(selectedDate\);/, '');
    // Some uses of `date` in DailyReport:
    c = c.replace(/isSameDay\(new Date\(i\.paymentDate\), date\)/g, "( !dateRange.start || new Date(i.paymentDate) >= dateRange.start ) && ( !dateRange.end || new Date(i.paymentDate) <= dateRange.end )");
    c = c.replace(/isSameDay\(new Date\(b\.bookingDate\), date\)/g, "( !dateRange.start || new Date(b.bookingDate) >= dateRange.start ) && ( !dateRange.end || new Date(b.bookingDate) <= dateRange.end )");
    c = c.replace(/isSameDay\(new Date\(s\.saleDate\), date\)/g, "( !dateRange.start || new Date(s.saleDate) >= dateRange.start ) && ( !dateRange.end || new Date(s.saleDate) <= dateRange.end )");
    c = c.replace(/formatDate\(date\)/g, "dateRange.start ? formatDate(dateRange.start) : 'All Dates'");
    
    if (c.includes('const date =')) {
      c = c.replace(/const date =.*/g, '');
    }
  }

  // PendingPaymentsReport & ShortageList missing state initialization
  if (f === 'PendingPaymentsReport.tsx' || f === 'ShortageList.tsx') {
    if (!c.includes('const [dateRange')) {
      c = c.replace(/const \w+Report: React\.FC = \(\) => \{/g, "$&\n  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });\n  const [search, setSearch] = useState('');");
    }
  }

  // DealerCommissionReport lingering dateFrom logic
  if (f === 'DealerCommissionReport.tsx') {
    c = c.replace(/if \(dateFrom && d < new Date\(dateFrom\)\) return false;/g, "if (dateRange.start && d < dateRange.start) return false;");
    c = c.replace(/if \(dateTo && d > new Date\(dateTo \+ 'T23:59:59'\)\) return false;/g, "if (dateRange.end && d > dateRange.end) return false;");
  }

  fs.writeFileSync(path.join(dir, f), c, 'utf8');
});

console.log('Fixed final reports');
