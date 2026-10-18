import fs from 'node:fs';
import path from 'node:path';

function getAllFiles(dir, exts) {
  let res = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      res = res.concat(getAllFiles(full, exts));
    } else if (exts.some(e => full.endsWith(e))) {
      res.push(full);
    }
  }
  return res;
}

const files = getAllFiles('src', ['.tsx', '.css']);
console.log('Total files scanned in src:', files.length);

// 1. Check for 100vh / min-h-screen in layout-critical files
const vhIssues = [];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('100vh') || content.includes('min-h-screen')) {
    vhIssues.push(f);
  }
}
console.log('Files with 100vh / min-h-screen (expected 0):', vhIssues.length);
if (vhIssues.length > 0) console.log(vhIssues);

// 2. Check for raw grid-cols-3 or grid-cols-4 without responsive prefix (e.g. sm:, md:, lg:)
const rawGrids = [];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const matches = content.match(/className=["'`][^"'`]*\bgrid-cols-[3-9]\b[^"'`]*["'`]/g);
  if (matches) {
    for (const m of matches) {
      if (!m.includes('sm:') && !m.includes('md:') && !m.includes('lg:') && !m.includes('xl:')) {
        rawGrids.push({ file: f, match: m });
      }
    }
  }
}
console.log('Unprefixed grid-cols-[3-9] (expected 0):', rawGrids.length);
if (rawGrids.length > 0) console.log(rawGrids);

// 3. Check for <table> tags without overflow-x-auto or ReportLayout wrapper
const tableIssues = [];
for (const f of files) {
  if (f.endsWith('.tsx')) {
    const content = fs.readFileSync(f, 'utf8');
    const hasTableJSX = /<table\b[^>]*className=/.test(content);
    if (hasTableJSX && !content.includes('overflow-x-auto') && !content.includes('ReportLayout') && !content.includes('md:hidden')) {
      tableIssues.push(f);
    }
  }
}
console.log('Tables without overflow or mobile card handling (expected 0):', tableIssues.length);
if (tableIssues.length > 0) console.log(tableIssues);

// 4. Check for row-actions hover visibility in index.css
const cssContent = fs.readFileSync('src/index.css', 'utf8');
const hoverNoneHandled = cssContent.includes('@media (hover: none)') && cssContent.includes('.row-actions');
console.log('row-actions visible under @media (hover: none):', hoverNoneHandled ? 'PASS' : 'FAIL');

// 5. Check for touch target min-height in index.css
const touchTargetHandled = cssContent.includes('@media (pointer: coarse)') && cssContent.includes('min-height: 44px');
console.log('Touch target >= 44px under @media (pointer: coarse):', touchTargetHandled ? 'PASS' : 'FAIL');

// 6. Check for iOS zoom prevention font-size in index.css
const iosZoomHandled = cssContent.includes('@media (max-width: 767px)') && cssContent.includes('font-size: 16px');
console.log('iOS zoom prevention (16px on < 768px):', iosZoomHandled ? 'PASS' : 'FAIL');

// 7. Check for Layout.tsx desktop padding condition
const layoutContent = fs.readFileSync('src/components/layout/Layout.tsx', 'utf8');
const layoutSafe = layoutContent.includes('isDesktop && desktopOpen') && !layoutContent.includes('paddingLeft: desktopOpen ? 260 : 0');
console.log('Layout.tsx desktop sidebar padding restricted to desktop:', layoutSafe ? 'PASS' : 'FAIL');

console.log('\n--- STATIC AUDIT COMPLETE ---');
