/**
 * WCAG 2.1 relative luminance and contrast ratio utilities
 */

export function parseHex(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (cleaned.length !== 6) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function toHex(r: number, g: number, b: number): string {
  const toHexPart = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const toLinear = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function contrastRatio(colorA: string, colorB: string): number {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Number(ratio.toFixed(2));
}

/**
 * Darkens a color gradually by reducing RGB channels until contrast ratio against background >= minRatio.
 */
export function ensureMinContrast(colorHex: string, bgHex: string, minRatio = 3.0): string {
  if (contrastRatio(colorHex, bgHex) >= minRatio) {
    return colorHex.toLowerCase();
  }
  let { r, g, b } = parseHex(colorHex);
  for (let i = 0; i < 100; i++) {
    r = Math.max(0, Math.round(r * 0.95));
    g = Math.max(0, Math.round(g * 0.95));
    b = Math.max(0, Math.round(b * 0.95));
    const candidate = toHex(r, g, b);
    if (contrastRatio(candidate, bgHex) >= minRatio) {
      return candidate.toLowerCase();
    }
  }
  return '#000000';
}

export interface PlotMapTokens {
  panelBg: string;
  available: { fill: string; border: string; borderInitial: string };
  booked: { fill: string; border: string; borderInitial: string };
  sold: { fill: string; border: string; borderInitial: string };
  reserved: { fill: string; border: string; borderInitial: string };
  cancelled: { fill: string; border: string; borderInitial: string };
  selectedRing: string;
}

export const PANEL_BG = '#f1f5f9';

// Default base tokens specified in P1-4
export const INITIAL_PLOT_TOKENS = {
  panelBg: '#f1f5f9',
  available: { fill: '#ffffff', border: '#7c8ba1' },
  booked: { fill: '#fffbeb', border: '#f59e0b' },
  sold: { fill: '#ecfdf5', border: '#34d399' },
  reserved: { fill: '#f5f3ff', border: '#8b5cf6' },
  cancelled: { fill: '#fef2f2', border: '#f87171' },
  selectedRing: '#1a3c6e',
};

// Validated tokens where every border is guaranteed >= 3:1 against panel background (#f1f5f9)
// and available border is >= 3:1 against BOTH its fill (#ffffff) and panel (#f1f5f9)
export const PLOT_MAP_TOKENS: PlotMapTokens = {
  panelBg: PANEL_BG,
  available: {
    fill: '#ffffff',
    borderInitial: '#7c8ba1',
    border: ensureMinContrast('#7c8ba1', PANEL_BG, 3.0),
  },
  booked: {
    fill: '#fffbeb',
    borderInitial: '#f59e0b',
    border: ensureMinContrast('#f59e0b', PANEL_BG, 3.0),
  },
  sold: {
    fill: '#ecfdf5',
    borderInitial: '#34d399',
    border: ensureMinContrast('#34d399', PANEL_BG, 3.0),
  },
  reserved: {
    fill: '#f5f3ff',
    borderInitial: '#8b5cf6',
    border: ensureMinContrast('#8b5cf6', PANEL_BG, 3.0),
  },
  cancelled: {
    fill: '#fef2f2',
    borderInitial: '#f87171',
    border: ensureMinContrast('#f87171', PANEL_BG, 3.0),
  },
  selectedRing: '#1a3c6e',
};
