import { chromium } from 'playwright';
import * as pdfjsLib from 'pdfjs-dist';
import * as fs from 'fs';
import path from 'path';
import { generateReportHTML } from '../src/utils/printUtils';
import { REPORT_FOOTER_LABELS } from '../src/config/letterhead';

interface ReportDefinition {
  name: string;
  title: string;
  headers: string[];
  generateRow: (index: number) => (string | number)[];
  summaryText: string;
}

const mockCompany = {
  name: 'Faisal Homes',
  address: 'Main Boulevard, Faisal Town, Lahore',
  phone: '0300-1234567',
};

const reportDefinitions: ReportDefinition[] = [
  {
    name: 'Daily Report',
    title: 'Daily Operations Report',
    headers: ['Receipt #', 'Customer', 'Plot', 'Description', 'Amount', 'Method'],
    generateRow: (i) => [
      `REC-${1000 + i}`,
      `Customer ${i + 1}`,
      `Plot ${100 + (i % 50)}-A`,
      `Inst #${(i % 36) + 1}`,
      `Rs. ${(45000 + (i * 500)).toLocaleString()}`,
      i % 2 === 0 ? 'Cash' : 'Bank Transfer',
    ],
    summaryText: 'Total Inflow: Rs. 2,450,000',
  },
  {
    name: 'Sale Report',
    title: 'Sale Report',
    headers: ['Sale #', 'Customer', 'Plot', 'Size', 'Final Price', 'Down Payment', 'Remaining', 'Date'],
    generateRow: (i) => [
      `SAL-${2000 + i}`,
      `Buyer ${i + 1}`,
      `A-${101 + i}`,
      '5 Marla',
      `Rs. 3,500,000`,
      `Rs. 700,000`,
      `Rs. 2,800,000`,
      '24/10/2026',
    ],
    summaryText: 'Total Sales: Rs. 14,000,000 | Active Agreement Portfolio',
  },
  {
    name: 'Booking Report',
    title: 'Booking Report',
    headers: ['Receipt #', 'Customer', 'Plot', 'Date', 'Amount', 'Method', 'Status'],
    generateRow: (i) => [
      `BK-${3000 + i}`,
      `Applicant ${i + 1}`,
      `B-${201 + i}`,
      '24/10/2026',
      `Rs. 350,000`,
      'Online Transfer',
      i % 3 === 0 ? 'Confirmed' : 'Active',
    ],
    summaryText: 'Total Bookings: Rs. 3,500,000 | Active Registry',
  },
  {
    name: 'Installment Report',
    title: 'Installment Schedule Report',
    headers: ['Receipt #', 'Customer', 'Plot', 'Inst #', 'Due Date', 'Amount Due', 'Amount Paid', 'Status'],
    generateRow: (i) => [
      `REC-${4000 + i}`,
      `Investor ${i + 1}`,
      `C-${301 + i}`,
      `#${(i % 36) + 1}`,
      '01/11/2026',
      `Rs. 65,000`,
      i % 2 === 0 ? `Rs. 65,000` : `Rs. 0`,
      i % 2 === 0 ? 'Paid' : 'Pending',
    ],
    summaryText: 'Total Installments Scheduled: Rs. 2,340,000',
  },
  {
    name: 'Collection Report',
    title: 'Financial Collection Report',
    headers: ['Payment Method', 'Transactions Count', 'Share (%)', 'Collected Amount'],
    generateRow: (i) => [
      i % 3 === 0 ? `Cash Channel ${i + 1}` : i % 3 === 1 ? `Bank Transfer ${i + 1}` : `Cheque ${i + 1}`,
      12 + i,
      `${(10 + (i % 20)).toFixed(1)}%`,
      `Rs. ${(150000 + i * 10000).toLocaleString()}`,
    ],
    summaryText: 'Combined Collections: Rs. 8,950,000',
  },
  {
    name: 'Pending Payments (Installments)',
    title: 'Pending & Overdue Installments',
    headers: ['Receipt #', 'Customer', 'Phone', 'Plot', 'Inst #', 'Due Date', 'Amount Due'],
    generateRow: (i) => [
      `DUE-${5000 + i}`,
      `Client ${i + 1}`,
      `0300-11223${(i % 100).toString().padStart(2, '0')}`,
      `Plot ${400 + i}`,
      `#${(i % 36) + 1}`,
      '15/09/2026',
      `Rs. ${(50000 + (i % 5) * 5000).toLocaleString()}`,
    ],
    summaryText: 'Total Pending Installments: Rs. 3,250,000',
  },
  {
    name: 'Pending Payments (Customers)',
    title: 'Customer Recovery Ledger',
    headers: ['Customer ID', 'Customer Name', 'Phone', 'CNIC', 'Plots', 'Overdue Amount', 'Total Outstanding', 'Max Days Overdue', 'Severity'],
    generateRow: (i) => [
      `CUST-${6000 + i}`,
      `Defaulter Account ${i + 1}`,
      `0321-44556${(i % 100).toString().padStart(2, '0')}`,
      `35201-123456${i % 10}-1`,
      `A-${100 + i}; B-${200 + i}`,
      `Rs. ${(100000 + i * 10000).toLocaleString()}`,
      `Rs. ${(1200000 + i * 50000).toLocaleString()}`,
      `${35 + (i % 90)} days`,
      i % 2 === 0 ? 'CRITICAL' : 'OVERDUE',
    ],
    summaryText: 'Portfolio Overdue: Rs. 12,400,000 | 9-Column Wide Table',
  },
  {
    name: 'Shortage List',
    title: 'Shortage List (Overdue Payments Only)',
    headers: ['Cust ID', 'Customer Name', 'Phone', 'Plot', 'Inst #', 'Due Date', 'Amount Due', 'Overdue Days'],
    generateRow: (i) => [
      `CUST-${7000 + i}`,
      `Overdue Client ${i + 1}`,
      `0333-88990${(i % 100).toString().padStart(2, '0')}`,
      `Plot ${500 + i}-B`,
      `#${(i % 36) + 1}`,
      '01/08/2026',
      `Rs. ${(60000 + (i % 4) * 5000).toLocaleString()}`,
      `${45 + (i % 60)} days`,
    ],
    summaryText: 'Total Shortage Incurred: Rs. 4,800,000',
  },
  {
    name: 'Plot Status Report',
    title: 'Plot Status Inventory Report',
    headers: ['Plot #', 'Block', 'Size', 'Category', 'Status'],
    generateRow: (i) => [
      `Plot ${800 + i}`,
      `Block ${String.fromCharCode(65 + (i % 4))}`,
      `${5 + (i % 3) * 5} Marla`,
      i % 2 === 0 ? 'Residential' : 'Commercial',
      i % 3 === 0 ? 'Available' : i % 3 === 1 ? 'Booked' : 'Sold',
    ],
    summaryText: 'Inventory Count: 250 Total Units Registered',
  },
  {
    name: 'Dealer Commission',
    title: 'Dealer Commission Settlement Report',
    headers: ['Date', 'Dealer Name', 'Customer / Plot', 'Sale #', 'Commission %', 'Total Price', 'Earned Amount', 'Paid Amount', 'Status'],
    generateRow: (i) => [
      '24/10/2026',
      `Agency Prime ${i + 1}`,
      `Customer ${i + 1} / A-${101 + i}`,
      `SAL-${9000 + i}`,
      '2.0%',
      'Rs. 4,000,000',
      'Rs. 80,000',
      i % 2 === 0 ? 'Rs. 80,000' : 'Rs. 0',
      i % 2 === 0 ? 'Paid' : 'Pending',
    ],
    summaryText: 'Dealer Liabilities: Rs. 2,400,000 | 9-Column Wide Table',
  },
];

interface TestResult {
  reportName: string;
  rows: number;
  pages: number;
  lastPageRows: number;
  headerRepeated: boolean;
  footerRepeated: boolean;
  orientation: 'Portrait' | 'Landscape';
  onePageForShort: boolean;
  lastPageHasRows: boolean;
  passed: boolean;
}

async function runPdfVerification() {
  const browser = await chromium.launch({ headless: true });
  const results: TestResult[] = [];
  const testRowCounts = [5, 40, 150];

  const outputDir = path.resolve('artifacts_reports_pdf');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const reportDef of reportDefinitions) {
    const isLandscape = reportDef.headers.length > 8;
    const expectedOrientation = isLandscape ? 'Landscape' : 'Portrait';

    for (const rowCount of testRowCounts) {
      const generatedRows = Array.from({ length: rowCount }, (_, idx) => reportDef.generateRow(idx));
      const html = generateReportHTML(
        mockCompany,
        reportDef.title,
        reportDef.headers,
        generatedRows,
        reportDef.summaryText
      );

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const pdfFileName = `${reportDef.name.replace(/[^a-zA-Z0-9]/g, '_')}_${rowCount}_rows.pdf`;
      const pdfFilePath = path.join(outputDir, pdfFileName);

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: isLandscape,
        printBackground: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      });

      fs.writeFileSync(pdfFilePath, pdfBuffer);
      await page.close();

      // Inspect with pdfjs-dist
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
      const numPages = doc.numPages;

      let allHeadersPresent = true;
      let allFootersPresent = true;
      let lastPageDataRowCount = 0;

      for (let p = 1; p <= numPages; p++) {
        const pdfPage = await doc.getPage(p);
        const textContent = await pdfPage.getTextContent();
        const pageText = textContent.items.map((it: any) => it.str).join(' ');

        // Check header presence (Title or Company name)
        const hasHeader = pageText.includes(reportDef.title) || pageText.includes('Faisal Homes') || pageText.includes('FAISAL');
        if (!hasHeader) {
          allHeadersPresent = false;
        }

        // Check footer presence (Prepared by or Officer)
        const hasFooter = pageText.includes('Prepared by') || pageText.includes('Officer') || pageText.includes(REPORT_FOOTER_LABELS.preparedBy);
        if (!hasFooter) {
          allFootersPresent = false;
        }

        // On the last page, count row indicators
        if (p === numPages) {
          for (let r = 0; r < rowCount; r++) {
            const firstCell = String(generatedRows[r][0]);
            const secondCell = String(generatedRows[r][1]);
            if (pageText.includes(firstCell) || pageText.includes(secondCell)) {
              lastPageDataRowCount++;
            }
          }
        }
      }

      const onePageForShort = rowCount === 5 ? numPages === 1 : true;
      const lastPageHasRows = lastPageDataRowCount >= 1;
      const passed = onePageForShort && lastPageHasRows && allHeadersPresent && allFootersPresent;

      results.push({
        reportName: reportDef.name,
        rows: rowCount,
        pages: numPages,
        lastPageRows: lastPageDataRowCount,
        headerRepeated: allHeadersPresent,
        footerRepeated: allFootersPresent,
        orientation: expectedOrientation,
        onePageForShort,
        lastPageHasRows,
        passed,
      });
    }
  }

  await browser.close();

  // Print results table
  console.log('\n============================= PLAYWRIGHT PDF REPORTS VERIFICATION TABLE =============================');
  console.log('| Report | Rows | Pages | Last-Page Rows | Header/Footer on Every Page | Orientation | Status |');
  console.log('|---|---|---|---|---|---|---|');
  results.forEach(r => {
    const hfStr = r.headerRepeated && r.footerRepeated ? 'YES' : 'NO';
    const statusStr = r.passed ? 'PASSED' : 'FAILED';
    console.log(`| ${r.reportName} | ${r.rows} | ${r.pages} | ${r.lastPageRows} | ${hfStr} | ${r.orientation} | ${statusStr} |`);
  });
  console.log('=======================================================================================================\n');

  const failedCount = results.filter(r => !r.passed).length;
  if (failedCount > 0) {
    console.error(`FAILED: ${failedCount} test cases did not pass requirements!`);
    process.exit(1);
  } else {
    console.log(`SUCCESS: All ${results.length} report PDF test cases passed cleanly!`);
    process.exit(0);
  }
}

runPdfVerification().catch(err => {
  console.error('Fatal error in PDF verification:', err);
  process.exit(1);
});
