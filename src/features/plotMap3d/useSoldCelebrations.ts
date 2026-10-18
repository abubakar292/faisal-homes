import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import type { Plot } from '../../types';
import { subscribeCollection } from '../../firebase/firestore';

export type SubscribePlotsFn = (
  collectionName: string,
  callback: (plots: Plot[]) => void
) => () => void;

interface UseSoldCelebrationsOptions {
  plotElementsRef?: React.MutableRefObject<Map<string, HTMLElement>>;
  subscribeFn?: SubscribePlotsFn;
  enabled?: boolean;
}

export interface StatusTransitionResult {
  newlySold: string[];
  removedSold: string[];
  nextMap: Map<string, string>;
}

export function detectSoldPlotTransitions(
  plots: Plot[],
  prevStatuses: Map<string, string>,
  isBaseline: boolean
): StatusTransitionResult {
  const nextMap = new Map<string, string>();
  if (isBaseline) {
    for (const plot of plots) {
      nextMap.set(plot.id, plot.status);
    }
    return { newlySold: [], removedSold: [], nextMap };
  }

  const newlySold: string[] = [];
  const removedSold: string[] = [];

  for (const plot of plots) {
    const prevStatus = prevStatuses.get(plot.id);
    const currentStatus = plot.status;

    if (prevStatus && prevStatus !== 'sold' && currentStatus === 'sold') {
      newlySold.push(plot.id);
    } else if (prevStatus === 'sold' && currentStatus !== 'sold') {
      removedSold.push(plot.id);
    }

    nextMap.set(plot.id, currentStatus);
  }

  return { newlySold, removedSold, nextMap };
}

export function useSoldCelebrations({
  plotElementsRef,
  subscribeFn = subscribeCollection,
  enabled = true,
}: UseSoldCelebrationsOptions = {}) {
  const [celebratingPlotIds, setCelebratingPlotIds] = useState<string[]>([]);
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const isBaselineRef = useRef<boolean>(true);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const handleCelebrationEnd = useCallback((plotId: string) => {
    setCelebratingPlotIds((prev) => prev.filter((id) => id !== plotId));
  }, []);

  // 1. Subscribe to live plot changes
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribeFn('plots', (plots: Plot[]) => {
      const { newlySold, removedSold, nextMap } = detectSoldPlotTransitions(
        plots,
        prevStatusesRef.current,
        isBaselineRef.current
      );

      prevStatusesRef.current = nextMap;

      if (isBaselineRef.current) {
        isBaselineRef.current = false;
        return;
      }

      for (const plotId of newlySold) {
        const el = plotElementsRef?.current?.get(plotId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }

      setCelebratingPlotIds((prev) => {
        let updated = prev.filter((id) => !removedSold.includes(id));
        if (newlySold.length > 0) {
          const combined = new Set([...updated, ...newlySold]);
          updated = Array.from(combined);
        }
        return updated;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [enabled, subscribeFn, plotElementsRef]);

  // 2. Handle deep link: /plots/map?focus=<plotId>&celebrate=1
  useEffect(() => {
    if (!enabled) return;

    const focusId = searchParams.get('focus');
    const shouldCelebrate = searchParams.get('celebrate') === '1';

    if (!focusId) return;

    // Small delay to ensure DOM buttons are rendered
    const timer = setTimeout(() => {
      const el = plotElementsRef?.current?.get(focusId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }

      if (shouldCelebrate) {
        setCelebratingPlotIds((prev) => {
          if (prev.includes(focusId)) return prev;
          return [...prev, focusId];
        });
      }

      // Clean query params from URL without reloading
      navigate(location.pathname, { replace: true });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchParams, navigate, location.pathname, enabled, plotElementsRef]);

  return {
    celebratingPlotIds,
    handleCelebrationEnd,
    isBaseline: isBaselineRef.current,
  };
}
