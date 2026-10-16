import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import MarkParts from './MarkParts';
import { ROUTE_STEPS } from './motion';

interface BrandLoaderProps {
  size?: number;
}

const BrandLoader: React.FC<BrandLoaderProps> = ({ size = 72 }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const markWrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let ctx = gsap.context(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const base = rootRef.current?.querySelector('[data-part="base"]') || null;
      const tower = rootRef.current?.querySelector('[data-part="tower"]') || null;
      const bar1 = rootRef.current?.querySelector('[data-part="bar1"]') || null;
      const bar2 = rootRef.current?.querySelector('[data-part="bar2"]') || null;
      const bar3 = rootRef.current?.querySelector('[data-part="bar3"]') || null;
      const building = rootRef.current?.querySelector('[data-part="building"]') || null;
      const win1 = rootRef.current?.querySelector('[data-part="win1"]') || null;
      const win2 = rootRef.current?.querySelector('[data-part="win2"]') || null;
      const win3 = rootRef.current?.querySelector('[data-part="win3"]') || null;
      const win4 = rootRef.current?.querySelector('[data-part="win4"]') || null;
      const buildings = [tower, bar1, bar2, bar3, building];
      const windows = [win1, win2, win3, win4];

      const S = ROUTE_STEPS;

      if (!prefersReducedMotion) {
        gsap.set(buildings, { clipPath: 'inset(100% 0% 0% 0%)' });

        gsap.to(base, { opacity: 1, duration: S.base.duration, ease: S.base.ease, yoyo: true, repeat: -1 });

        const skylineTl = gsap.timeline({ repeat: -1 });
        skylineTl.to(buildings, { clipPath: 'inset(0% 0% 0% 0%)', duration: S.skylineGrow.duration, ease: S.skylineGrow.ease, stagger: S.skylineGrow.stagger });
        skylineTl.to({}, { duration: S.skylineHold });
        skylineTl.to(buildings, { clipPath: 'inset(0% 0% 100% 0%)', duration: S.skylineRetract.duration, ease: S.skylineRetract.ease, stagger: S.skylineRetract.stagger });
        skylineTl.set(buildings, { clipPath: 'inset(100% 0% 0% 0%)' });
        skylineTl.to({}, { duration: S.skylinePause });

        gsap.to(windows, { opacity: 0.4, duration: S.windows.duration, ease: S.windows.ease, yoyo: true, repeat: -1, stagger: S.windows.stagger });
      } else {
        const S = ROUTE_STEPS.reduced;
        gsap.to(markWrapRef.current, { opacity: 0.7, duration: S.duration, ease: S.ease, yoyo: true, repeat: -1 });
      }
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div 
      ref={rootRef}
      role="status"
      aria-label="Loading"
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '160px',
        width: '100%'
      }}
    >
      <div 
        ref={markWrapRef}
        style={{ width: size, willChange: 'opacity' }}
      >
        {window.matchMedia('(prefers-reduced-motion: reduce)').matches ? (
          <img src="/brand/parts/mark-base.png" alt="Loading" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
        ) : (
          <MarkParts />
        )}
      </div>
    </div>
  );
};

export default BrandLoader;
