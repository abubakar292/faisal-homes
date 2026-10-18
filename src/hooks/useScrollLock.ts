import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow = '';
let originalPaddingRight = '';

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount <= 0) return;
  lockCount--;
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
  }
}

export function useScrollLock(locked: boolean = true): void {
  useEffect(() => {
    if (!locked) return;

    lockScroll();

    return () => {
      unlockScroll();
    };
  }, [locked]);
}

export default useScrollLock;
