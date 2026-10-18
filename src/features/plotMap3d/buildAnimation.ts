import gsap from 'gsap';

export interface HouseAnimState {
  scaleXY: number;
  scaleZ: number;
  zOffset: number;
  dustScale: number;
  dustOpacity: number;
  sparkles: Array<{ x: number; y: number; z: number; opacity: number }>;
}

export function createInitialAnimState(): HouseAnimState {
  return {
    scaleXY: 1,
    scaleZ: 1,
    zOffset: 0,
    dustScale: 0,
    dustOpacity: 0,
    sparkles: [],
  };
}

export function startCelebrationAnimation(
  plotId: string,
  element: HTMLElement | null,
  reducedMotion: boolean,
  onUpdate: (state: HouseAnimState) => void,
  onComplete: () => void,
  invalidate: () => void
): () => void {
  if (reducedMotion) {
    onUpdate({
      scaleXY: 1,
      scaleZ: 1,
      zOffset: 0,
      dustScale: 0,
      dustOpacity: 0,
      sparkles: [],
    });
    onComplete();
    invalidate();
    return () => {};
  }

  // 12 gold sparkle particle offsets
  const sparkleOffsets = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.2;
    const rad = 0.2 + Math.random() * 0.35;
    return {
      vx: Math.cos(angle) * rad,
      vy: Math.sin(angle) * rad,
      vz: 0.4 + Math.random() * 0.6,
    };
  });

  const state: HouseAnimState = {
    scaleXY: 0.6,
    scaleZ: 0,
    zOffset: 0,
    dustScale: 0.2,
    dustOpacity: 0.8,
    sparkles: [],
  };

  const tl = gsap.timeline({
    onUpdate: () => {
      onUpdate({ ...state });
      invalidate();
    },
    onComplete: () => {
      state.scaleXY = 1;
      state.scaleZ = 1;
      state.zOffset = 0;
      state.dustOpacity = 0;
      state.sparkles = [];
      onUpdate({ ...state });
      onComplete();
      invalidate();
    },
  });

  // 1. Dust ring (0.00 - 0.50 s): expands and fades
  tl.to(
    state,
    {
      dustScale: 1.8,
      dustOpacity: 0,
      duration: 0.5,
      ease: 'power1.out',
    },
    0
  );

  // 2. Walls rise (0.05 - 0.95 s): scaleZ 0 -> 1, footprint grows 0.6 -> 1
  tl.to(
    state,
    {
      scaleXY: 1.0,
      scaleZ: 1.0,
      duration: 0.9,
      ease: 'power2.out',
    },
    0.05
  );

  // 3. Roof drops in and settles (0.70 - 1.30 s): drop from +0.8 height with settle
  state.zOffset = 0.8;
  tl.to(
    state,
    {
      zOffset: 0,
      duration: 0.6,
      ease: 'back.out(1.4)',
    },
    0.7
  );

  // 4. 12 gold sparkles drift up and fade (1.20 - 2.20 s)
  const sparkleProxy = { progress: 0 };
  tl.to(
    sparkleProxy,
    {
      progress: 1,
      duration: 1.0,
      ease: 'power2.out',
      onUpdate: () => {
        const p = sparkleProxy.progress;
        const opacity = Math.sin(p * Math.PI); // fade in then out
        state.sparkles = sparkleOffsets.map((s) => ({
          x: s.vx * (1 + p * 0.8),
          y: s.vy * (1 + p * 0.8),
          z: 0.4 + s.vz * p,
          opacity: opacity * 0.9,
        }));
      },
    },
    1.2
  );

  // DOM pulse on plot box
  if (element) {
    gsap.fromTo(
      element,
      { boxShadow: '0 0 0 0px rgba(231, 184, 97, 0.9)' },
      {
        boxShadow: '0 0 0 16px rgba(231, 184, 97, 0)',
        duration: 0.9,
        ease: 'power2.out',
      }
    );
  }

  return () => {
    tl.kill();
  };
}
