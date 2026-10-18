import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlotRectItem } from './usePlotRects';
import { HouseInstances } from './HouseInstances';
import { IsoHouse } from './IsoHouse';
import { isWebGLAvailable, shouldUseIsoFallback } from './webgl';

export interface HouseOverlayProps {
  items: PlotRectItem[];
  celebrate?: string[];
  onCelebrationEnd?: (plotId: string) => void;
  plotElementsRef?: React.MutableRefObject<Map<string, HTMLElement>>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  width?: number;
  height?: number;
  forceSvgFallback?: boolean;
}

function OrthoCameraController({ width, height }: { width: number; height: number }) {
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = 0;
      camera.right = width || size.width;
      camera.top = 0;
      camera.bottom = height || size.height;
      camera.near = -1000;
      camera.far = 1000;
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, width, height, size.width, size.height, invalidate]);

  return null;
}

export const HouseOverlay: React.FC<HouseOverlayProps> = ({
  items,
  celebrate = [],
  onCelebrationEnd,
  plotElementsRef,
  containerRef,
  width: propWidth,
  height: propHeight,
  forceSvgFallback = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: propWidth || 800,
    height: propHeight || 600,
  });

  const [canUseWebGL, setCanUseWebGL] = useState<boolean>(true);

  // Capability detection on mount
  useEffect(() => {
    const webglOk = isWebGLAvailable();
    const useIso = shouldUseIsoFallback(items.length);
    setCanUseWebGL(webglOk && !useIso && !forceSvgFallback);
  }, [items.length, forceSvgFallback]);

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    const target = containerRef?.current || overlayRef.current;
    if (!target) return;

    const updateDimensions = () => {
      const rect = target.getBoundingClientRect();
      const scrollW = target.scrollWidth || rect.width;
      const scrollH = target.scrollHeight || rect.height;
      const w = Math.max(rect.width, scrollW);
      const h = Math.max(rect.height, scrollH);
      if (w > 0 && h > 0) {
        setDimensions((prev) => {
          if (Math.abs(prev.width - w) < 1 && Math.abs(prev.height - h) < 1) {
            return prev;
          }
          return { width: w, height: h };
        });
      }
    };

    updateDimensions();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateDimensions) : null;
    if (ro) {
      ro.observe(target);
    }
    window.addEventListener('resize', updateDimensions);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [containerRef]);

  // Fallback: If WebGL is unavailable, render isometric SVG houses on plot boxes
  if (!canUseWebGL) {
    return (
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-10"
        aria-hidden="true"
        style={{ width: '100%', height: '100%' }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="absolute flex items-center justify-center pointer-events-none"
            style={{
              left: `${item.left}px`,
              top: `${item.top}px`,
              width: `${item.width}px`,
              height: `${item.height}px`,
            }}
          >
            <IsoHouse
              palette={item.palette}
              variant={item.variant}
              size={Math.min(item.width, item.height) * 0.7}
            />
          </div>
        ))}
      </div>
    );
  }

  // WebGL 3D instanced overlay
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none z-10"
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: true,
        }}
        orthographic
        camera={{
          position: [0, 0, 500],
          near: -1000,
          far: 1000,
        }}
        style={{
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <OrthoCameraController
          width={dimensions.width}
          height={dimensions.height}
        />
        <ambientLight intensity={0.45} />
        <directionalLight position={[200, -350, 500]} intensity={1.2} />
        <hemisphereLight args={['#ffffff', '#64748b', 0.65]} />

        <HouseInstances
          items={items}
          celebrate={celebrate}
          onCelebrationEnd={onCelebrationEnd}
          plotElementsRef={plotElementsRef}
        />
      </Canvas>
    </div>
  );
};

export default HouseOverlay;
