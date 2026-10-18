import { Vector3 } from 'three';
import {
  OBLIQUE_SHEAR_MATRIX,
  SHEAR_K,
  convertToMarla,
  getSizeVariant,
  getHouseGeometries,
  disposeHouseGeometries,
} from '../src/features/plotMap3d/houseModels';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

console.log('--- Testing House Models & Shear Matrix ---');

// 1. Verify Shear Matrix
console.log('1. Testing shear matrix behavior...');
const vZ = new Vector3(0, 0, 1).applyMatrix4(OBLIQUE_SHEAR_MATRIX);
console.log(`Vector (0, 0, 1) sheared -> (${vZ.x.toFixed(4)}, ${vZ.y.toFixed(4)}, ${vZ.z.toFixed(4)})`);
assert(Math.abs(vZ.x - 0) < 1e-5, 'Shear X coordinate must be 0');
assert(Math.abs(vZ.y - SHEAR_K) < 1e-5, `Shear Y coordinate must be ${SHEAR_K}`);
assert(Math.abs(vZ.z - 1) < 1e-5, 'Shear Z coordinate must be 1');

const testPointsXY = [
  new Vector3(0, 0, 0),
  new Vector3(1, 2, 0),
  new Vector3(-3.5, 4.2, 0),
  new Vector3(100, -50, 0),
];

for (const p of testPointsXY) {
  const original = p.clone();
  const transformed = p.clone().applyMatrix4(OBLIQUE_SHEAR_MATRIX);
  assert(
    Math.abs(transformed.x - original.x) < 1e-5 &&
    Math.abs(transformed.y - original.y) < 1e-5 &&
    Math.abs(transformed.z - 0) < 1e-5,
    `Shear matrix must leave (x,y,0) unchanged for point (${original.x}, ${original.y}, 0)`
  );
}
console.log('PASS: Shear matrix correctly maps (0,0,1) to (0, 0.6, 1) and preserves (x,y,0).');

// 2. Testing Size Variant Mapping
console.log('2. Testing size-to-variant mapping...');
const testCases = [
  { size: 3, unit: 'Marla', expectedMarla: 3, expectedVariant: 0 },
  { size: 5, unit: 'Marla', expectedMarla: 5, expectedVariant: 0 },
  { size: 5.01, unit: 'Marla', expectedMarla: 5.01, expectedVariant: 1 },
  { size: 10, unit: 'Marla', expectedMarla: 10, expectedVariant: 1 },
  { size: 10.01, unit: 'Marla', expectedMarla: 10.01, expectedVariant: 2 },
  { size: 1, unit: 'Kanal', expectedMarla: 20, expectedVariant: 2 },
  { size: 1089, unit: 'Sq.Ft', expectedMarla: 4, expectedVariant: 0 },
];

for (const tc of testCases) {
  const marla = convertToMarla(tc.size, tc.unit);
  const variant = getSizeVariant(tc.size, tc.unit);
  console.log(
    `Input: ${tc.size} ${tc.unit} -> ${marla.toFixed(2)} Marla -> Variant ${variant} (expected: ${tc.expectedVariant})`
  );
  assert(
    Math.abs(marla - tc.expectedMarla) < 1e-4,
    `Unit conversion failed for ${tc.size} ${tc.unit}: got ${marla}, expected ${tc.expectedMarla}`
  );
  assert(
    variant === tc.expectedVariant,
    `Variant mismatch for ${tc.size} ${tc.unit}: got ${variant}, expected ${tc.expectedVariant}`
  );
}
console.log('PASS: Size-to-variant mappings verified for all test cases.');

// 3. Testing 12 House Variants Geometries & Triangle Counts
console.log('3. Testing 12 house variants geometry generation...');
const geometries = getHouseGeometries();

assert(geometries.length === 3, `Expected 3 size variant rows, got ${geometries.length}`);

const variantNames = ['Compact (<=5 Marla)', 'Medium (5-10 Marla)', 'Large (>10 Marla)'];
const paletteNames = ['Navy', 'Terracotta', 'Slate', 'Ochre'];

let totalVariants = 0;
for (let v = 0; v < 3; v++) {
  assert(geometries[v].length === 4, `Expected 4 palette variants for size ${v}`);
  for (let p = 0; p < 4; p++) {
    const geom = geometries[v][p];
    assert(!!geom, `Geometry for variant [${v}][${p}] must exist`);
    
    // Check triangles
    const posAttr = geom.getAttribute('position');
    const colorAttr = geom.getAttribute('color');
    assert(!!posAttr, `Geometry must have position attribute`);
    assert(!!colorAttr, `Geometry must have color vertex attribute`);
    
    const vertexCount = posAttr.count;
    const indexAttr = geom.getIndex();
    const triangleCount = indexAttr ? indexAttr.count / 3 : vertexCount / 3;
    
    console.log(
      `Variant [Size: ${variantNames[v]}, Palette: ${paletteNames[p]}]: ` +
      `${triangleCount} triangles, ${vertexCount} vertices`
    );
    
    assert(
      triangleCount < 600,
      `Triangle count for variant [${v}][${p}] must be < 600, got ${triangleCount}`
    );
    totalVariants++;
  }
}

assert(totalVariants === 12, `Must build exactly 12 variants, built ${totalVariants}`);
console.log(`PASS: All 12 variants built successfully with triangle count < 600.`);

disposeHouseGeometries();
console.log('PASS: Geometries disposed without error.');
console.log('ALL H2 TESTS PASSED.');
