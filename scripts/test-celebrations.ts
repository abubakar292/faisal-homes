import { detectSoldPlotTransitions } from '../src/features/plotMap3d/useSoldCelebrations';
import type { Plot } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

console.log('--- Unit Testing useSoldCelebrations Live Logic ---');

// Fake plots generator
function createPlot(id: string, status: Plot['status']): Plot {
  return {
    id,
    plotNumber: id.toUpperCase(),
    block: 'A',
    size: 5,
    sizeUnit: 'Marla',
    category: 'General',
    status,
    location: 'Phase 1',
    description: 'Test plot',
    createdAt: new Date(),
  };
}

let statusMap = new Map<string, string>();
let isBaseline = true;

// 1. Baseline snapshot
console.log('1. Testing baseline snapshot...');
const initialPlots: Plot[] = [
  createPlot('plot-1', 'available'),
  createPlot('plot-2', 'booked'),
  createPlot('plot-3', 'sold'),
  createPlot('plot-4', 'available'),
];

const res1 = detectSoldPlotTransitions(initialPlots, statusMap, isBaseline);
statusMap = res1.nextMap;
isBaseline = false;

console.log(`Baseline result: newlySold = [${res1.newlySold.join(', ')}], map size = ${statusMap.size}`);
assert(res1.newlySold.length === 0, 'Baseline snapshot must trigger 0 celebrations');
assert(res1.removedSold.length === 0, 'Baseline snapshot must have 0 removals');
assert(statusMap.size === 4, 'Baseline status map must contain 4 plots');
console.log('PASS: Baseline snapshot correctly recorded without triggering celebrations.');

// 2. Later update: plot-1 changes from available -> sold
console.log('2. Testing available -> sold transition on plot-1...');
const updatedPlots1: Plot[] = [
  createPlot('plot-1', 'sold'),      // changed available -> sold
  createPlot('plot-2', 'booked'),    // unchanged
  createPlot('plot-3', 'sold'),      // was already sold -> should NOT celebrate again
  createPlot('plot-4', 'available'), // unchanged
];

const res2 = detectSoldPlotTransitions(updatedPlots1, statusMap, isBaseline);
statusMap = res2.nextMap;

console.log(`Update 1 result: newlySold = [${res2.newlySold.join(', ')}]`);
assert(res2.newlySold.length === 1, 'Expected exactly 1 celebration');
assert(res2.newlySold[0] === 'plot-1', 'Expected plot-1 to celebrate');
assert(!res2.newlySold.includes('plot-3'), 'Already sold plot-3 must not celebrate again');
console.log('PASS: available -> sold correctly triggered exactly one celebration for plot-1.');

// 3. Later update: plot-1 changes from sold -> available (e.g. cancellation)
console.log('3. Testing sold -> available transition on plot-1...');
const updatedPlots2: Plot[] = [
  createPlot('plot-1', 'available'), // changed sold -> available
  createPlot('plot-2', 'booked'),
  createPlot('plot-3', 'sold'),
  createPlot('plot-4', 'available'),
];

const res3 = detectSoldPlotTransitions(updatedPlots2, statusMap, isBaseline);
statusMap = res3.nextMap;

console.log(`Update 2 result: removedSold = [${res3.removedSold.join(', ')}]`);
assert(res3.removedSold.length === 1, 'Expected exactly 1 removal');
assert(res3.removedSold[0] === 'plot-1', 'Expected plot-1 to be removed from celebrations');
assert(res3.newlySold.length === 0, 'Expected 0 celebrations when status changed to available');
console.log('PASS: sold -> available correctly triggered removal.');

console.log('ALL CELEBRATION LOGIC TESTS PASSED.');
