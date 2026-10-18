import { useMediaQuery } from './useMediaQuery';

export interface Breakpoints {
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
}

export function useBreakpoint(): Breakpoints {
  const isSm = useMediaQuery('(min-width: 640px)');
  const isMd = useMediaQuery('(min-width: 768px)');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const isXl = useMediaQuery('(min-width: 1280px)');

  // Contract: Phone < md (768px), Tablet md..lg-1 (768px..1023px), Desktop lg+ (1024px+)
  const isPhone = !isMd;
  const isTablet = isMd && !isLg;
  const isDesktop = isLg;

  return {
    isPhone,
    isTablet,
    isDesktop,
    isSm,
    isMd,
    isLg,
    isXl,
  };
}

export default useBreakpoint;
