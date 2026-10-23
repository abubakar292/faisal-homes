import { chromium } from 'playwright';
import { generateScheduleHTML } from '../src/utils/printUtils';
import { buildInstallments } from '../src/utils/saleCalc';
import * as fs from 'fs';
import * as path from 'path';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

  const instsRaw = buildInstallments({
    saleId: 's1',
    customerId: 'c1',
    plotId: 'p1',
    saleDate: '2026-01-01',
    rows: [{ months: 36, interval: 1, monthlyAmount: 25000, totalAmount: 900000 }],
    semiAnnualEnabled: true,
    semiAnnualAmount: 50000,
  });
  const installments = instsRaw.map((i, idx) => ({ ...i, id: 'i' + idx }));
  const sale = {
    id: 's1',
    saleId: 'S1',
    plotId: 'p1',
    customerId: 'c1',
    saleDate: new Date('2026-01-01'),
    totalPrice: 1500000,
    discount: 0,
    finalPrice: 1500000,
    downPaymentAmount: 300000,
    bookingAmountPaid: 100000,
    remainingDownPayment: 200000,
    downPaymentReceived: 100000,
    remainingAmount: 1200000,
    paymentMethod: 'cash',
    status: 'active' as const,
    createdAt: new Date(),
  };
  const customer = {
    id: 'c1',
    customerId: 'C1',
    name: 'Muhammad Ali',
    cnic: '35201-1234567-1',
    phone: '03001234567',
    address: 'Lahore',
    createdAt: new Date(),
  };
  const plot = {
    id: 'p1',
    plotNumber: '105',
    block: 'A',
    size: 5,
    sizeUnit: 'Marla',
    category: 'Residential',
    type: 'Standard',
    status: 'sold' as const,
    ratePerMarla: 300000,
    totalPrice: 1500000,
    createdAt: new Date(),
  };
  const company = {
    companyName: 'Faisal Homes',
    phone: '03001234567',
    email: 'info@faisalhomes.com',
    address: 'Lahore',
  };

  const html = generateScheduleHTML(sale, customer, plot, installments, company);
  fs.writeFileSync('temp_schedule.html', html, 'utf8');

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  await page.screenshot({ path: 'temp_schedule.png', fullPage: true });

  const pdf = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
  });
  fs.writeFileSync('temp_schedule.pdf', pdf);

  console.log('Successfully captured screenshot and PDF.');
  await browser.close();
}

capture().catch(console.error);
