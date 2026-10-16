export const SPLASH_SPEED = 1;
export const SPLASH_REPEAT_SPEED = 1.3; // same-session reloads (was 2.4: far too fast)
export const SPLASH_INTERRUPT_SPEED = 2;
export const SPLASH_INTERRUPT_AFTER_S = 1.5;
export const SPLASH_SETTLE_S = 0.6; // calm hold after the intro, before the exit starts
export const SPLASH_MAX_S = 9;
export const ROUTE_MIN_MS = 1200;
export const ROUTE_FADE_IN_S = 0.35;
export const ROUTE_FADE_OUT_S = 0.55;

export const SPLASH_STEPS = {
  base: { at: 0.25, duration: 1.4, ease: 'power2.out', easeOpacity: 'sine.inOut' },
  skyline: { at: 0.80, duration: 1.2, stagger: 0.20, ease: 'power2.out' },
  word: { at: 1.30, duration: 1.4, opacityDuration: 0.9, ease: 'power2.inOut' },
  windows: { at: 2.00, duration: 0.6, stagger: 0.15, ease: 'sine.out' },
  homes: { at: 2.10, duration: 1.2, opacityDuration: 0.8, ease: 'power2.inOut' },
  tagline: { at: 2.80, duration: 1.0, ease: 'sine.inOut' },
  projectLine: { at: 4.80, duration: 0.8, ease: 'sine.inOut' },
  projectText: { at: 5.00, duration: 0.8, ease: 'sine.inOut' },
  projectLogo: { at: 5.20, duration: 1.0, ease: 'power2.out' },
  gloss: { at: 3.60, duration: 1.4, ease: 'sine.inOut' },
  exitProj: { at: 0.00, duration: 0.6, ease: 'sine.inOut' },
  exitLogo: { at: 0.20, duration: 1.0, ease: 'sine.inOut' },
  exitBg: { at: 0.40, duration: 1.0, ease: 'sine.inOut' },
  exitApp: { at: 0.45, duration: 1.0, ease: 'sine.out' },
  reduced: { duration: 0.4, easeIn: 'power2.out', easeOut: 'power2.inOut' }
};

export const ROUTE_STEPS = {
  skylineGrow: { duration: 0.9, stagger: 0.14, ease: 'power2.out' },
  skylineRetract: { duration: 0.7, stagger: 0.08, ease: 'power2.inOut' },
  skylineHold: 0.9,
  skylinePause: 0.3,
  windows: { duration: 1.4, stagger: 0.18, ease: 'sine.inOut' },
  base: { duration: 2.6, ease: 'sine.inOut' },
  highlight: { duration: 2.0, ease: 'sine.inOut' },
  enter: { opacityDuration: 0.35, yDuration: 0.6, ease: 'power2.out', opacityEase: 'sine.out' },
  exit: { duration: 0.55, ease: 'sine.inOut' },
  reduced: { duration: 1.2, ease: 'sine.inOut' }
};
