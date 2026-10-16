import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import MarkParts from './MarkParts';
import { useLoader } from './LoaderContext';
import { ROUTE_MIN_MS, ROUTE_STEPS } from './motion';

const RouteLoader: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const markWrapRef = useRef<HTMLDivElement>(null);
  const { active, activeSince } = useLoader();

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
      let skylineTl: gsap.core.Timeline | null = null;
      let fadeOutTimer: ReturnType<typeof setTimeout> | null = null;
      let isVisible = false;

      // Master fade tween reference to cancel it if needed
      let fadeTween: gsap.core.Tween | null = null;

      // Build loop animation
      if (!prefersReducedMotion) {
        gsap.set(buildings, { clipPath: 'inset(100% 0% 0% 0%)' });
        
        // Base breathe
        gsap.to(base, { opacity: S.base.duration ? 0.92 : 1, duration: S.base.duration, ease: S.base.ease, yoyo: true, repeat: -1 });
        
        // Windows pulse
        gsap.to(windows, { opacity: 0.4, duration: S.windows.duration, ease: S.windows.ease, stagger: S.windows.stagger, yoyo: true, repeat: -1 });

        // Skyline loop
        skylineTl = gsap.timeline({ repeat: -1 });
        skylineTl.addLabel('start');
        skylineTl.to(buildings, { clipPath: 'inset(0% 0% 0% 0%)', duration: S.skylineGrow.duration, ease: S.skylineGrow.ease, stagger: S.skylineGrow.stagger });
        skylineTl.addLabel('grown');
        skylineTl.to({}, { duration: S.skylineHold }); // Hold
        skylineTl.to(buildings, { clipPath: 'inset(0% 0% 100% 0%)', duration: S.skylineRetract.duration, ease: S.skylineRetract.ease, stagger: S.skylineRetract.stagger });
        skylineTl.set(buildings, { clipPath: 'inset(100% 0% 0% 0%)' });
        skylineTl.to({}, { duration: S.skylinePause });
      }

      // Hide initially
      gsap.set(rootRef.current, { opacity: 0, display: 'none' });

      // Listen to active prop
      const handleState = () => {
        if (active) {
          if (fadeOutTimer) clearTimeout(fadeOutTimer);
          if (fadeTween) fadeTween.kill();
          gsap.set(rootRef.current, { display: 'flex' });
          if (!isVisible) {
            (window as any).__startMotionDebug?.();
            // First show
            gsap.set(markWrapRef.current, { opacity: 0, y: 10 });
            fadeTween = gsap.to(rootRef.current, { opacity: 1, duration: S.enter.opacityDuration, ease: S.enter.opacityEase });
            gsap.to(markWrapRef.current, { opacity: 1, y: 0, duration: S.enter.yDuration, ease: S.enter.ease });
            isVisible = true;
          } else {
            // Re-show (cancel fade-out)
            fadeTween = gsap.to(rootRef.current, { opacity: 1, duration: S.enter.opacityDuration, ease: S.enter.opacityEase });
          }
        } else {
          if (!isVisible) return;
          const elapsed = Date.now() - activeSince;
          const remaining = Math.max(0, ROUTE_MIN_MS - elapsed);
          
          fadeOutTimer = setTimeout(() => {
            const doFadeOut = () => {
              fadeTween = gsap.to(rootRef.current, { 
                opacity: 0, 
                duration: S.exit.duration, 
                ease: S.exit.ease, 
                onComplete: () => {
                  (window as any).__stopMotionDebug?.('RouteLoader');
                  gsap.set(rootRef.current, { display: 'none' });
                  isVisible = false;
                }
              });
            };

            if (skylineTl && skylineTl.time() > 0 && skylineTl.time() < skylineTl.labels['grown']) {
              skylineTl.tweenTo('grown', { onComplete: doFadeOut });
            } else {
              doFadeOut();
            }
          }, remaining);
        }
      };

      handleState();

      return () => {
        if (fadeOutTimer) clearTimeout(fadeOutTimer);
      };
    }, rootRef);

    return () => ctx.revert();
  }, [active, activeSince]);

  return (
    <div 
      ref={rootRef}
      role="status"
      aria-label="Loading section"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999, // Under modals, over page
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'rgba(248, 250, 252, 0.85)',
        willChange: 'opacity',
        transform: 'translateZ(0)',
        contain: 'paint'
      }}
    >
      <div 
        ref={markWrapRef}
        style={{ width: '92px' }}
      >
        {window.matchMedia('(prefers-reduced-motion: reduce)').matches ? (
          <img src="/brand/parts/mark-base.png" alt="" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
        ) : (
          <MarkParts />
        )}
      </div>
    </div>
  );
};

export default RouteLoader;
