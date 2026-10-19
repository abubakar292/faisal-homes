import { detectSoldPlotTransitions } from '../src/features/plotHouses/useSoldCelebrations';
import type { Plot } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

console.log('=== RUNNING TEST-CELEBRATIONS.TS ===\n');

const mockPlotsBase: Plot[] = [
  { id: 'plot-1', plotNumber: 'A-101', block: 'A', size: 5, sizeUnit: 'Marla', category: 'General', status: 'available', location: '', description: '', createdAt: new Date() },
  { id: 'plot-2', plotNumber: 'A-102', block: 'A', size: 10, sizeUnit: 'Marla', category: 'General', status: 'sold', location: '', description: '', createdAt: new Date() },
  { id: 'plot-3', plotNumber: 'A-103', block: 'A', size: 7, sizeUnit: 'Marla', category: 'General', status: 'available', location: '', description: '', createdAt: new Date() },
];

// Step 1: Baseline snapshot (isBaseline = true)
console.log('1. Testing baseline snapshot...');
const baseline = detectSoldPlotTransitions(mockPlotsBase, new Map(), true);
console.log('  Baseline newlySold:', baseline.newlySold);
console.log('  Baseline removedSold:', baseline.removedSold);
assert(baseline.newlySold.length === 0, 'Baseline must trigger 0 celebrations');
assert(baseline.removedSold.length === 0, 'Baseline must remove 0 celebrations');
assert(baseline.nextMap.get('plot-1') === 'available', 'plot-1 recorded as available');
assert(baseline.nextMap.get('plot-2') === 'sold', 'plot-2 recorded as sold');
console.log('Baseline check PASSED!\n');

// Step 2: Live transition: plot-1 changes from available -> sold
console.log('2. Testing available -> sold transition...');
const mockPlotsTransition1: Plot[] = [
  { ...mockPlotsBase[0], status: 'sold' }, // available -> sold!
  { ...mockPlotsBase[1] },
  { ...mockPlotsBase[2] },
];

const trans1 = detectSoldPlotTransitions(mockPlotsTransition1, baseline.nextMap, false);
console.log('  Transition 1 newlySold:', trans1.newlySold);
console.log('  Transition 1 removedSold:', trans1.removedSold);
assert(trans1.newlySold.length === 1 && trans1.newlySold[0] === 'plot-1', 'plot-1 must be in newlySold');
assert(trans1.removedSold.length === 0, 'removedSold must be empty');
console.log('Available -> sold check PASSED!\n');

// Step 3: Live transition: plot-1 reverts from sold -> available
console.log('3. Testing sold -> available transition...');
const mockPlotsTransition2: Plot[] = [
  { ...mockPlotsBase[0], status: 'available' }, // sold -> available!
  { ...mockPlotsBase[1] },
  { ...mockPlotsBase[2] },
];

const trans2 = detectSoldPlotTransitions(mockPlotsTransition2, trans1.nextMap, false);
console.log('  Transition 2 newlySold:', trans2.newlySold);
console.log('  Transition 2 removedSold:', trans2.removedSold);
assert(trans2.newlySold.length === 0, 'newlySold must be empty');
assert(trans2.removedSold.length === 1 && trans2.removedSold[0] === 'plot-1', 'plot-1 must be in removedSold');
console.log('Sold -> available check PASSED!\n');

console.log('=== ALL CELEBRATION LOGIC CHECKS PASSED SUCCESSFULLY ===');
