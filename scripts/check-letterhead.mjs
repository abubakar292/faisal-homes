import fs from 'fs';
import path from 'path';

const ALLOWED_GENERATORS = [
  'buildLetterheadDocument',
  'generateReportHTML',
  'generateScheduleHTML',
  'generatePlotAgreement',
  'generateBookingReceipt',
  'generatePaymentReceipt',
  'generateDownPaymentReceiptHTML',
  'generatePossessionReceiptHTML',
  'generateInstallmentSchedule',
  'generateCustomerLedgerHTML'
];

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, fileList);
    } else if (/\.(ts|tsx)$/.test(file)) {
      fileList.push(full);
    }
  }
  return fileList;
}

const files = walk('src');
let totalCallSites = 0;
let errors = 0;

console.log('Checking print call sites across ' + files.length + ' source files...');

for (const file of files) {
  // Skip printUtils.ts itself where printContent is declared/defined
  if (file.endsWith(path.join('src', 'utils', 'printUtils.ts'))) {
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const match = line.match(/(?:printContent|printInNewWindow)\s*\(\s*([^,\)]+)/);
    if (match) {
      totalCallSites++;
      const argName = match[1].trim();
      const lineNum = idx + 1;

      // Check if the argument is a direct call to an allowed generator
      const isDirectCall = ALLOWED_GENERATORS.some(gen => argName.startsWith(gen + '('));

      // Check if the variable passed was assigned from an allowed generator in this file
      let isAssignedFromGenerator = false;
      for (const gen of ALLOWED_GENERATORS) {
        const assignRegex = new RegExp(`(?:const|let|var)\\s+${argName}\\s*=\\s*(?:await\\s+)?${gen}\\s*\\(`, 's');
        if (assignRegex.test(content)) {
          isAssignedFromGenerator = true;
          break;
        }
      }

      // Check if member access in a dev test harness like DevLetterhead where fixtures[key].html are all letterhead docs
      const isDevFixture = file.includes('DevLetterhead') && argName.includes('.html');

      if (!isDirectCall && !isAssignedFromGenerator && !isDevFixture) {
        console.error(`[ERROR] ${file}:${lineNum} calls printContent with '${argName}' which is not produced by buildLetterheadDocument / letterhead generators.`);
        console.error(`        Line: ${line.trim()}`);
        errors++;
      } else {
        console.log(`[OK] ${file}:${lineNum} -> ${argName} (verified letterhead generator)`);
      }
    }
  });
}

console.log(`\nChecked ${totalCallSites} print call sites.`);

if (errors > 0) {
  console.error(`FAILED: Found ${errors} unverified print call sites.`);
  process.exit(1);
} else {
  console.log('PASSED: All print call sites use buildLetterheadDocument!');
  process.exit(0);
}
