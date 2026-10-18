import { useState, useEffect, useRef, useCallback } from 'react';
import type { Plot } from '../../types';
import { getSizeVariant, getPlotPalette, type HouseVariantIndex, type RoofPaletteIndex } from './houseModels';

export interface PlotRectItem {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  variant: HouseVariantIndex;
  palette: RoofPaletteIndex;
}

interface UsePlotRectsOptions {
  plots: Plot[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  plotElementsRef: React.MutableRefObject<Map<string, HTMLElement>>;
  filterBlock?: string;
  filterStatus?: string;
  enabled?: boolean;
}

export function usePlotRects({
  plots,
  containerRef,
  plotElementsRef,
  filterBlock,
  filterStatus,
  enabled = true,
}: UsePlotRectsOptions): PlotRectItem[] {
  const [items, setItems] = useState<PlotRectItem[]>([]);
  const prevItemsRef = useRef<PlotRectItem[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const computeRects = useCallback(() => {
    if (!enabled || !containerRef.current) {
      if (prevItemsRef.current.length > 0) {
        prevItemsRef.current = [];
        setItems([]);
      }
      return;
    }

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    // Filter sold plots that match current active filters
    const soldPlots = plots.filter((p) => {
      if (p.status !== 'sold') return false;
      if (filterBlock && p.block !== filterBlock) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });

    const nextItems: PlotRectItem[] = [];

    for (const plot of soldPlots) {
      const el = plotElementsRef.current.get(plot.id);
      if (!el) continue;

      const elRect = el.getBoundingClientRect();

      // Viewport culling (skip if outside browser window or completely outside container)
      if (
        elRect.bottom < 0 ||
        elRect.top > winHeight ||
        elRect.right < 0 ||
        elRect.left > winWidth
      ) {
        continue;
      }

      const width = elRect.width;
      const height = elRect.height;

      // LOD: when smaller than 14px on screen, skip 3D house
      if (width < 14 || height < 14) {
        continue;
      }

      // Compute coordinates relative to container
      const left = elRect.left - containerRect.left;
      const top = elRect.top - containerRect.top;

      nextItems.push({
        id: plot.id,
        left,
        top,
        width,
        height,
        variant: getSizeVariant(plot.size, plot.sizeUnit),
        palette: getPlotPalette(plot.id),
      });
    }

    // Check if items changed (within 0.5px tolerance) to keep stable array identity
    const prev = prevItemsRef.current;
    let hasChanged = prev.length !== nextItems.length;

    if (!hasChanged) {
      for (let i = 0; i < prev.length; i++) {
        const p = prev[i];
        const n = nextItems[i];
        if (
          p.id !== n.id ||
          Math.abs(p.left - n.left) > 0.5 ||
          Math.abs(p.top - n.top) > 0.5 ||
          Math.abs(p.width - n.width) > 0.5 ||
          Math.abs(p.height - n.height) > 0.5 ||
          p.variant !== n.variant ||
          p.palette !== n.palette
        ) {
          hasChanged = true;
          break;
        }
      }
    }

    if (hasChanged) {
      prevItemsRef.current = nextItems;
      setItems(nextItems);
    }
  }, [enabled, plots, filterBlock, filterStatus, containerRef, plotElementsRef]);

  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      computeRects();
      rafIdRef.current = null;
    });
  }, [computeRects]);

  useEffect(() => {
    scheduleUpdate();

    const container = containerRef.current;
    const handleScroll = () => scheduleUpdate();
    const handleResize = () => scheduleUpdate();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    let resizeObserver: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      resizeObserver.observe(container);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [scheduleUpdate, containerRef]);

  return items;
}
