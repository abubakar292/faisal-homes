const fs = require('fs');
const path = require('path');

const files = [
  'src/pages/reports/SaleReport.tsx',
  'src/pages/reports/PlotStatusReport.tsx',
  'src/pages/reports/InstallmentReport.tsx',
  'src/pages/reports/DealerCommissionReport.tsx',
  'src/pages/reports/DailyReport.tsx',
  'src/pages/reports/CollectionReport.tsx',
  'src/pages/reports/BookingReport.tsx'
];

files.forEach(file => {
  const fullPath = path.resolve(file);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Replace handleExportPDF with handlePrint
  content = content.replace(/const handleExportPDF/g, 'const handlePrint');
  
  // Replace the buttons block. 
  // We want to remove the window.print() button, change "PDF" to "Print" and icon to Printer.
  
  // Example of what we are replacing:
  // <button onClick={handleExportPDF} className="btn-primary"><Download size={15} /> PDF</button>
  // <button onClick={handleExportCSV} className="btn-secondary"><Download size={15} /> CSV</button>
  // <button onClick={() => window.print()} className="btn-secondary"><Printer size={15} /> Print</button>
  
  // Instead of matching exact string, we'll replace the three buttons with two.
  // We look for handleExportPDF (now handlePrint) and replace the whole block if possible, or just regex it.
  
  content = content.replace(/<button onClick=\{handlePrint\}.*?PDF<\/button>/g, '<button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>');
  
  content = content.replace(/<button[^>]*onClick=\{\(\) => window\.print\(\)\}[^>]*>.*?<\/button>/g, '');
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated ${file}`);
});
