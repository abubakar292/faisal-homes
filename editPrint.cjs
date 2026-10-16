const fs = require('fs');

const path = 'd:/Faisal Homes/faisal-homes/src/utils/printUtils.ts';
let text = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!text.includes('import { printDocument }')) {
  text = "import { printDocument } from './printDocument';\n" + text;
}

// 2. Add CSS rules
const pageRegex = /@page\s*{\s*margin:\s*8mm;\s*size:\s*A4\s*portrait;\s*}/g;
if (text.includes('@page { margin: 8mm; size: A4 portrait; }') && !text.includes('thead { display: table-header-group; }')) {
  text = text.replace('@page { margin: 8mm; size: A4 portrait; }', '@page { margin: 8mm; size: A4 portrait; }\nthead { display: table-header-group; } tr { page-break-inside: avoid; } .page-break { page-break-after: always; }');
}

// 3. Replace printInNewWindow
const functionStart = "export function printInNewWindow(htmlContent: string, title: string = 'Print'): void {";
const functionEnd = "// Legacy alias";

const startIndex = text.indexOf(functionStart);
const endIndex = text.indexOf(functionEnd, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const newFunction = `export function printInNewWindow(htmlContent: string, title: string = 'Print'): void {
  const shell = \`<!DOCTYPE html>
<html>
<head>
  <title>\${title}</title>
  <style>\${PRINT_CSS}</style>
</head>
<body>
  \${htmlContent}
</body>
</html>\`;
  void printDocument(shell);
}

`;
  text = text.substring(0, startIndex) + newFunction + text.substring(endIndex);
} else {
  console.error("Could not find start or end markers for printInNewWindow");
}

fs.writeFileSync(path, text, 'utf8');
console.log("Successfully updated printUtils.ts");
