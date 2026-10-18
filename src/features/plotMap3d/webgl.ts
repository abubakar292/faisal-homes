export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 2;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const isReducedMotion = prefersReducedMotion;

export function canUseWebGL(itemCount: number = 0): boolean {
  if (!isWebGLAvailable()) return false;
  if (isLowEndDevice() && itemCount > 400) return false;
  return true;
}

export function shouldUseIsoFallback(itemCount: number = 0): boolean {
  return !canUseWebGL(itemCount) || prefersReducedMotion();
}
