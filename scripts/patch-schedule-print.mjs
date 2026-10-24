import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/utils/printUtils.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add import if not present
if (!content.includes('generateScheduleDocumentHTML')) {
  content = content.replace(
    "import { sortInstallments } from './saleCalc';",
    "import { sortInstallments } from './saleCalc';\nimport { generateScheduleDocumentHTML } from './schedulePrintLayout';"
  );
}

// 2. Replace generateScheduleHTML implementation
const startMarker = 'export function generateScheduleHTML(';
const endMarker = 'export function generateDownPaymentReceiptHTML(';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

const replacement = `export function generateScheduleHTML(
  sale: Sale,
  customer: Customer,
  plot: Plot,
  schedule: Installment[],
  company: CompanySettings
): string {
  return generateScheduleDocumentHTML(sale, customer, plot, schedule, company);
}

`;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched generateScheduleHTML in src/utils/printUtils.ts');
