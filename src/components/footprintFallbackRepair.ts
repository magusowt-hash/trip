import type { FootprintPlacement } from './footprintLayoutTypes';

const FALLBACK_REPAIR_STEPS = [80, 140, 220, 320, 440, 580, 760];

export function buildFallbackRepairSteps() {
  return [...FALLBACK_REPAIR_STEPS];
}

export function expandPlacementAlongRay(
  placement: FootprintPlacement,
  deltaRadius: number,
): FootprintPlacement {
  const angle = Math.atan2(placement.centerY, placement.centerX);
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const nextRadius = Math.max(0, radius + deltaRadius);
  return {
    centerX: Math.cos(angle) * nextRadius,
    centerY: Math.sin(angle) * nextRadius,
  };
}
