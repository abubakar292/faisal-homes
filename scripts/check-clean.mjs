import fs from 'fs';
import path from 'path';

// Exact pattern specified in prompt rule 1: "Ã|â€|ðŸ|â”|Â "
const MOJIBAKE_PATTERN = /Ã|â€|ðŸ|â”|Â /;

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, fileList);
    } else if (/\.(ts|tsx|js|jsx|css|html)$/.test(file)) {
      fileList.push(full);
    }
  }
  return fileList;
}

const files = walk('src');
let badCount = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (MOJIBAKE_PATTERN.test(line)) {
      console.error(`Mojibake in ${file}:${idx + 1}: ${line.trim()}`);
      badCount++;
    }
  });
}

if (badCount > 0) {
  console.error(`Found ${badCount} mojibake occurrences!`);
  process.exit(1);
} else {
  console.log(`Clean! Checked ${files.length} source files, 0 mojibake found.`);
}
