import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  type HouseVariant,
  type HousePalette,
  HOUSE_SIZES,
  spriteUrls,
} from './houseData';
import { useBuildSlot } from './useBuildQueue';

export interface HouseSpriteProps {
  plotId?: string;
  variant: HouseVariant;
  palette: HousePalette;
  height?: number;
  heightClass?: string;
  mode?: 'static' | 'build';
  onBuilt?: () => void;
  className?: string;
}

const SPARKLE_COUNT = 10;

export const HouseSprite: React.FC<HouseSpriteProps> = ({
  plotId = 'plot',
  variant,
  palette,
  height,
  heightClass = 'h-[74px] sm:h-[82px]',
  mode = 'static',
  onBuilt,
  className = '',
}) => {
  const [loadError, setLoadError] = useState(false);
  const [isBuilt, setIsBuilt] = useState(false);

  const manifest = HOUSE_SIZES[variant] || HOUSE_SIZES.small;
  const urls = spriteUrls(variant, palette);

  const sizeStyle: React.CSSProperties = height
    ? { width: `${Math.round(height * manifest.aspect)}px`, height: `${height}px` }
    : { aspectRatio: `${manifest.aspect}` };
  const sizeClasses = height ? '' : `${heightClass} w-auto`;

  // Check user motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wantsToBuild = mode === 'build' && !isBuilt && !prefersReducedMotion;
  const hasBuildSlot = useBuildSlot(plotId, wantsToBuild);

  // Animation DOM refs
  const groundRef = useRef<HTMLImageElement>(null);
  const bodyRef = useRef<HTMLImageElement>(null);
  const roofRef = useRef<HTMLImageElement>(null);
  const frontRef = useRef<HTMLImageElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const sparklesRef = useRef<HTMLDivElement>(null);

  // Immediate complete if reduced motion
  useEffect(() => {
    if (mode === 'build' && prefersReducedMotion && !isBuilt) {
      setIsBuilt(true);
      onBuilt?.();
    }
  }, [mode, prefersReducedMotion, isBuilt, onBuilt]);

  // Run build animation when build slot is acquired
  useEffect(() => {
    if (!wantsToBuild || !hasBuildSlot) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          setIsBuilt(true);
          onBuilt?.();
        },
      });

      // 0.00 - 0.45s: Ground layer rises & scales up + pulse ring
      if (groundRef.current) {
        tl.fromTo(
          groundRef.current,
          { opacity: 0, scale: 0.92, transformOrigin: 'bottom center' },
          { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out' },
          0
        );
      }

      if (ringRef.current) {
        tl.fromTo(
          ringRef.current,
          { opacity: 0.85, scale: 0.8 },
          { opacity: 0, scale: 1.3, duration: 0.45, ease: 'power2.out' },
          0
        );
      }

      // 0.20 - 1.00s: Body (walls) rise from the ground via clip-path
      if (bodyRef.current) {
        tl.fromTo(
          bodyRef.current,
          { clipPath: 'inset(100% 0 0 0)', opacity: 1 },
          { clipPath: 'inset(0% 0 0 0)', opacity: 1, duration: 0.8, ease: 'power2.out' },
          0.2
        );
      }

      // 0.85 - 1.45s: Roof drops and settles with bounce
      if (roofRef.current) {
        tl.fromTo(
          roofRef.current,
          { y: -30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.5)' },
          0.85
        );
      }

      // 1.25 - 1.75s: Front gate, boundary wall, hedges slide into place
      if (frontRef.current) {
        tl.fromTo(
          frontRef.current,
          { y: 6, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' },
          1.25
        );
      }

      // 1.30 - 2.40s: 10 gold sparkle dots drifting up and fading from roof area
      if (sparklesRef.current) {
        const dots = sparklesRef.current.children;
        for (let i = 0; i < dots.length; i++) {
          const dot = dots[i];
          const startX = (i % 5) * 8 - 16 + (Math.random() * 6 - 3);
          const startY = Math.floor(i / 5) * 8 - 10 + (Math.random() * 4 - 2);
          const driftY = -18 - Math.random() * 14;
          const driftX = startX + (Math.random() * 12 - 6);
          const startTime = 1.3 + i * 0.07;

          tl.fromTo(
            dot,
            { x: startX, y: startY, opacity: 0, scale: 0 },
            { x: driftX, y: startY + driftY * 0.5, opacity: 1, scale: 1.2, duration: 0.45, ease: 'power1.out' },
            startTime
          );
          tl.to(
            dot,
            { y: startY + driftY, opacity: 0, scale: 0.4, duration: 0.45, ease: 'power1.in' },
            startTime + 0.35
          );
        }
      }
    });

    return () => {
      ctx.revert();
    };
  }, [wantsToBuild, hasBuildSlot, onBuilt]);

  if (loadError) {
    return null;
  }

  // If in static mode or build animation has finished, render single crisp full sprite
  if (!wantsToBuild || isBuilt) {
    return (
      <div
        className={`relative inline-block pointer-events-none select-none ${sizeClasses} ${className}`}
        style={sizeStyle}
      >
        <img
          src={urls.full}
          alt=""
          aria-hidden
          draggable={false}
          decoding="async"
          loading="lazy"
          onError={() => setLoadError(true)}
          className="w-full h-full object-contain pointer-events-none select-none block"
        />
      </div>
    );
  }

  // Render build layers stacked
  return (
    <div
      className={`relative inline-block pointer-events-none select-none overflow-visible ${sizeClasses} ${className}`}
      style={sizeStyle}
    >
      {/* Soft pulse ring */}
      <div
        ref={ringRef}
        className="absolute inset-0 rounded-full border border-amber-400/50 pointer-events-none"
        style={{ opacity: 0 }}
      />

      {/* Ground layer */}
      <img
        ref={groundRef}
        src={urls.ground}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        style={{ opacity: 0 }}
      />

      {/* Body walls layer */}
      <img
        ref={bodyRef}
        src={urls.body}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        style={{ opacity: 0 }}
      />

      {/* Roof layer */}
      <img
        ref={roofRef}
        src={urls.roof}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        style={{ opacity: 0 }}
      />

      {/* Front gate and hedges layer */}
      <img
        ref={frontRef}
        src={urls.front}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        style={{ opacity: 0 }}
      />

      {/* Sparkles container positioned above roof */}
      <div
        ref={sparklesRef}
        className="absolute left-1/2 top-[25%] -translate-x-1/2 pointer-events-none"
        style={{ width: 0, height: 0 }}
      >
        {Array.from({ length: SPARKLE_COUNT }).map((_, idx) => (
          <div
            key={idx}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: idx % 2 === 0 ? '5px' : '4px',
              height: idx % 2 === 0 ? '5px' : '4px',
              background: 'radial-gradient(circle, #ffe082 0%, #e7b861 80%, #d49f3e 100%)',
              boxShadow: '0 0 6px #e7b861',
              opacity: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default HouseSprite;
