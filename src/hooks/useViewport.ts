import { RefObject, useEffect, useState } from 'react';

export type ViewportCategory = 'mobile' | 'tablet' | 'desktop';
export type ViewportBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ViewportOrientation = 'portrait' | 'landscape';

export interface ViewportInfo {
  width: number;
  height: number;
  deviceType: ViewportCategory;
  breakpoint: ViewportBreakpoint;
  isXs: boolean;
  isCompact: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  orientation: ViewportOrientation;
  isTouchDevice: boolean;
}

export function classifyViewport(width: number): ViewportCategory {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function classifyBreakpoint(width: number): ViewportBreakpoint {
  if (width < 480) return 'xs';
  if (width < 640) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1440) return 'lg';
  return 'xl';
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
      breakpoint: 'lg',
      isXs: false,
      isCompact: false,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isWide: false,
      orientation: 'landscape',
      isTouchDevice: false,
    };
  }

  const docWidth = document.documentElement?.clientWidth || 0;
  const winWidth = window.innerWidth || 0;
  const width =
    docWidth > 0 && winWidth > 0
      ? Math.min(docWidth, winWidth)
      : winWidth || docWidth || 1280;
  const docHeight = document.documentElement?.clientHeight || 0;
  const winHeight = window.innerHeight || 0;
  const height = winHeight || docHeight || 800;

  const deviceType = classifyViewport(width);
  const breakpoint = classifyBreakpoint(width);
  const orientation: ViewportOrientation = height >= width ? 'portrait' : 'landscape';

  return {
    width,
    height,
    deviceType,
    breakpoint,
    isXs: breakpoint === 'xs',
    isCompact: width < 640,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    isWide: breakpoint === 'xl',
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
      root.dataset.breakpoint = next.breakpoint;
      root.dataset.orientation = next.orientation;
      root.dataset.touch = next.isTouchDevice ? 'true' : 'false';
      root.style.setProperty('--nexops-vw', `${next.width}px`);
      root.style.setProperty('--nexops-vh', `${next.height}px`);
    };

    const update = () => {
      const next = readViewportSnapshot();
      syncDomAttributes(next);
      setViewport((prev) => {
        if (
          prev.width === next.width &&
          prev.height === next.height &&
          prev.deviceType === next.deviceType &&
          prev.breakpoint === next.breakpoint &&
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

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function' && document.documentElement) {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(document.documentElement);
    }

    const mediaQueries = [
      '(pointer: coarse)',
      '(orientation: portrait)',
      '(min-width: 480px)',
      '(min-width: 640px)',
      '(min-width: 1024px)',
      '(min-width: 1440px)',
    ]
      .map((q) => {
        try {
          return window.matchMedia?.(q) ?? null;
        } catch {
          return null;
        }
      })
      .filter((m): m is MediaQueryList => m !== null);

    for (const mq of mediaQueries) {
      mq.addEventListener?.('change', update);
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', update);
      resizeObserver?.disconnect();
      for (const mq of mediaQueries) {
        mq.removeEventListener?.('change', update);
      }
    };
  }, []);

  return viewport;
}

export interface ContainerSize {
  width: number;
  height: number;
  breakpoint: ViewportBreakpoint;
}

export function useContainerSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): ContainerSize {
  const [size, setSize] = useState<ContainerSize>(() => ({
    width: 0,
    height: 0,
    breakpoint: 'lg',
  }));

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;

    let rafId: number | null = null;
    const syncSize = (width: number, height: number) => {
      const w = Math.round(width);
      const h = Math.round(height);
      const bp = classifyBreakpoint(w || (typeof window !== 'undefined' ? window.innerWidth : 1280));
      setSize((prev) =>
        prev.width === w && prev.height === h && prev.breakpoint === bp
          ? prev
          : { width: w, height: h, breakpoint: bp },
      );
    };

    const rect = el.getBoundingClientRect();
    syncSize(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncSize(width, height);
      });
    });
    observer.observe(el);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [ref]);

  return size;
}
