const fs = require('fs');
const path = require('path');

const dir = 'src/pages/reports';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'TermsAndConditions.tsx');

files.forEach(file => {
  let content = fs.readFileSync(path.join(dir, file), 'utf8');

  // 1. Add imports
  if (!content.includes('ReportFilters')) {
    content = content.replace(/(import React.*?;\n)/, `$1import ReportFilters, { DateRange } from '../../components/ui/ReportFilters';\n`);
  }

  // 2. Replace state variables
  // Case A: dateFrom / dateTo
  if (content.includes('const [dateFrom')) {
    content = content.replace(/const \[dateFrom.*?;\n/, "const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });\n  const [search, setSearch] = useState('');\n");
    content = content.replace(/const \[dateTo.*?;\n/, "");
  }
  // Case B: selectedDate
  else if (content.includes('const [selectedDate')) {
    content = content.replace(/const \[selectedDate.*?;\n/, "const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });\n  const [search, setSearch] = useState('');\n");
  }

  // 3. Replace filtering logic
  // For SaleReport, InstallmentReport, DealerCommissionReport, CollectionReport, BookingReport, ShortageList, PendingPaymentsReport
  // we just need to replace the `dateFrom`/`dateTo` usage inside filter.
  // We'll just replace the filter blocks manually for the known patterns.
  
  // SaleReport, BookingReport, CollectionReport
  content = content.replace(/if \(dateFrom && d < new Date\(dateFrom\)\) return false;\s*if \(dateTo && d > new Date\(dateTo \+ 'T23:59:59'\)\) return false;/, 
    "if (dateRange.start && d < dateRange.start) return false;\n    if (dateRange.end && d > dateRange.end) return false;");

  // InstallmentReport, DealerCommissionReport, ShortageList, PendingPaymentsReport
  // Sometimes `d` is something else.
  content = content.replace(/if \(dateFrom && [a-zA-Z0-9_]+ < new Date\(dateFrom\)\) return false;\s*if \(dateTo && [a-zA-Z0-9_]+ > new Date\(dateTo \+ 'T23:59:59'\)\) return false;/g, function(match) {
    const varName = match.match(/&& ([a-zA-Z0-9_]+) < new Date/)[1];
    return `if (dateRange.start && ${varName} < dateRange.start) return false;\n    if (dateRange.end && ${varName} > dateRange.end) return false;`;
  });

  // PlotStatusReport doesn't have a date filter originally, so we just add search/dateRange to it.
  if (file === 'PlotStatusReport.tsx') {
    if (!content.includes('dateRange')) {
       content = content.replace(/const PlotStatusReport.*?\n/, "const PlotStatusReport: React.FC = () => {\n  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });\n  const [search, setSearch] = useState('');\n");
    }
  }

  // DailyReport - uses selectedDate and isSameDay
  if (file === 'DailyReport.tsx') {
    content = content.replace(/const date = new Date\(selectedDate\);/, "");
    content = content.replace(/isSameDay\(new Date\((.*?)\), date\)/g, "( !dateRange.start || new Date($1) >= dateRange.start ) && ( !dateRange.end || new Date($1) <= dateRange.end )");
  }

  // 4. Update JSX: find the PageHeader actions and move them, replace the date inputs.
  // Extract actions
  let actionsMatch = content.match(/actions=\{\s*<div[^>]*>([\s\S]*?)<\/div>\s*\}/);
  let buttons = '';
  if (actionsMatch) {
    let inner = actionsMatch[1];
    // remove date inputs from inner
    inner = inner.replace(/<input type="date"[^>]*\/>/g, '');
    inner = inner.replace(/<span[^>]*>to<\/span>/g, '');
    buttons = inner;
    // remove actions from PageHeader
    content = content.replace(/actions=\{\s*<div[^>]*>[\s\S]*?<\/div>\s*\}/, '');
  }

  // insert ReportFilters after PageHeader
  if (!content.includes('<ReportFilters')) {
    content = content.replace(/(<PageHeader[^>]*\/>)/, `$1\n      <ReportFilters \n        search={search}\n        onSearchChange={setSearch}\n        dateRange={dateRange}\n        onDateRangeChange={setDateRange}\n        actions={<>${buttons}</>}\n      />`);
  }

  // 5. General search filter addition if not existing.
  // This is tricky, maybe the user says "do not change report calculations in this task". They didn't say to *implement* search logic if it didn't exist, just pass the props? "Create ONE shared component... Use it in EVERY report file. Date filtering must be inclusive... Do not change report calculations".
  // Actually, wait, if I add search, I should probably apply it to the `filtered` array or just let it be. The prompt says "Do not change report calculations".
  
  fs.writeFileSync(path.join(dir, file), content, 'utf8');
});
console.log('done');
