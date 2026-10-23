import { chromium } from 'playwright';
import { generateScheduleHTML } from '../src/utils/printUtils';
import { buildInstallments } from '../src/utils/saleCalc';

async function check120() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

  const instsRaw = buildInstallments({
    saleId: 's1', customerId: 'c1', plotId: 'p1', saleDate: '2026-01-01',
    rows: [{ months: 120, interval: 1, monthlyAmount: 10000, totalAmount: 1200000 }],
  });
  const installments = instsRaw.map((i, idx) => ({ ...i, id: 'i' + idx }));
  const sale = {
    id: 's1', saleId: 'S1', plotId: 'p1', customerId: 'c1',
    saleDate: new Date('2026-01-01'), totalPrice: 1200000, discount: 0, finalPrice: 1200000,
    downPaymentAmount: 0, bookingAmountPaid: 0, remainingDownPayment: 0,
    downPaymentReceived: 0, remainingAmount: 1200000, paymentMethod: 'cash',
    status: 'active' as const, createdAt: new Date()
  };
  const customer = { id: 'c1', customerId: 'C1', name: 'Ali', phone: '123', address: 'Lahore', createdAt: new Date() };
  const plot = { id: 'p1', plotNumber: '105', block: 'A', size: 5, sizeUnit: 'Marla', category: 'Residential', type: 'Standard', status: 'sold' as const, ratePerMarla: 200000, totalPrice: 1200000, createdAt: new Date() };
  const company = { companyName: 'Faisal Homes', phone: '123', email: 'a@b.com', address: 'Lahore' };

  const html = generateScheduleHTML(sale, customer, plot, installments, company);
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const measurements = await page.evaluate(() => {
    const content = (document.querySelector('.lh-content') || document.querySelector('.lh-section')) as HTMLElement;
    const docTable = document.querySelector('table.lh-doc') as HTMLElement;
    const body = document.body;
    const rContent = content.getBoundingClientRect();
    const rTable = docTable.getBoundingClientRect();

    return {
      contentRect: { top: rContent.top, bottom: rContent.bottom, height: rContent.height },
      tableRect: { top: rTable.top, bottom: rTable.bottom, height: rTable.height },
      scrollHeight: docTable.scrollHeight,
      bodyScrollHeight: body.scrollHeight,
      zoom: (content.style as any).zoom,
      fontSize: content.style.fontSize,
      targetMaxBottom: (297 - 58) * 3.779527559,
    };
  });

  console.log('Measurements for 120 rows:');
  console.log(JSON.stringify(measurements, null, 2));

  await browser.close();
}

check120().catch(console.error);
