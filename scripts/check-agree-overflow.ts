import * as pdfjsLib from 'pdfjs-dist';
import * as fs from 'fs';

async function checkAgreement() {
  const data = new Uint8Array(fs.readFileSync('agreement_12.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1.0 });
  const tc = await page.getTextContent();

  let wordOverflow = 0;
  for (const item of tc.items as any[]) {
    const x = item.transform[4];
    const width = item.width;
    if (item.str.trim().length > 0 && x + width > vp.width) {
      wordOverflow++;
      console.log(`Word Overflow: "${item.str}" x=${x.toFixed(1)}, w=${width.toFixed(1)}, total=${(x + width).toFixed(1)}`);
    }
  }
  console.log(`Total non-empty word overflows: ${wordOverflow}`);
}

checkAgreement().catch(console.error);
