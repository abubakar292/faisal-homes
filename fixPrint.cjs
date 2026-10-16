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

  // Since handleExportPDF was renamed to handlePrint in the function declaration, but not in onClick:
  content = content.replace(/onClick=\{handleExportPDF\}/g, 'onClick={handlePrint}');
  
  // Replace the old PDF button with the new Print button
  content = content.replace(/<button[^>]*onClick=\{handlePrint\}[^>]*>.*?<\/button>/g, '<button onClick={handlePrint} className="btn-primary"><Printer size={15} /> Print</button>');
  
  // Remove window.print button if it's still there
  content = content.replace(/<button[^>]*onClick=\{\(\) => window\.print\(\)\}[^>]*>.*?<\/button>/g, '');
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated ${file}`);
});

// Fix DealerCommission.tsx import
const dcPath = path.resolve('src/pages/dealers/DealerCommission.tsx');
let dcContent = fs.readFileSync(dcPath, 'utf8');
if (!dcContent.includes('getDocument')) {
  dcContent = dcContent.replace(/import \{([^}]*)getCollection([^}]*)\} from '\.\.\/\.\.\/firebase\/firestore';/, 'import { $1getCollection, getDocument$2} from \'../../firebase/firestore\';');
  fs.writeFileSync(dcPath, dcContent, 'utf8');
  console.log('Fixed DealerCommission.tsx imports');
}
