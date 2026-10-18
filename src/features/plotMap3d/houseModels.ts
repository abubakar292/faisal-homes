import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Vector3,
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SHEAR_K = 0.6;

// Oblique shear matrix: vertical Z offsets are sheared into screen Y
export const OBLIQUE_SHEAR_MATRIX = new Matrix4().set(
  1, 0, 0, 0,
  0, 1, SHEAR_K, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
);

export const ROOF_PALETTES = [
  '#1a3c6e', // 0: Navy
  '#b5532f', // 1: Terracotta
  '#4a5568', // 2: Slate
  '#c28a2c', // 3: Ochre
] as const;

export type RoofPaletteIndex = 0 | 1 | 2 | 3;
export type HouseVariantIndex = 0 | 1 | 2; // 0: Compact, 1: Medium, 2: Large

export function convertToMarla(size: number, unit?: string): number {
  if (!size || isNaN(size) || size <= 0) return 0;
  const normalizedUnit = (unit || 'Marla').toLowerCase();
  if (normalizedUnit.includes('kanal')) return size * 20;
  if (normalizedUnit.includes('sq') || normalizedUnit.includes('ft')) return size / 272.25;
  return size;
}

export function getSizeVariant(size: number, unit?: string): HouseVariantIndex {
  const marla = convertToMarla(size, unit);
  if (marla <= 5) return 0;
  if (marla <= 10) return 1;
  return 2;
}

export function hashPlotId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getPlotPalette(id: string): RoofPaletteIndex {
  return (hashPlotId(id) % 4) as RoofPaletteIndex;
}

function applyVertexColor(geometry: BufferGeometry, hex: string): BufferGeometry {
  const count = geometry.attributes.position.count;
  const col = new Color(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function preparePart(geometry: BufferGeometry, hex: string): BufferGeometry {
  const geom = geometry.index ? geometry.toNonIndexed() : geometry;
  if (geom.attributes.uv) {
    geom.deleteAttribute('uv');
  }
  if (!geom.attributes.normal) {
    geom.computeVertexNormals();
  }
  applyVertexColor(geom, hex);
  return geom;
}

function createPrismRoof(
  width: number,
  depth: number,
  height: number,
  baseZ: number,
  hex: string
): BufferGeometry {
  const halfW = width / 2;
  const halfD = depth / 2;
  const topZ = baseZ + height;

  // 6 vertices
  const v0 = [-halfW, -halfD, baseZ]; // 0: back left
  const v1 = [-halfW, halfD, baseZ];  // 1: front left
  const v2 = [-halfW, 0, topZ];       // 2: ridge left
  const v3 = [halfW, -halfD, baseZ];  // 3: back right
  const v4 = [halfW, halfD, baseZ];   // 4: front right
  const v5 = [halfW, 0, topZ];        // 5: ridge right

  // 8 triangles
  const positions: number[] = [
    // Left gable (triangle)
    ...v0, ...v1, ...v2,
    // Right gable (triangle)
    ...v4, ...v3, ...v5,
    // Back slope
    ...v0, ...v2, ...v5,
    ...v0, ...v5, ...v3,
    // Front slope
    ...v1, ...v4, ...v5,
    ...v1, ...v5, ...v2,
    // Bottom
    ...v0, ...v3, ...v4,
    ...v0, ...v4, ...v1,
  ];

  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return preparePart(geom, hex);
}

export function buildHouseGeometry(variant: HouseVariantIndex, palette: RoofPaletteIndex): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const roofColor = ROOF_PALETTES[palette];

  // 1. Main Walls: 1.0 x 0.8 x 0.55, cream #f5efe6
  const walls = new BoxGeometry(1.0, 0.8, 0.55);
  walls.translate(0, 0, 0.275);
  parts.push(preparePart(walls, '#f5efe6'));

  // 2. Main Roof: triangular prism along width, overhang 0.08, height 0.35 above walls
  // width = 1.0 + 0.16 = 1.16, depth = 0.8 + 0.16 = 0.96
  const roof = createPrismRoof(1.16, 0.96, 0.35, 0.55, roofColor);
  parts.push(roof);

  // 3. Front Door: 0.18 x 0.02 x 0.32 gold #e7b861 centered on front (Y = 0.4)
  const door = new BoxGeometry(0.18, 0.02, 0.32);
  door.translate(0, 0.4 + 0.01, 0.16);
  parts.push(preparePart(door, '#e7b861'));

  // 4. Porch Step under door
  const step = new BoxGeometry(0.24, 0.06, 0.05);
  step.translate(0, 0.43, 0.025);
  parts.push(preparePart(step, '#dfd8ce'));

  // 5. Two Windows: 0.16 x 0.02 x 0.16 light blue #9cc7f0
  const winLeft = new BoxGeometry(0.16, 0.02, 0.16);
  winLeft.translate(-0.28, 0.405, 0.32);
  parts.push(preparePart(winLeft, '#9cc7f0'));

  const winRight = new BoxGeometry(0.16, 0.02, 0.16);
  winRight.translate(0.28, 0.405, 0.32);
  parts.push(preparePart(winRight, '#9cc7f0'));

  // 6. Chimney: 0.1 x 0.1 x 0.3 brick #8c4a32
  const chimney = new BoxGeometry(0.1, 0.1, 0.3);
  chimney.translate(0.25, -0.15, 0.72);
  parts.push(preparePart(chimney, '#8c4a32'));

  // 7. Medium variant extras: Side Wing Box + Wing Roof
  if (variant >= 1) {
    const wing = new BoxGeometry(0.35, 0.55, 0.42);
    wing.translate(-0.62, -0.05, 0.21);
    parts.push(preparePart(wing, '#f5efe6'));

    const wingRoof = createPrismRoof(0.42, 0.65, 0.24, 0.42, roofColor);
    wingRoof.translate(-0.62, -0.05, 0);
    parts.push(wingRoof);
  }

  // 8. Large variant extras: Garage box + garage door + small tree
  if (variant === 2) {
    // Garage
    const garage = new BoxGeometry(0.45, 0.65, 0.38);
    garage.translate(0.68, -0.02, 0.19);
    parts.push(preparePart(garage, '#ece4d8'));

    // Garage door
    const garageDoor = new BoxGeometry(0.32, 0.02, 0.28);
    garageDoor.translate(0.68, 0.31, 0.14);
    parts.push(preparePart(garageDoor, '#5c677d'));

    // Tree trunk
    const trunk = new CylinderGeometry(0.04, 0.05, 0.16, 5);
    trunk.rotateX(Math.PI / 2);
    trunk.translate(-0.75, 0.32, 0.08);
    parts.push(preparePart(trunk, '#6b4c38'));

    // Tree foliage: cone 0.18 radius x 0.4, green #3f8f5a
    const cone = new ConeGeometry(0.18, 0.4, 6);
    cone.rotateX(Math.PI / 2);
    cone.translate(-0.75, 0.32, 0.32);
    parts.push(preparePart(cone, '#3f8f5a'));
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  return merged;
}

// 12 Geometries cache (3 sizes x 4 palettes)
let geometriesCache: BufferGeometry[][] | null = null;

export function getHouseGeometries(): BufferGeometry[][] {
  if (!geometriesCache) {
    geometriesCache = [];
    for (let v = 0; v < 3; v++) {
      const row: BufferGeometry[] = [];
      for (let p = 0; p < 4; p++) {
        row.push(buildHouseGeometry(v as HouseVariantIndex, p as RoofPaletteIndex));
      }
      geometriesCache.push(row);
    }
  }
  return geometriesCache;
}

export function disposeHouseGeometries(): void {
  if (geometriesCache) {
    for (const row of geometriesCache) {
      for (const geom of row) {
        geom.dispose();
      }
    }
    geometriesCache = null;
  }
}
