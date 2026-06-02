import type { LogicalRect } from './localMapGroupGeometry';

export type LayoutSource = {
  id: string;
  x: number;
  y: number;
  rect: LogicalRect;
};

export type LayoutPlacement = {
  id: string;
  centerX: number;
  centerY: number;
};

type LayoutEntry = LayoutSource & {
  pointRadius: number;
  angle: number;
  rectArea: number;
  baseLineLength: number;
  lineLength: number;
  endX: number;
  endY: number;
};

type EndRect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type NeighborPair = {
  leftIndex: number;
  rightIndex: number;
  gap: number;
};

const DISPLAY_RADIUS_RATIO = 1.08;
const BASE_LAYOUT_LAYER_STEP = 18;
const RECT_EXTENSION_STEP = 18;
const RECT_EXTENSION_LIMIT = 40;
const RECT_CLEARANCE_PADDING = 6;
const RECT_TIGHTEN_ITERATIONS = 14;
const NEIGHBOR_MIN_GAP = 22;
const NEIGHBOR_RELAX_PASSES = 18;
const NEIGHBOR_ANGLE_DEGREES = [12, 8, 4, 2];
const NEIGHBOR_LENGTH_FACTORS = [0.88, 0.94, 0.98, 1];
const ANGLE_OPTIMIZE_DEGREES = [12, 8, 4, 2];
const ANGLE_OPTIMIZE_PASSES = 12;
const LINKED_LENGTH_FACTORS = [1, 0.94, 0.88, 0.82];
const GROUP_ANGLE_DEGREES = [8, 4, 2];
const GROUP_ANGLE_PASSES = 6;
const BALANCE_SECTOR_COUNT = 12;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function projectAngle(angle: number, radius: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function buildRectForEntry(entry: LayoutEntry): EndRect {
  return {
    id: entry.id,
    left: entry.endX + entry.rect.left,
    right: entry.endX + entry.rect.right,
    top: entry.endY + entry.rect.top,
    bottom: entry.endY + entry.rect.bottom,
  };
}

function rectsOverlap(a: EndRect, b: EndRect) {
  return !(
    a.right <= b.left ||
    b.right <= a.left ||
    a.bottom <= b.top ||
    b.bottom <= a.top
  );
}

function rectOverlapsMap(rect: EndRect, mapRect: LogicalRect, gap: number) {
  return !(
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
}

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  const ab1 = cross(a1, a2, b1);
  const ab2 = cross(a1, a2, b2);
  const ba1 = cross(b1, b2, a1);
  const ba2 = cross(b1, b2, a2);
  return ab1 * ab2 < -1e-6 && ba1 * ba2 < -1e-6;
}

function computeRequiredExtension(
  movingRect: EndRect,
  fixedRect: EndRect,
  angle: number,
) {
  const overlapWidth = Math.min(movingRect.right, fixedRect.right) - Math.max(movingRect.left, fixedRect.left);
  const overlapHeight = Math.min(movingRect.bottom, fixedRect.bottom) - Math.max(movingRect.top, fixedRect.top);

  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;

  const xProjection = Math.abs(Math.cos(angle));
  const yProjection = Math.abs(Math.sin(angle));
  const pushByX = xProjection < 1e-6 ? Infinity : (overlapWidth + RECT_CLEARANCE_PADDING) / xProjection;
  const pushByY = yProjection < 1e-6 ? Infinity : (overlapHeight + RECT_CLEARANCE_PADDING) / yProjection;
  const required = Math.min(pushByX, pushByY);

  if (!Number.isFinite(required)) {
    return Math.max(RECT_EXTENSION_STEP, overlapWidth + overlapHeight + RECT_CLEARANCE_PADDING);
  }

  return Math.max(RECT_EXTENSION_STEP, required);
}

function comparePlacementOrder(
  left: Pick<LayoutEntry, 'rectArea' | 'pointRadius' | 'id'>,
  right: Pick<LayoutEntry, 'rectArea' | 'pointRadius' | 'id'>,
) {
  if (Math.abs(left.rectArea - right.rectArea) > 1e-6) {
    return left.rectArea - right.rectArea;
  }
  if (Math.abs(left.pointRadius - right.pointRadius) > 1e-6) {
    return left.pointRadius - right.pointRadius;
  }
  return left.id.localeCompare(right.id, 'zh-CN');
}

function buildRects(entries: LayoutEntry[]) {
  return entries.map(buildRectForEntry);
}

function rectCollidesAtIndex(rects: EndRect[], targetIndex: number) {
  for (let index = 0; index < rects.length; index++) {
    if (index === targetIndex) continue;
    if (rectsOverlap(rects[targetIndex], rects[index])) return true;
  }
  return false;
}

function lineIntersectsAtIndex(entries: LayoutEntry[], targetIndex: number) {
  const target = entries[targetIndex];
  for (let index = 0; index < entries.length; index++) {
    if (index === targetIndex) continue;
    const candidate = entries[index];
    if (
      segmentsIntersect(
        { x: target.x, y: target.y },
        { x: target.endX, y: target.endY },
        { x: candidate.x, y: candidate.y },
        { x: candidate.endX, y: candidate.endY },
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasAnyLineIntersections(entries: LayoutEntry[]) {
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex++) {
      if (
        segmentsIntersect(
          { x: entries[leftIndex].x, y: entries[leftIndex].y },
          { x: entries[leftIndex].endX, y: entries[leftIndex].endY },
          { x: entries[rightIndex].x, y: entries[rightIndex].y },
          { x: entries[rightIndex].endX, y: entries[rightIndex].endY },
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function updateEntryLength(entry: LayoutEntry, nextLength: number) {
  const nextEnd = {
    x: entry.x + Math.cos(entry.angle) * nextLength,
    y: entry.y + Math.sin(entry.angle) * nextLength,
  };

  return {
    ...entry,
    endX: nextEnd.x,
    endY: nextEnd.y,
    lineLength: nextLength,
  };
}

function updateEntryAngleAndLength(entry: LayoutEntry, nextAngle: number, nextLength: number) {
  const normalizedAngle = normalizeAngle(nextAngle);
  const boundedLength = Math.max(entry.baseLineLength, nextLength);
  const nextEnd = {
    x: entry.x + Math.cos(normalizedAngle) * boundedLength,
    y: entry.y + Math.sin(normalizedAngle) * boundedLength,
  };

  return {
    ...entry,
    angle: normalizedAngle,
    endX: nextEnd.x,
    endY: nextEnd.y,
    lineLength: boundedLength,
  };
}

function computeRectEdgeDistance(a: EndRect, b: EndRect) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

function getRectCenter(rect: EndRect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function buildOrderedNeighborPairs(entries: LayoutEntry[], rects: EndRect[]): NeighborPair[] {
  if (entries.length < 2) return [];

  const rectById = new Map(rects.map((rect) => [rect.id, rect]));
  const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
  const ordered = [...entries].sort((left, right) => left.angle - right.angle);

  return ordered.map((entry, index) => {
    const next = ordered[(index + 1) % ordered.length];
    const currentRect = rectById.get(entry.id);
    const nextRect = rectById.get(next.id);
    const leftIndex = indexById.get(entry.id);
    const rightIndex = indexById.get(next.id);
    if (!currentRect || !nextRect || leftIndex == null || rightIndex == null) return null;
    return {
      leftIndex,
      rightIndex,
      gap: computeRectEdgeDistance(currentRect, nextRect),
    };
  }).filter((item): item is NeighborPair => item !== null);
}

function computeAngularBalancePenalty(rects: EndRect[]) {
  if (rects.length < 3) return 0;

  const angles = rects
    .map((rect) => {
      const center = getRectCenter(rect);
      return normalizeAngle(Math.atan2(center.y, center.x));
    })
    .sort((left, right) => left - right);

  const averageGap = (Math.PI * 2) / angles.length;
  let variance = 0;

  for (let index = 0; index < angles.length; index++) {
    const current = angles[index];
    const next = angles[(index + 1) % angles.length];
    const nextAngle = index === angles.length - 1 ? next + Math.PI * 2 : next;
    const gap = nextAngle - current;
    const delta = gap - averageGap;
    variance += delta * delta;
  }

  return variance;
}

function computeSectorBalancePenalty(rects: EndRect[]) {
  if (rects.length === 0) return 0;
  const counts = Array.from({ length: BALANCE_SECTOR_COUNT }, () => 0);
  rects.forEach((rect) => {
    const center = getRectCenter(rect);
    const angle = normalizeAngle(Math.atan2(center.y, center.x));
    const sectorIndex = Math.min(
      BALANCE_SECTOR_COUNT - 1,
      Math.floor((angle / (Math.PI * 2)) * BALANCE_SECTOR_COUNT),
    );
    counts[sectorIndex] += 1;
  });
  const average = rects.length / BALANCE_SECTOR_COUNT;
  return counts.reduce((sum, count) => {
    const delta = count - average;
    return sum + delta * delta;
  }, 0);
}

function buildRectEnvelope(rects: EndRect[]) {
  if (rects.length === 0) return null;
  return rects.reduce(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.left),
      right: Math.max(acc.right, rect.right),
      top: Math.min(acc.top, rect.top),
      bottom: Math.max(acc.bottom, rect.bottom),
    }),
    {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    },
  );
}

function computeLayoutScore(entries: LayoutEntry[], rects: EndRect[]) {
  const envelope = buildRectEnvelope(rects);
  if (!envelope) return 0;

  const envelopeArea = (envelope.right - envelope.left) * (envelope.bottom - envelope.top);
  const extraLength = entries.reduce((sum, entry) => sum + Math.max(0, entry.lineLength - entry.baseLineLength), 0);
  const maxExtraLength = entries.reduce((maxValue, entry) => Math.max(maxValue, Math.max(0, entry.lineLength - entry.baseLineLength)), 0);
  const averageExtraLength = entries.length > 0 ? extraLength / entries.length : 0;
  const lengthVariance = entries.reduce((sum, entry) => {
    const delta = Math.max(0, entry.lineLength - entry.baseLineLength) - averageExtraLength;
    return sum + delta * delta;
  }, 0);
  const angularBalancePenalty = computeAngularBalancePenalty(rects);
  const sectorBalancePenalty = computeSectorBalancePenalty(rects);
  const neighborGapPenalty = buildOrderedNeighborPairs(entries, rects).reduce((sum, pair) => {
    const deficit = Math.max(0, NEIGHBOR_MIN_GAP - pair.gap);
    return sum + deficit * deficit;
  }, 0);

  return envelopeArea
    + extraLength * 36
    + maxExtraLength * 220
    + lengthVariance * 2.8
    + neighborGapPenalty * 18000
    + angularBalancePenalty * 450000
    + sectorBalancePenalty * 160000;
}

function tightenRectSpacing(entries: LayoutEntry[], mapRect: LogicalRect, mapGap: number) {
  const nextEntries = [...entries];
  const sortedIndexes = nextEntries
    .map((entry, index) => ({ index, extraLength: entry.lineLength - entry.baseLineLength }))
    .sort((left, right) => right.extraLength - left.extraLength)
    .map((item) => item.index);

  sortedIndexes.forEach((targetIndex) => {
    const entry = nextEntries[targetIndex];
    if (entry.lineLength <= entry.baseLineLength + 1e-6) return;

    let low = entry.baseLineLength;
    let high = entry.lineLength;

    for (let iteration = 0; iteration < RECT_TIGHTEN_ITERATIONS; iteration++) {
      const mid = (low + high) / 2;
      const candidateEntries = [...nextEntries];
      candidateEntries[targetIndex] = updateEntryLength(entry, mid);
      const candidateRects = buildRects(candidateEntries);

      if (
        rectCollidesAtIndex(candidateRects, targetIndex) ||
        rectOverlapsMap(candidateRects[targetIndex], mapRect, mapGap) ||
        lineIntersectsAtIndex(candidateEntries, targetIndex)
      ) {
        low = mid;
      } else {
        high = mid;
      }
    }

    nextEntries[targetIndex] = updateEntryLength(entry, high);
  });

  return {
    entries: nextEntries,
    rects: buildRects(nextEntries),
  };
}

function evaluateOptimizedCandidate(entries: LayoutEntry[], targetIndexes: number[], mapRect: LogicalRect, mapGap: number) {
  const candidateRects = buildRects(entries);
  if (targetIndexes.some((targetIndex) => rectCollidesAtIndex(candidateRects, targetIndex))) return null;
  if (targetIndexes.some((targetIndex) => rectOverlapsMap(candidateRects[targetIndex], mapRect, mapGap))) return null;
  if (targetIndexes.some((targetIndex) => lineIntersectsAtIndex(entries, targetIndex))) return null;
  if (hasAnyLineIntersections(entries)) return null;

  const tightened = tightenRectSpacing(entries, mapRect, mapGap);
  if (hasAnyLineIntersections(tightened.entries)) return null;
  if (tightened.rects.some((rect) => rectOverlapsMap(rect, mapRect, mapGap))) return null;
  if (tightened.rects.some((_, index) => rectCollidesAtIndex(tightened.rects, index))) return null;
  return tightened;
}

function resolveRectCollisions(entries: LayoutEntry[], mapRect: LogicalRect, mapGap: number) {
  const nextEntries = [...entries];

  for (let pass = 0; pass < RECT_EXTENSION_LIMIT; pass++) {
    const rects = buildRects(nextEntries);
    let changed = false;

    for (let leftIndex = 0; leftIndex < rects.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex++) {
        if (!rectsOverlap(rects[leftIndex], rects[rightIndex])) continue;

        const leftEntry = nextEntries[leftIndex];
        const rightEntry = nextEntries[rightIndex];
        const leftArea = leftEntry.rectArea;
        const rightArea = rightEntry.rectArea;
        const targetIndex = leftArea >= rightArea ? rightIndex : leftIndex;
        const targetEntry = nextEntries[targetIndex];
        const targetRect = rects[targetIndex];
        const blockerRect = rects[targetIndex === leftIndex ? rightIndex : leftIndex];
        const extension = computeRequiredExtension(targetRect, blockerRect, targetEntry.angle);
        const candidateEntries = [...nextEntries];
        candidateEntries[targetIndex] = updateEntryLength(targetEntry, targetEntry.lineLength + extension);
        const candidateRects = buildRects(candidateEntries);
        if (rectOverlapsMap(candidateRects[targetIndex], mapRect, mapGap)) continue;
        if (lineIntersectsAtIndex(candidateEntries, targetIndex)) continue;
        nextEntries[targetIndex] = candidateEntries[targetIndex];
        changed = true;
      }
    }

    if (!changed) break;
  }

  return {
    entries: nextEntries,
    rects: buildRects(nextEntries),
  };
}

function optimizeAngles(entries: LayoutEntry[], mapRect: LogicalRect, mapGap: number) {
  const nextEntries = [...entries];
  let currentRects = buildRects(nextEntries);
  let currentScore = computeLayoutScore(nextEntries, currentRects);
  const candidateIndexes = nextEntries
    .map((entry, index) => ({ index, extraLength: entry.lineLength - entry.baseLineLength }))
    .sort((left, right) => right.extraLength - left.extraLength)
    .map((item) => item.index);

  for (let pass = 0; pass < ANGLE_OPTIMIZE_PASSES; pass++) {
    let bestCandidate: null | { entries: LayoutEntry[]; rects: EndRect[]; score: number } = null;

    for (const targetIndex of candidateIndexes) {
      const sourceEntry = nextEntries[targetIndex];
      const sourceDirectionBias = sourceEntry.endY >= 0 ? 1 : -1;
      const linkedPatterns = [
        [{ index: targetIndex, weight: 1 }],
        [{ index: targetIndex, weight: 1 }, { index: Math.max(0, targetIndex - 1), weight: 0.45 }],
        [{ index: targetIndex, weight: 1 }, { index: Math.min(nextEntries.length - 1, targetIndex + 1), weight: 0.45 }],
        [
          { index: targetIndex, weight: 1 },
          { index: Math.max(0, targetIndex - 1), weight: 0.35 },
          { index: Math.min(nextEntries.length - 1, targetIndex + 1), weight: 0.35 },
        ],
      ].map((pattern) => pattern.filter((item, index, array) => array.findIndex((candidate) => candidate.index === item.index) === index));

      for (const candidateDegree of ANGLE_OPTIMIZE_DEGREES) {
        for (const direction of [sourceDirectionBias, -sourceDirectionBias]) {
          for (const pattern of linkedPatterns) {
            for (const lengthFactor of LINKED_LENGTH_FACTORS) {
              const candidateEntries = [...nextEntries];
              const touchedIndexes: number[] = [];

              pattern.forEach(({ index, weight }) => {
                const source = nextEntries[index];
                const nextAngle = source.angle + degreesToRadians(candidateDegree * direction * weight);
                const nextLength = source.baseLineLength + (source.lineLength - source.baseLineLength) * lengthFactor;
                candidateEntries[index] = updateEntryAngleAndLength(source, nextAngle, nextLength);
                touchedIndexes.push(index);
              });

              const tightened = evaluateOptimizedCandidate(candidateEntries, touchedIndexes, mapRect, mapGap);
              if (!tightened) continue;

              const candidateScore = computeLayoutScore(tightened.entries, tightened.rects);
              if (candidateScore >= currentScore - 1e-6) continue;
              if (!bestCandidate || candidateScore < bestCandidate.score - 1e-6) {
                bestCandidate = { entries: tightened.entries, rects: tightened.rects, score: candidateScore };
              }
            }
          }
        }
      }
    }

    if (!bestCandidate) break;
    for (let index = 0; index < bestCandidate.entries.length; index++) nextEntries[index] = bestCandidate.entries[index];
    currentRects = bestCandidate.rects;
    currentScore = bestCandidate.score;
  }

  return { entries: nextEntries, rects: currentRects };
}

function optimizeAngleGroups(entries: LayoutEntry[], mapRect: LogicalRect, mapGap: number) {
  const nextEntries = [...entries];
  let currentRects = buildRects(nextEntries);
  let currentScore = computeLayoutScore(nextEntries, currentRects);

  for (let pass = 0; pass < GROUP_ANGLE_PASSES; pass++) {
    let bestCandidate: null | { entries: LayoutEntry[]; rects: EndRect[]; score: number } = null;

    for (let index = 0; index < nextEntries.length - 1; index++) {
      const leftEntry = nextEntries[index];
      const rightEntry = nextEntries[index + 1];
      const patterns: Array<[number, number]> = [[1, 1], [-1, -1], [1, -1], [-1, 1]];

      for (const degree of GROUP_ANGLE_DEGREES) {
        for (const [leftDirection, rightDirection] of patterns) {
          for (const lengthFactor of LINKED_LENGTH_FACTORS) {
            const candidateEntries = [...nextEntries];
            candidateEntries[index] = updateEntryAngleAndLength(
              leftEntry,
              leftEntry.angle + degreesToRadians(degree * leftDirection),
              leftEntry.baseLineLength + (leftEntry.lineLength - leftEntry.baseLineLength) * lengthFactor,
            );
            candidateEntries[index + 1] = updateEntryAngleAndLength(
              rightEntry,
              rightEntry.angle + degreesToRadians(degree * rightDirection),
              rightEntry.baseLineLength + (rightEntry.lineLength - rightEntry.baseLineLength) * lengthFactor,
            );

            const tightened = evaluateOptimizedCandidate(candidateEntries, [index, index + 1], mapRect, mapGap);
            if (!tightened) continue;

            const candidateScore = computeLayoutScore(tightened.entries, tightened.rects);
            if (candidateScore >= currentScore - 1e-6) continue;
            if (!bestCandidate || candidateScore < bestCandidate.score - 1e-6) {
              bestCandidate = { entries: tightened.entries, rects: tightened.rects, score: candidateScore };
            }
          }
        }
      }
    }

    if (!bestCandidate) break;
    for (let index = 0; index < bestCandidate.entries.length; index++) nextEntries[index] = bestCandidate.entries[index];
    currentRects = bestCandidate.rects;
    currentScore = bestCandidate.score;
  }

  return { entries: nextEntries, rects: currentRects };
}

function refineNeighborSpacing(entries: LayoutEntry[], mapRect: LogicalRect, mapGap: number) {
  let nextEntries = [...entries];
  let currentRects = buildRects(nextEntries);
  let currentScore = computeLayoutScore(nextEntries, currentRects);

  for (let pass = 0; pass < NEIGHBOR_RELAX_PASSES; pass++) {
    const orderedPairs = buildOrderedNeighborPairs(nextEntries, currentRects).sort((left, right) => left.gap - right.gap);
    const targetPair = orderedPairs.find((pair) => pair.gap < NEIGHBOR_MIN_GAP + 16);
    if (!targetPair) break;

    const currentMaxLength = nextEntries.reduce((maxValue, entry) => Math.max(maxValue, entry.lineLength), 0);
    const entryCount = nextEntries.length;
    const neighborhoodPatterns = [
      [targetPair.leftIndex, targetPair.rightIndex],
      [(targetPair.leftIndex - 1 + entryCount) % entryCount, targetPair.leftIndex, targetPair.rightIndex],
      [targetPair.leftIndex, targetPair.rightIndex, (targetPair.rightIndex + 1) % entryCount],
      [(targetPair.leftIndex - 1 + entryCount) % entryCount, targetPair.leftIndex, targetPair.rightIndex, (targetPair.rightIndex + 1) % entryCount],
    ].map((pattern) => pattern.filter((index, position, source) => source.indexOf(index) === position));

    let bestCandidate: null | { entries: LayoutEntry[]; rects: EndRect[]; score: number } = null;

    for (const angleDegree of NEIGHBOR_ANGLE_DEGREES) {
      for (const lengthFactor of NEIGHBOR_LENGTH_FACTORS) {
        neighborhoodPatterns.forEach((pattern) => {
          const center = (pattern.length - 1) / 2;
          const variants = [
            pattern.map((index, offset) => {
              const distanceFromCenter = offset - center;
              const spread = distanceFromCenter === 0 ? 0 : Math.sign(distanceFromCenter);
              const weight = pattern.length <= 2 ? 1 : 1 - Math.min(0.55, Math.abs(distanceFromCenter) * 0.28);
              return { index, angleOffset: angleDegree * spread * weight, lengthFactor };
            }),
            pattern.map((index, offset) => {
              const distanceFromCenter = offset - center;
              const spread = distanceFromCenter === 0 ? 0 : -Math.sign(distanceFromCenter);
              const weight = pattern.length <= 2 ? 1 : 1 - Math.min(0.55, Math.abs(distanceFromCenter) * 0.28);
              return { index, angleOffset: angleDegree * spread * weight, lengthFactor };
            }),
          ];

          variants.forEach((variant) => {
            const candidateEntries = [...nextEntries];
            const touchedIndexes: number[] = [];

            variant.forEach(({ index, angleOffset, lengthFactor }) => {
              const source = nextEntries[index];
              const nextLength = source.baseLineLength + (source.lineLength - source.baseLineLength) * lengthFactor;
              candidateEntries[index] = updateEntryAngleAndLength(source, source.angle + degreesToRadians(angleOffset), nextLength);
              touchedIndexes.push(index);
            });

            const tightened = evaluateOptimizedCandidate(candidateEntries, touchedIndexes, mapRect, mapGap);
            if (!tightened) return;

            const candidateMaxLength = tightened.entries.reduce((maxValue, entry) => Math.max(maxValue, entry.lineLength), 0);
            if (candidateMaxLength > currentMaxLength + 1e-6) return;

            const candidateScore = computeLayoutScore(tightened.entries, tightened.rects);
            if (candidateScore >= currentScore - 1e-6) return;
            if (!bestCandidate || candidateScore < bestCandidate.score - 1e-6) {
              bestCandidate = { entries: tightened.entries, rects: tightened.rects, score: candidateScore };
            }
          });
        });
      }
    }

    if (!bestCandidate) break;
    nextEntries = bestCandidate.entries;
    currentRects = bestCandidate.rects;
    currentScore = bestCandidate.score;
  }

  return { entries: nextEntries, rects: currentRects };
}

function buildBaseEntries(sources: LayoutSource[], mapRect: LogicalRect, mapGap: number) {
  const displayRadius = Math.hypot(mapRect.right, mapRect.bottom) * DISPLAY_RADIUS_RATIO;
  const rawEntries: LayoutEntry[] = sources.map((source) => ({
    ...source,
    pointRadius: distance({ x: 0, y: 0 }, source),
    angle: normalizeAngle(Math.atan2(source.y, source.x)),
    rectArea: Math.max(0, source.rect.right - source.rect.left) * Math.max(0, source.rect.bottom - source.rect.top),
    endX: source.x,
    endY: source.y,
    baseLineLength: 0,
    lineLength: 0,
  }));

  const placementOrder = [...rawEntries].sort(comparePlacementOrder);
  const placedEntries: LayoutEntry[] = [];

  placementOrder.forEach((entry, index) => {
    let low = displayRadius;
    let high = displayRadius + Math.max(1, index) * BASE_LAYOUT_LAYER_STEP + 1200;

    while (high - low > 1) {
      const mid = (low + high) / 2;
      const end = projectAngle(entry.angle, mid);
      const candidate = {
        ...entry,
        endX: end.x,
        endY: end.y,
        baseLineLength: distance(entry, end),
        lineLength: distance(entry, end),
      };
      const candidateRect = buildRectForEntry(candidate);
      const collides = placedEntries.some((placedEntry) => rectsOverlap(candidateRect, buildRectForEntry(placedEntry)));
      const overlapsMap = rectOverlapsMap(candidateRect, mapRect, mapGap);

      if (collides || overlapsMap) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const end = projectAngle(entry.angle, high);
    placedEntries.push({
      ...entry,
      endX: end.x,
      endY: end.y,
      baseLineLength: distance(entry, end),
      lineLength: distance(entry, end),
    });
  });

  return placedEntries.sort((a, b) => a.angle - b.angle);
}

export function buildRadialLayout(
  sources: LayoutSource[],
  mapRect: LogicalRect,
  options?: { mapGap?: number },
): LayoutPlacement[] {
  if (sources.length === 0) return [];
  const mapGap = options?.mapGap ?? 14;
  const baseEntries = buildBaseEntries(sources, mapRect, mapGap);
  const resolved = resolveRectCollisions(baseEntries, mapRect, mapGap);
  const tightened = tightenRectSpacing(resolved.entries, mapRect, mapGap);
  const optimizedSingles = optimizeAngles(tightened.entries, mapRect, mapGap);
  const optimizedGroups = optimizeAngleGroups(optimizedSingles.entries, mapRect, mapGap);
  const refined = refineNeighborSpacing(optimizedGroups.entries, mapRect, mapGap);

  return refined.entries.map((entry) => ({
    id: entry.id,
    centerX: entry.endX,
    centerY: entry.endY,
  }));
}
