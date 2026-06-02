import type { LogicalRect } from './footprintLayoutTypes';

export const FOOTPRINT_MAP_AREA_RATIO_W = 0.6;
export const FOOTPRINT_MAP_AREA_RATIO_H = 0.8;
export const FOOTPRINT_MAP_SAFE_GAP = 128;

export function getFootprintMapLogicalBounds(width: number, height: number) {
  return {
    halfW: (width * FOOTPRINT_MAP_AREA_RATIO_W) / 2,
    halfH: (height * FOOTPRINT_MAP_AREA_RATIO_H) / 2,
  };
}

export function getFootprintMapRect(width: number, height: number): LogicalRect {
  const { halfW, halfH } = getFootprintMapLogicalBounds(width, height);
  return {
    left: -halfW,
    right: halfW,
    top: -halfH,
    bottom: halfH,
  };
}

export function getFootprintMapProtectionRect(width: number, height: number): LogicalRect {
  const rect = getFootprintMapRect(width, height);
  return {
    left: rect.left - FOOTPRINT_MAP_SAFE_GAP,
    right: rect.right + FOOTPRINT_MAP_SAFE_GAP,
    top: rect.top - FOOTPRINT_MAP_SAFE_GAP,
    bottom: rect.bottom + FOOTPRINT_MAP_SAFE_GAP,
  };
}
