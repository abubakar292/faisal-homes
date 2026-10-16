import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import MarkParts from './MarkParts';
import { SPLASH_SPEED, SPLASH_REPEAT_SPEED, SPLASH_INTERRUPT_SPEED, SPLASH_INTERRUPT_AFTER_S, SPLASH_SETTLE_S, SPLASH_MAX_S, SPLASH_STEPS } from './motion';
import { useLoader } from './LoaderContext';

interface SplashScreenProps {
  ready: boolean;
  appMounted: boolean;
  setAppMounted: (v: boolean) => void;
  onDone?: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ ready, appMounted, setAppMounted, onDone }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const markBoxRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLImageElement>(null);
  const homesRef = useRef<HTMLImageElement>(null);
  const tagRef = useRef<HTMLImageElement>(null);
  const hairlineRef = useRef<HTMLDivElement>(null);
  const projectTextRef = useRef<HTMLDivElement>(null);
  const skLogoRef = useRef<HTMLImageElement>(null);
  const glossInnerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(true);
  const { active } = useLoader();

  useLayoutEffect(() => {
    if (!mounted) return;

    document.documentElement.style.overflow = 'hidden';

    let ctx = gsap.context(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const seenKey = 'fh_splash_seen';
      const isRevisit = sessionStorage.getItem(seenKey) === 'true';
      sessionStorage.setItem(seenKey, 'true');

      let isExiting = false;
      let introFinished = false;

      const attemptExit = () => {
        if (isExiting) return;
        
        const shell = document.querySelector('#app-shell') as HTMLElement;
        const allReady = introFinished && ready && appMounted && !active;
        
        if (allReady) {
          isExiting = true;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              executeExit(shell);
            });
          });
        }
      };

      const executeExit = (shell: HTMLElement | null) => {
        const tlExit = gsap.timeline({
          onComplete: () => {
            (window as any).__stopMotionDebug?.('Splash Exit');
            const bootBg = document.getElementById('boot-bg');
            if (bootBg) bootBg.remove();
            document.documentElement.style.overflow = '';
            setMounted(false);
            if (onDone) onDone();
          }
        });

        if (prefersReducedMotion) {
          const S = SPLASH_STEPS.reduced;
          tlExit.to(contentRef.current, { opacity: 0, duration: S.duration, ease: S.easeOut });
          if (shell) {
            tlExit.to(shell, { opacity: 1, duration: S.duration, ease: S.easeIn }, 0);
            tlExit.set(shell, { clearProps: 'opacity' });
          }
        } else {
          // Exit timeline
          const S = SPLASH_STEPS;
          tlExit.to([projectTextRef.current, tagRef.current, hairlineRef.current, skLogoRef.current], 
            { opacity: 0, duration: S.exitProj.duration, ease: S.exitProj.ease }, S.exitProj.at);
          tlExit.to(contentRef.current, 
            { opacity: 0, scale: 1.03, duration: S.exitLogo.duration, ease: S.exitLogo.ease }, S.exitLogo.at);
          tlExit.to(rootRef.current, 
            { opacity: 0, duration: S.exitBg.duration, ease: S.exitBg.ease }, S.exitBg.at);
            
          if (shell) {
            tlExit.to(shell, { opacity: 1, duration: S.exitApp.duration, ease: S.exitApp.ease }, S.exitApp.at);
            tlExit.set(shell, { clearProps: 'opacity' });
          }
        }
      };

      // Check exit condition constantly
      const exitCheck = setInterval(() => {
        attemptExit();
      }, 50);

      const safetyTimer = setTimeout(() => {
        if (!isExiting) {
          isExiting = true;
          executeExit(document.querySelector('#app-shell'));
        }
      }, SPLASH_MAX_S * 1000);

      const startAnimation = () => {
        (window as any).__startMotionDebug?.();
        if (prefersReducedMotion) {
          const S = SPLASH_STEPS.reduced;
          gsap.set(contentRef.current, { opacity: 0 });
          gsap.to(contentRef.current, { 
            opacity: 1, 
            duration: S.duration, 
            ease: S.easeIn,
            onComplete: () => {
              introFinished = true;
              setAppMounted(true);
            }
          });
          return;
        }

        const tl = gsap.timeline({
          onComplete: () => {
            introFinished = true;
            setAppMounted(true); // Mount the app during the settle hold
          }
        });

        const S = SPLASH_STEPS;
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

        // Initial setup
        gsap.set(contentRef.current, { opacity: 1 });
        gsap.set(base, { opacity: 0, y: 14, scale: 0.97 });
        gsap.set(buildings, { clipPath: 'inset(100% 0% 0% 0%)' });
        gsap.set(windows, { opacity: 0, scale: 0.85, transformOrigin: 'center center' });
        gsap.set(wordRef.current, { opacity: 0, y: 10, clipPath: 'inset(0% 100% 0% 0%)' }); 
        gsap.set(homesRef.current, { opacity: 0, clipPath: 'inset(0% 50% 0% 50%)' });
        gsap.set(tagRef.current, { opacity: 0 });
        gsap.set(hairlineRef.current, { scaleX: 0 });
        gsap.set(projectTextRef.current, { opacity: 0 });
        gsap.set(skLogoRef.current, { opacity: 0, y: 12 });
        gsap.set(glossInnerRef.current, { xPercent: -60 });

        // 1. Base
        tl.to(base, { opacity: 1, duration: S.base.duration, ease: S.base.easeOpacity }, S.base.at);
        tl.to(base, { y: 0, scale: 1, duration: S.base.duration, ease: S.base.ease }, S.base.at);

        // 2. Skyline
        tl.to(buildings, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: S.skyline.duration,
          ease: S.skyline.ease,
          stagger: S.skyline.stagger
        }, S.skyline.at);

        // 3. FAISAL
        tl.to(wordRef.current, { opacity: 1, duration: S.word.opacityDuration, ease: S.word.ease }, S.word.at);
        tl.to(wordRef.current, { y: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: S.word.duration, ease: S.word.ease }, S.word.at);

        // 4. Windows
        tl.to(windows, {
          opacity: 1,
          scale: 1,
          duration: S.windows.duration,
          ease: S.windows.ease,
          stagger: S.windows.stagger
        }, S.windows.at);

        // 5. HOMES
        tl.to(homesRef.current, { opacity: 1, duration: S.homes.opacityDuration, ease: S.homes.ease }, S.homes.at);
        tl.to(homesRef.current, { clipPath: 'inset(0% 0% 0% 0%)', duration: S.homes.duration, ease: S.homes.ease }, S.homes.at);

        // 6. Tagline
        tl.to(tagRef.current, { opacity: 1, duration: S.tagline.duration, ease: S.tagline.ease }, S.tagline.at);

        // 7. Project Block
        tl.to(hairlineRef.current, { scaleX: 1, duration: S.projectLine.duration, ease: S.projectLine.ease }, S.projectLine.at);
        tl.to(projectTextRef.current, { opacity: 1, duration: S.projectText.duration, ease: S.projectText.ease }, S.projectText.at);
        tl.to(skLogoRef.current, { opacity: 1, y: 0, duration: S.projectLogo.duration, ease: S.projectLogo.ease }, S.projectLogo.at);

        // 8. Gloss Sweep
        tl.to(glossInnerRef.current, {
          xPercent: 60,
          duration: S.gloss.duration,
          ease: S.gloss.ease
        }, S.gloss.at);

        if (isRevisit) {
          tl.timeScale(SPLASH_REPEAT_SPEED);
        } else {
          tl.timeScale(SPLASH_SPEED);
        }

        const speedUp = () => { if (tl.time() > SPLASH_INTERRUPT_AFTER_S) tl.timeScale(SPLASH_INTERRUPT_SPEED); };
        window.addEventListener('click', speedUp);
        window.addEventListener('keydown', speedUp);
        window.addEventListener('touchstart', speedUp);
        
        // Output debug
        if (import.meta.env.DEV) {
          console.log('Splash duration:', tl.duration());
        }

        return () => {
          window.removeEventListener('click', speedUp);
          window.removeEventListener('keydown', speedUp);
          window.removeEventListener('touchstart', speedUp);
        };
      };

      const images = [
        '/brand/faisal-logo.png',
        '/brand/faisal-layer-word.png',
        '/brand/faisal-layer-homes.png',
        '/brand/faisal-layer-tagline.png',
        '/brand/sk-logo-light.png',
        '/brand/parts/mark-base.png',
        '/brand/parts/mark-tower.png',
        '/brand/parts/mark-bar1.png',
        '/brand/parts/mark-bar2.png',
        '/brand/parts/mark-bar3.png',
        '/brand/parts/mark-building.png',
        '/brand/parts/mark-win1.png',
        '/brand/parts/mark-win2.png',
        '/brand/parts/mark-win3.png',
        '/brand/parts/mark-win4.png'
      ];

      const loadPromises = images.map(src => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      });

      Promise.race([
        Promise.all(loadPromises),
        new Promise(r => setTimeout(r, 2000))
      ]).then(startAnimation);

      return () => {
        clearInterval(exitCheck);
        clearTimeout(safetyTimer);
      };

    }, rootRef);

    return () => ctx.revert();
  }, [ready, onDone, mounted, appMounted, setAppMounted, active]);

  if (!mounted) return null;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label="Loading Faisal Homes"
      style={{
        position: 'fixed',
        inset: 0,
        height: '100dvh',
        zIndex: 99999,
        background: 'radial-gradient(120% 90% at 50% 38%, #12315c 0%, #0b1f3a 55%, #08182f 100%)',
        overflow: 'hidden'
      }}
    >
      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(16px, 3.4vh, 30px)', height: '100%', opacity: 0 }}>
        
        {/* Logo box */}
        <div style={{ 
          position: 'relative', 
          width: 'min(clamp(170px, 17vw, 240px), 38vh)',
          aspectRatio: '1000 / 875'
        }}>
          {prefersReducedMotion ? (
            <img src="/brand/faisal-logo.png" alt="Faisal Homes" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <>
              {/* Mark parts box */}
              <div ref={markBoxRef} style={{ position: 'absolute', left: '23.5%', top: '2.4%', width: '55.1%', height: '49.714%' }}>
                <MarkParts />
              </div>
              <img ref={wordRef} src="/brand/faisal-layer-word.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              <img ref={homesRef} src="/brand/faisal-layer-homes.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              <img ref={tagRef} src="/brand/faisal-layer-tagline.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              
              {/* Static mask sweep container */}
              <div 
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  WebkitMaskImage: 'url(/brand/faisal-logo.png)',
                  WebkitMaskSize: '100% 100%',
                  WebkitMaskRepeat: 'no-repeat',
                  maskImage: 'url(/brand/faisal-logo.png)',
                  maskSize: '100% 100%',
                  maskRepeat: 'no-repeat',
                  overflow: 'hidden',
                  pointerEvents: 'none'
                }}
              >
                <div 
                  ref={glossInnerRef}
                  style={{
                    position: 'absolute', inset: '0 -60%',
                    background: 'linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.38) 50%, transparent 58%)'
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Project Block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div ref={hairlineRef} style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, transparent, #e7b861, transparent)', transformOrigin: 'center' }} />
          <div ref={projectTextRef} style={{ marginTop: '12px', fontSize: '10px', letterSpacing: '0.32em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
            A Project of
          </div>
          <div style={{ marginTop: '8px' }}>
            <img ref={skLogoRef} src="/brand/sk-logo-light.png" alt="SK Real Estate & Builders" style={{ width: 'clamp(54px, 5.2vw, 76px)', objectFit: 'contain' }} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default SplashScreen;
