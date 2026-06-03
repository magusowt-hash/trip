import type { FootprintPlacement } from './footprintLayoutTypes';

export function compactOuterBaselinePlacements(
  placementById: Map<string, FootprintPlacement>,
  options?: {
    maxRadiusRatio?: number;
    easing?: number;
  },
) {
  const entries = Array.from(placementById.entries());
  if (entries.length <= 2) return new Map(placementById);

  const radii = entries
    .map(([, placement]) => Math.hypot(placement.centerX, placement.centerY))
    .sort((left, right) => left - right);
  const medianRadius = radii[Math.floor(radii.length / 2)] ?? 0;
  const maxRadiusRatio = options?.maxRadiusRatio ?? 1.28;
  const easing = options?.easing ?? 0.6;
  const capRadius = Math.max(180, medianRadius * maxRadiusRatio);

  const next = new Map<string, FootprintPlacement>();
  for (const [placeKey, placement] of entries) {
    const radius = Math.hypot(placement.centerX, placement.centerY);
    if (radius <= capRadius + 1e-6 || radius <= 1e-6) {
      next.set(placeKey, placement);
      continue;
    }

    const compressedRadius = capRadius + (radius - capRadius) * Math.max(0, Math.min(1, 1 - easing));
    const scale = compressedRadius / radius;
    next.set(placeKey, {
      centerX: placement.centerX * scale,
      centerY: placement.centerY * scale,
    });
  }

  return next;
}
