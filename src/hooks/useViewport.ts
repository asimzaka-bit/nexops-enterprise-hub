import { useEffect, useState } from 'react';

export type ViewportCategory = 'mobile' | 'tablet' | 'desktop';
export type ViewportOrientation = 'portrait' | 'landscape';

export interface ViewportInfo {
  width: number;
  height: number;
  deviceType: ViewportCategory;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  orientation: ViewportOrientation;
  isTouchDevice: boolean;
}

export function classifyViewport(width: number): ViewportCategory {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  } catch {
    // Ignore matchMedia errors
  }
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

function readViewportSnapshot(): ViewportInfo {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 800,
      deviceType: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      orientation: 'landscape',
      isTouchDevice: false,
    };
  }

  const width = window.innerWidth || document.documentElement.clientWidth || 1280;
  const height = window.innerHeight || document.documentElement.clientHeight || 800;
  const deviceType = classifyViewport(width);
  const orientation: ViewportOrientation = height >= width ? 'portrait' : 'landscape';

  return {
    width,
    height,
    deviceType,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    orientation,
    isTouchDevice: detectTouchCapability(),
  };
}

export function useViewport(): ViewportInfo {
  const [viewport, setViewport] = useState<ViewportInfo>(() => readViewportSnapshot());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;

    const syncDomAttributes = (next: ViewportInfo) => {
      const root = document.documentElement;
      root.dataset.viewport = next.deviceType;
      root.dataset.orientation = next.orientation;
      root.dataset.touch = next.isTouchDevice ? 'true' : 'false';
    };

    const update = () => {
      const next = readViewportSnapshot();
      syncDomAttributes(next);
      setViewport((prev) => {
        if (
          prev.width === next.width &&
          prev.height === next.height &&
          prev.deviceType === next.deviceType &&
          prev.orientation === next.orientation &&
          prev.isTouchDevice === next.isTouchDevice
        ) {
          return prev;
        }
        return next;
      });
    };

    const scheduleUpdate = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    syncDomAttributes(readViewportSnapshot());

    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('orientationchange', update);

    const coarseQuery = window.matchMedia?.('(pointer: coarse)');
    const orientationQuery = window.matchMedia?.('(orientation: portrait)');
    coarseQuery?.addEventListener?.('change', update);
    orientationQuery?.addEventListener?.('change', update);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', update);
      coarseQuery?.removeEventListener?.('change', update);
      orientationQuery?.removeEventListener?.('change', update);
    };
  }, []);

  return viewport;
}
