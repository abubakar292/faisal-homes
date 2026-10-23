import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';

async function inspect(pdfPath: string) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  console.log(`PDF Pages: ${doc.numPages}`);

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    console.log(`Page ${p} Viewport: width=${viewport.width}, height=${viewport.height}`);

    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item: any) => item.str);
    console.log(`Page ${p} text items count: ${textContent.items.length}`);
    console.log(`Page ${p} snippet: ${strings.slice(0, 30).join(' ')}`);

    const allText = strings.join(' ');
    console.log(`Page ${p} total text length: ${allText.length}`);

    // Check for installment numbers 1..36
    const missingMonthly: number[] = [];
    for (let m = 1; m <= 36; m++) {
      if (!allText.includes(`#${m}`) && !allText.includes(`# ${m}`)) {
        missingMonthly.push(m);
      }
    }
    console.log(`Missing monthly installments (1..36): ${missingMonthly.length > 0 ? missingMonthly.join(', ') : 'NONE'}`);

    // Check for semi-annual labels
    const missingSemi: number[] = [];
    for (let s = 1; s <= 6; s++) {
      if (!allText.includes(`SA ${s}`) && !allText.includes(`Semi-Annual ${s}`)) {
        missingSemi.push(s);
      }
    }
    console.log(`Missing semi-annual installments (1..6): ${missingSemi.length > 0 ? missingSemi.join(', ') : 'NONE'}`);

    // Check if any text items have x + width > viewport.width
    let overflowCount = 0;
    for (const item of textContent.items as any[]) {
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width;
      if (x + width > viewport.width + 1) { // 1pt tolerance
        overflowCount++;
      }
    }
    console.log(`Page ${p} text overflowing right edge: ${overflowCount}`);
  }
}

inspect('temp_schedule.pdf').catch(console.error);
