import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/utils/printUtils.ts');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /export function printInNewWindow\(htmlContent: string, title: string = 'Print'\): void \{[\s\S]*?void printDocument\(wrapped\);\s*return;\s*\}\s*void printDocument\(htmlContent\);\s*\}/;

const replacement = `export function printInNewWindow(htmlContent: string, title: string = 'Print'): void {
  if (!htmlContent.includes('lh-doc')) {
    if (import.meta.env?.DEV) {
      console.error('[printUtils] Missing lh-doc marker. Auto-wrapping content in layout report for: ' + title);
    }
    const wrapped = buildLetterheadDocument({
      layout: 'report',
      report: {
        title,
        rawHtml: htmlContent
      }
    });
    void printDocument(wrapped);
    return;
  }
  void printDocument(htmlContent);
}`;

if (!regex.test(content)) {
  console.error('Regex match failed in src/utils/printUtils.ts');
  process.exit(1);
}

content = content.replace(regex, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated src/utils/printUtils.ts to use import.meta.env?.DEV');
