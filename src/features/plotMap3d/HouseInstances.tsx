import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  OBLIQUE_SHEAR_MATRIX,
  getHouseGeometries,
  type HouseVariantIndex,
  type RoofPaletteIndex,
} from './houseModels';
import type { PlotRectItem } from './usePlotRects';
import {
  startCelebrationAnimation,
  type HouseAnimState,
  createInitialAnimState,
} from './buildAnimation';
import { isReducedMotion } from './webgl';

interface HouseInstancesProps {
  items: PlotRectItem[];
  celebrate?: string[];
  onCelebrationEnd?: (plotId: string) => void;
  plotElementsRef?: React.MutableRefObject<Map<string, HTMLElement>>;
}

const dummyMatrix = new THREE.Matrix4();
const dummyPosition = new THREE.Vector3();
const dummyScale = new THREE.Vector3();
const dummyQuaternion = new THREE.Quaternion();

// Procedural soft contact shadow texture
function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.20)');
    grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const HouseInstances: React.FC<HouseInstancesProps> = ({
  items,
  celebrate = [],
  onCelebrationEnd,
  plotElementsRef,
}) => {
  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Group items by variant and palette (3 x 4 = 12 buckets)
  const buckets = useMemo(() => {
    const b: PlotRectItem[][] = Array.from({ length: 12 }, () => []);
    for (const item of items) {
      const idx = item.variant * 4 + item.palette;
      b[idx].push(item);
    }
    return b;
  }, [items]);

  // House geometries and shared material
  const houseGeometries = useMemo(() => getHouseGeometries(), []);
  const houseMaterial = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
      }),
    []
  );

  // Soft shadow resources
  const shadowTexture = useMemo(() => createRadialShadowTexture(), []);
  const shadowGeometry = useMemo(() => new THREE.PlaneGeometry(1.4, 1.2), []);
  const shadowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    [shadowTexture]
  );

  // Mesh references for up to 12 house variants and 1 shadow mesh
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const shadowMeshRef = useRef<THREE.InstancedMesh | null>(null);

  // Active celebrations state: plotId -> HouseAnimState
  const [animStates, setAnimStates] = useState<Map<string, HouseAnimState>>(
    new Map()
  );
  const activeAnimPlotsRef = useRef<Set<string>>(new Set());

  // Setup Oblique Shear matrix on group
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.matrix.copy(OBLIQUE_SHEAR_MATRIX);
      groupRef.current.matrixAutoUpdate = false;
      groupRef.current.updateMatrixWorld(true);
      invalidate();
    }
  }, [invalidate]);

  // Celebration management (cap at 6 simultaneous celebrations)
  useEffect(() => {
    if (!celebrate || celebrate.length === 0) return;

    const reducedMotion = isReducedMotion();
    const availableSlots = Math.max(0, 6 - activeAnimPlotsRef.current.size);
    const toStart = celebrate
      .filter((id) => !activeAnimPlotsRef.current.has(id))
      .slice(0, availableSlots);

    for (const plotId of toStart) {
      activeAnimPlotsRef.current.add(plotId);
      const el = plotElementsRef?.current?.get(plotId) || null;

      startCelebrationAnimation(
        plotId,
        el,
        reducedMotion,
        (state) => {
          setAnimStates((prev) => {
            const next = new Map(prev);
            next.set(plotId, state);
            return next;
          });
        },
        () => {
          activeAnimPlotsRef.current.delete(plotId);
          setAnimStates((prev) => {
            const next = new Map(prev);
            next.delete(plotId);
            return next;
          });
          if (onCelebrationEnd) {
            onCelebrationEnd(plotId);
          }
        },
        invalidate
      );
    }
  }, [celebrate, onCelebrationEnd, plotElementsRef, invalidate]);

  // Initial load staggered pop-in wave (once per session, max 300 visible houses)
  const initialWaveDoneRef = useRef<boolean>(false);
  const [waveProgress, setWaveProgress] = useState<number>(1);

  useEffect(() => {
    const sessionKey = 'faisal_houses_wave_played';
    const played = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey);

    if (played || items.length > 300 || isReducedMotion()) {
      initialWaveDoneRef.current = true;
      setWaveProgress(1);
      return;
    }

    if (!initialWaveDoneRef.current && items.length > 0) {
      initialWaveDoneRef.current = true;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(sessionKey, '1');
      }

      const startTime = performance.now();
      const duration = 1000; // 1.0 s total wave

      const tick = () => {
        const elapsed = performance.now() - startTime;
        const p = Math.min(1, elapsed / duration);
        setWaveProgress(p);
        invalidate();
        if (p < 1) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }
  }, [items.length, invalidate]);

  // Update instance matrices for each bucket and shadows
  useEffect(() => {
    let shadowIdx = 0;
    const shadowMesh = shadowMeshRef.current;

    for (let bucketIdx = 0; bucketIdx < 12; bucketIdx++) {
      const mesh = meshRefs.current[bucketIdx];
      const bucketItems = buckets[bucketIdx];
      if (!mesh) continue;

      mesh.count = bucketItems.length;

      for (let i = 0; i < bucketItems.length; i++) {
        const item = bucketItems[i];
        const baseFootprint = 0.7 * Math.min(item.width, item.height);

        // Apply initial wave stagger if active
        let currentScale = baseFootprint;
        if (waveProgress < 1) {
          const itemStagger = (i / Math.max(1, bucketItems.length)) * 0.6;
          const localProgress = Math.max(
            0,
            Math.min(1, (waveProgress - itemStagger) / 0.4)
          );
          currentScale *= localProgress;
        }

        // Apply celebration anim state if active
        const anim = animStates.get(item.id);
        const scaleXY = anim ? currentScale * anim.scaleXY : currentScale;
        const scaleZ = anim ? currentScale * anim.scaleZ : currentScale;
        const zOffset = anim ? anim.zOffset * currentScale : 0;

        const cx = item.left + item.width / 2;
        const cy = item.top + item.height / 2;

        dummyPosition.set(cx, cy, zOffset);
        dummyScale.set(scaleXY, scaleXY, scaleZ);
        dummyQuaternion.set(0, 0, 0, 1);
        dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);

        mesh.setMatrixAt(i, dummyMatrix);

        // Ground shadow
        if (shadowMesh && shadowIdx < items.length) {
          dummyPosition.set(cx, cy + 0.05 * currentScale, -0.005);
          dummyScale.set(scaleXY * 1.25, scaleXY * 1.1, 1);
          dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);
          shadowMesh.setMatrixAt(shadowIdx, dummyMatrix);
          shadowIdx++;
        }
      }

      mesh.instanceMatrix.needsUpdate = true;
    }

    if (shadowMesh) {
      shadowMesh.count = shadowIdx;
      shadowMesh.instanceMatrix.needsUpdate = true;
    }

    invalidate();
  }, [buckets, items.length, animStates, waveProgress, invalidate]);

  // Clean disposal on unmount
  useEffect(() => {
    return () => {
      houseMaterial.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
    };
  }, [houseMaterial, shadowGeometry, shadowMaterial, shadowTexture]);

  // Sparkles from active celebrations
  const sparklesList = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; opacity: number }> = [];
    animStates.forEach((state, plotId) => {
      const item = items.find((it) => it.id === plotId);
      if (!item || !state.sparkles.length) return;
      const baseFootprint = 0.7 * Math.min(item.width, item.height);
      const cx = item.left + item.width / 2;
      const cy = item.top + item.height / 2;

      for (const sp of state.sparkles) {
        list.push({
          x: cx + sp.x * baseFootprint,
          y: cy + sp.y * baseFootprint,
          z: sp.z * baseFootprint,
          opacity: sp.opacity,
        });
      }
    });
    return list;
  }, [animStates, items]);

  const sparklesGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    if (sparklesList.length === 0) return geom;
    const positions = new Float32Array(sparklesList.length * 3);
    const colors = new Float32Array(sparklesList.length * 3);
    const gold = new THREE.Color('#e7b861');

    for (let i = 0; i < sparklesList.length; i++) {
      const sp = sparklesList[i];
      positions[i * 3] = sp.x;
      positions[i * 3 + 1] = sp.y;
      positions[i * 3 + 2] = sp.z;

      colors[i * 3] = gold.r * sp.opacity;
      colors[i * 3 + 1] = gold.g * sp.opacity;
      colors[i * 3 + 2] = gold.b * sp.opacity;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [sparklesList]);

  const sparklesMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 5,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  return (
    <group ref={groupRef} matrixAutoUpdate={false}>
      {/* 1. Ground Shadows (Instanced) */}
      <instancedMesh
        ref={shadowMeshRef}
        args={[shadowGeometry, shadowMaterial, Math.max(1, items.length)]}
        count={items.length}
      />

      {/* 2. 12 House Variant Instanced Meshes */}
      {Array.from({ length: 12 }, (_, idx) => {
        const v = Math.floor(idx / 4) as HouseVariantIndex;
        const p = (idx % 4) as RoofPaletteIndex;
        const geom = houseGeometries[v][p];
        const count = buckets[idx].length;

        return (
          <instancedMesh
            key={`variant-${idx}`}
            ref={(el) => {
              meshRefs.current[idx] = el;
            }}
            args={[geom, houseMaterial, Math.max(1, count)]}
            count={count}
          />
        );
      })}

      {/* 3. Celebration Sparkles */}
      {sparklesList.length > 0 && (
        <points geometry={sparklesGeometry} material={sparklesMaterial} />
      )}
    </group>
  );
};
