import fs from 'fs';
import path from 'path';
import {
  sizeToVariant,
  paletteFor,
  HOUSE_SIZES,
  HOUSE_PALETTES,
} from '../src/features/plotHouses/houseData';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

console.log('=== RUNNING TEST-HOUSES.TS ===\n');

// 1. Test sizeToVariant mapping
console.log('1. Testing sizeToVariant mapping...');
const testCases: Array<{ size: number; unit?: string; expected: string }> = [
  { size: 3, unit: 'Marla', expected: 'small' },
  { size: 5, unit: 'Marla', expected: 'small' },
  { size: 5.01, unit: 'Marla', expected: 'medium' },
  { size: 10, unit: 'Marla', expected: 'medium' },
  { size: 10.01, unit: 'Marla', expected: 'large' },
  { size: 1, unit: 'Kanal', expected: 'large' },
  { size: 1089, unit: 'Sq.Ft', expected: 'small' },
  { size: 272.25, unit: 'Sq.Ft', expected: 'small' },
];

for (const tc of testCases) {
  const actual = sizeToVariant(tc.size, tc.unit);
  console.log(`  sizeToVariant(${tc.size}, '${tc.unit}') => ${actual} (expected: ${tc.expected})`);
  assert(actual === tc.expected, `Expected ${tc.size} ${tc.unit} to be '${tc.expected}', got '${actual}'`);
}
console.log('sizeToVariant tests PASSED!\n');

// 2. Test paletteFor determinism & distribution
console.log('2. Testing paletteFor determinism and uniform distribution...');
// Determinism test
const sampleId = 'plot-B-304-faisal';
const pal1 = paletteFor(sampleId);
const pal2 = paletteFor(sampleId);
assert(pal1 === pal2, `Deterministic palette check failed for ${sampleId}`);
console.log(`  Deterministic check: paletteFor('${sampleId}') consistently returns '${pal1}'`);

// Distribution test over 400 random IDs
const counts: Record<string, number> = {
  terracotta: 0,
  slate: 0,
  navy: 0,
  brown: 0,
};

for (let i = 0; i < 400; i++) {
  const randomId = `plot-${i}-${Math.random().toString(36).substring(2, 9)}`;
  const p = paletteFor(randomId);
  counts[p] = (counts[p] || 0) + 1;
}

console.log('  Distribution over 400 random IDs:', counts);
for (const palette of HOUSE_PALETTES) {
  const cnt = counts[palette] || 0;
  console.log(`    ${palette}: ${cnt} (threshold >= 70)`);
  assert(cnt >= 70, `Palette '${palette}' count ${cnt} is below required 70 in 400 samples`);
}
console.log('paletteFor tests PASSED!\n');

// 3. Test manifest aspect ratios against houses.json
console.log('3. Testing manifest aspect ratios against houses.json...');
const manifestPath = path.resolve('public/brand/houses/houses.json');
assert(fs.existsSync(manifestPath), `houses.json not found at ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log(`  small aspect: code=${HOUSE_SIZES.small.aspect}, manifest=${manifest.sizes.small.aspect}`);
assert(HOUSE_SIZES.small.aspect === 0.964, 'Small aspect must be 0.964');
assert(manifest.sizes.small.aspect === 0.964, 'Manifest small aspect must be 0.964');

console.log(`  medium aspect: code=${HOUSE_SIZES.medium.aspect}, manifest=${manifest.sizes.medium.aspect}`);
assert(HOUSE_SIZES.medium.aspect === 1.0, 'Medium aspect must be 1.0');
assert(manifest.sizes.medium.aspect === 1.0, 'Manifest medium aspect must be 1.0');

console.log(`  large aspect: code=${HOUSE_SIZES.large.aspect}, manifest=${manifest.sizes.large.aspect}`);
assert(HOUSE_SIZES.large.aspect === 0.9153, 'Large aspect must be 0.9153');
assert(manifest.sizes.large.aspect === 0.9153, 'Manifest large aspect must be 0.9153');
console.log('Manifest aspect ratios tests PASSED!\n');

console.log('=== ALL TEST-HOUSES.TS CHECKS COMPLETED SUCCESSFULLY ===');
