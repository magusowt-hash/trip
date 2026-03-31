import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import { WHEEL_TO_SCROLL_FACTOR } from '../utils/galleryUtils';

type Options = {
  imageCount: number;
};

function scrollRailByWheel(el: HTMLDivElement, deltaY: number, deltaX: number): boolean {
  if (el.scrollWidth <= el.clientWidth) return false;
  const delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
  el.scrollLeft += delta * WHEEL_TO_SCROLL_FACTOR;
  return true;
}

/**
 * 缩略图横向轨道：原生 wheel（passive:false）+ 全局拖拽；仅在该栏挂载时生效（浮窗关闭即卸载）。
 */
export function useThumbnailRail({ imageCount }: Options) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (scrollRailByWheel(el, event.deltaY, event.deltaX)) {
        event.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [imageCount]);

  useEffect(() => {
    const onMove = (event: globalThis.MouseEvent) => {
      const el = railRef.current;
      if (!el || !draggingRef.current) return;
      const dx = event.clientX - dragStartXRef.current;
      el.scrollLeft = dragStartScrollLeftRef.current - dx;
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = railRef.current;
      if (el) el.scrollLeft = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [imageCount]);

  const onMouseDownRail = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = railRef.current;
    if (!el) return;
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartScrollLeftRef.current = el.scrollLeft;
  }, []);

  return {
    railRef,
    onMouseDownRail,
  };
}

