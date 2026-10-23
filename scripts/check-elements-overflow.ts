import { chromium } from 'playwright';
import { generatePlotAgreement } from '../src/utils/printUtils';
import type { Sale, Customer, Plot, CompanySettings } from '../src/types';

async function checkElements() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

  const sale: Sale = {
    id: 's1', saleId: 'SALE-TEST', plotId: 'p1', customerId: 'c1',
    saleDate: new Date('2026-01-01'), totalPrice: 1500000, discount: 0, finalPrice: 1500000,
    downPaymentAmount: 300000, bookingAmountPaid: 100000, remainingDownPayment: 200000,
    downPaymentReceived: 100000, remainingAmount: 1200000, paymentMethod: 'cash',
    status: 'active', createdAt: new Date()
  };
  const customer: Customer = {
    id: 'c1', customerId: 'CUST-001', name: 'Muhammad Ali', cnic: '35201-1234567-1',
    phone: '03001234567', address: 'Lahore, Pakistan', createdAt: new Date()
  };
  const plot: Plot = {
    id: 'p1', plotNumber: '105', block: 'A', size: 5, sizeUnit: 'Marla',
    category: 'Residential', type: 'Standard', status: 'sold', ratePerMarla: 300000,
    totalPrice: 1500000, createdAt: new Date()
  };
  const company: CompanySettings = {
    companyName: 'Faisal Homes', phone: '03001234567', email: 'info@faisalhomes.com', address: 'Lahore'
  };

  const html = generatePlotAgreement(sale, customer, plot, company);
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const overflows = await page.evaluate(() => {
    const maxWidth = 210 * 3.779527559; // 793.7px
    const all = Array.from(document.querySelectorAll('*'));
    return all
      .map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, className: el.className, right: r.right, width: r.width, maxWidth };
      })
      .filter(x => x.right > maxWidth + 1);
  });

  console.log('DOM Elements exceeding 210mm (793.7px):');
  console.log(overflows.slice(0, 10));

  await browser.close();
}

checkElements().catch(console.error);
