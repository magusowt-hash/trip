'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  type OuterFrameTransform,
  CLAMP_SCALE,
  zoomAt,
} from '@/lib/outerFrameCoords';

interface UseOuterFrameOptions {
  initialScale?: number;
  minScale?: number;
}

export function useOuterFrame(options: UseOuterFrameOptions = {}) {
  const { initialScale = 1, minScale = 0 } = options;
  const [transform, setTransform] = useState<OuterFrameTransform>({
    scale: initialScale,
    tx: 0,
    ty: 0,
  });

  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Use state-backed ref so effects re-run when container mounts
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    setContainerEl(el);
  }, []);

  const minScaleRef = useRef(minScale);
  minScaleRef.current = minScale;

  const clampToRange = useCallback(
    (s: number) => Math.max(minScaleRef.current, Math.min(CLAMP_SCALE.max, s)),
    [],
  );

  // Wheel zoom centered on cursor
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const t = transformRef.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rawScale = t.scale * factor;
    const newScale = clampToRange(rawScale);

    const { tx, ty } = zoomAt(
      e.clientX, e.clientY,
      window.innerWidth, window.innerHeight,
      newScale, t,
    );
    setTransform({ scale: newScale, tx, ty });
  }, [clampToRange]);

  // Touch pinch zoom (mobile)
  const lastPinchRef = useRef({ dist: 0, centerX: 0, centerY: 0 });

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    if (lastPinchRef.current.dist > 0) {
      const t = transformRef.current;
      const ratio = dist / lastPinchRef.current.dist;
      const rawScale = t.scale * ratio;
      const newScale = clampToRange(rawScale);

      const { tx, ty } = zoomAt(
        cx, cy,
        window.innerWidth, window.innerHeight,
        newScale, t,
      );
      setTransform({ scale: newScale, tx, ty });
    }

    lastPinchRef.current = { dist, centerX: cx, centerY: cy };
  }, [clampToRange]);

  const handleTouchEnd = useCallback(() => {
    lastPinchRef.current = { dist: 0, centerX: 0, centerY: 0 };
  }, []);

  // Pan with pointer
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.amap-container') || target.closest('[data-no-pan]')) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (e.pointerType === 'touch' && (e as any).isPrimary === false) return;

    const t = transformRef.current;
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: t.tx, ty: t.ty };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const panStart = panStartRef.current;
    if (!panStart) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    setTransform(prev => ({
      ...prev,
      tx: panStart.tx + dx,
      ty: panStart.ty + dy,
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  // Attach native wheel/touch listeners when container mounts
  useEffect(() => {
    if (!containerEl) return;

    containerEl.addEventListener('wheel', handleWheel, { passive: false });
    containerEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    containerEl.addEventListener('touchend', handleTouchEnd);

    return () => {
      containerEl.removeEventListener('wheel', handleWheel);
      containerEl.removeEventListener('touchmove', handleTouchMove);
      containerEl.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerEl, handleWheel, handleTouchMove, handleTouchEnd]);

  return {
    transform,
    setTransform,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    panStartRef,
  };
}
