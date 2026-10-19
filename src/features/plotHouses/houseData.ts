export type HouseVariant = 'small' | 'medium' | 'large';
export type HousePalette = 'terracotta' | 'slate' | 'navy' | 'brown';
export type HouseLayer = 'ground' | 'body' | 'roof' | 'front';

export const HOUSE_LAYERS: readonly HouseLayer[] = ['ground', 'body', 'roof', 'front'] as const;
export const HOUSE_PALETTES: readonly HousePalette[] = ['terracotta', 'slate', 'navy', 'brown'] as const;

export interface HouseManifestSize {
  width: number;
  height: number;
  aspect: number;
  ground_center_x_pct: number;
  ground_center_y_pct: number;
}

export const HOUSE_SIZES: Record<HouseVariant, HouseManifestSize> = {
  small: {
    width: 402,
    height: 417,
    aspect: 0.964,
    ground_center_x_pct: 50.0,
    ground_center_y_pct: 51.93,
  },
  medium: {
    width: 420,
    height: 420,
    aspect: 1.0,
    ground_center_x_pct: 49.57,
    ground_center_y_pct: 52.23,
  },
  large: {
    width: 432,
    height: 472,
    aspect: 0.9153,
    ground_center_x_pct: 49.86,
    ground_center_y_pct: 57.52,
  },
};

export function sizeToVariant(size: number, unit: string = 'Marla'): HouseVariant {
  const normUnit = (unit || '').toLowerCase().trim();
  let marla = size;
  if (normUnit === 'kanal') {
    marla = size * 20;
  } else if (normUnit === 'sq.ft' || normUnit === 'sqft' || normUnit === 'sq. ft') {
    marla = size / 272.25;
  }

  if (marla <= 5) return 'small';
  if (marla <= 10) return 'medium';
  return 'large';
}

export function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function paletteFor(plotId: string): HousePalette {
  const idx = djb2Hash(plotId || 'default') % HOUSE_PALETTES.length;
  return HOUSE_PALETTES[idx];
}

export interface HouseSpriteUrls {
  full: string;
  ground: string;
  body: string;
  roof: string;
  front: string;
}

export function spriteUrls(variant: HouseVariant, palette: HousePalette): HouseSpriteUrls {
  return {
    full: `/brand/houses/house-${variant}-full-${palette}.png`,
    ground: `/brand/houses/house-${variant}-ground.png`,
    body: `/brand/houses/house-${variant}-body.png`,
    roof: `/brand/houses/house-${variant}-roof-${palette}.png`,
    front: `/brand/houses/house-${variant}-front.png`,
  };
}
