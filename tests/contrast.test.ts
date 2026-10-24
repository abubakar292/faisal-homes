import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  relativeLuminance,
  PLOT_MAP_TOKENS,
  PANEL_BG,
} from '../src/utils/contrast';

describe('P1-4 Contrast Utilities and Plot Map Tokens', () => {
  it('correctly calculates WCAG relative luminance for black and white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
  });

  it('asserts available tile border has a ratio of at least 3:1 against BOTH its own fill and panel background', () => {
    const availableBorder = PLOT_MAP_TOKENS.available.border;
    const availableFill = PLOT_MAP_TOKENS.available.fill; // #ffffff
    const panelBg = PLOT_MAP_TOKENS.panelBg; // #f1f5f9

    const ratioAgainstFill = contrastRatio(availableBorder, availableFill);
    const ratioAgainstPanel = contrastRatio(availableBorder, panelBg);

    console.log(`Available border (${availableBorder}) vs fill (${availableFill}): ${ratioAgainstFill}:1`);
    console.log(`Available border (${availableBorder}) vs panel (${panelBg}): ${ratioAgainstPanel}:1`);

    expect(ratioAgainstFill).toBeGreaterThanOrEqual(3.0);
    expect(ratioAgainstPanel).toBeGreaterThanOrEqual(3.0);
  });

  it('asserts that every status border is at least 3:1 against the panel background and prints ratio table', () => {
    const statuses: Array<keyof typeof PLOT_MAP_TOKENS & ('available' | 'booked' | 'sold' | 'reserved' | 'cancelled')> = [
      'available',
      'booked',
      'sold',
      'reserved',
      'cancelled',
    ];

    const resultsTable: Array<{
      Status: string;
      Fill: string;
      'Initial Border': string;
      'Validated Border': string;
      'Border vs Fill Ratio': string;
      'Border vs Panel Ratio': string;
      'Passes >= 3:1': string;
    }> = [];

    statuses.forEach((status) => {
      const token = PLOT_MAP_TOKENS[status];
      const vsFill = contrastRatio(token.border, token.fill);
      const vsPanel = contrastRatio(token.border, PANEL_BG);

      resultsTable.push({
        Status: status.toUpperCase(),
        Fill: token.fill,
        'Initial Border': token.borderInitial,
        'Validated Border': token.border,
        'Border vs Fill Ratio': `${vsFill.toFixed(2)}:1`,
        'Border vs Panel Ratio': `${vsPanel.toFixed(2)}:1`,
        'Passes >= 3:1': vsPanel >= 3.0 ? 'YES' : 'NO',
      });

      expect(vsPanel).toBeGreaterThanOrEqual(3.0);
    });

    console.log('\n=== COMPUTED CONTRAST RATIOS TABLE ===');
    console.table(resultsTable);
  });
});
