'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type Point = {
  id: number;
  x: number;
  y: number;
};

type Band = 'outer' | 'midHigh' | 'midLow' | 'inner';

type LayoutEntry = Point & {
  band: Band;
  pointRadius: number;
  angle: number;
  rectWidth: number;
  rectHeight: number;
  rectArea: number;
  endX: number;
  endY: number;
  baseLineLength: number;
  lineLength: number;
  colorClass: string;
};

type EndRect = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  colorClass: string;
};

type BoundsRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type GapCell = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const STAGE_SIZE = 1120;
const MAP_SIZE = 420;
const VIEWPORT_PADDING = 96;
const MAP_CIRCLE_RADIUS = (Math.sqrt(2) * MAP_SIZE) / 2;
const DISPLAY_RADIUS = MAP_CIRCLE_RADIUS * 1.5;
const INNER_RADIUS = MAP_CIRCLE_RADIUS / 3;
const MID_RADIUS = MAP_CIRCLE_RADIUS / 2;
const OUTER_RADIUS = (MAP_CIRCLE_RADIUS * 2) / 3;
const RECT_MIN_WIDTH = 80;
const RECT_MAX_WIDTH = 300;
const RECT_MIN_HEIGHT = 60;
const RECT_MAX_HEIGHT = 250;
const RECT_EXTENSION_STEP = 18;
const RECT_EXTENSION_LIMIT = 40;
const RECT_CLEARANCE_PADDING = 6;
const RECT_OUTER_OFFSET = 24;
const BASE_LAYOUT_LAYER_STEP = 18;
const RECT_TIGHTEN_ITERATIONS = 14;
const NEIGHBOR_MIN_GAP = 22;
const NEIGHBOR_RELAX_PASSES = 18;
const NEIGHBOR_ANGLE_DEGREES = [12, 8, 4, 2];
const NEIGHBOR_LENGTH_FACTORS = [0.88, 0.94, 0.98, 1];
const GAP_GRID_SIZE = 24;
const ANGLE_OPTIMIZE_DEGREES = [12, 8, 4, 2];
const ANGLE_OPTIMIZE_PASSES = 12;
const BALANCE_SECTOR_COUNT = 12;
const LINKED_LENGTH_FACTORS = [1, 0.94, 0.88, 0.82];
const GROUP_ANGLE_DEGREES = [8, 4, 2];
const GROUP_ANGLE_PASSES = 6;
const RECT_SIZE_SEED_X = 997;
const RECT_SIZE_SEED_Y = 463;
const RECT_SIZE_ID_X = 17;
const RECT_SIZE_ID_Y = 29;

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

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

function randomFromSeed(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function buildRandomPoints(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    x: roundToTwo(Math.random() * MAP_SIZE - MAP_SIZE / 2),
    y: roundToTwo(Math.random() * MAP_SIZE - MAP_SIZE / 2),
  }));
}

function getBand(radius: number): Band {
  if (radius > OUTER_RADIUS) return 'outer';
  if (radius > MID_RADIUS) return 'midHigh';
  if (radius > INNER_RADIUS) return 'midLow';
  return 'inner';
}

function buildRectSize(pointId: number, seed: number) {
  return {
    width: RECT_MIN_WIDTH + randomFromSeed(seed * RECT_SIZE_SEED_X + pointId * RECT_SIZE_ID_X) * (RECT_MAX_WIDTH - RECT_MIN_WIDTH),
    height: RECT_MIN_HEIGHT + randomFromSeed(seed * RECT_SIZE_SEED_Y + pointId * RECT_SIZE_ID_Y) * (RECT_MAX_HEIGHT - RECT_MIN_HEIGHT),
  };
}

function buildBaseEntries(points: Point[], seed: number) {
  const rawEntries: LayoutEntry[] = points.map((point) => {
    const pointRadius = distance({ x: 0, y: 0 }, point);
    const band = getBand(pointRadius);
    const angle = normalizeAngle(Math.atan2(point.y, point.x));
    const rectSize = buildRectSize(point.id, seed);

    return {
      ...point,
      band,
      pointRadius,
      angle,
      rectWidth: rectSize.width,
      rectHeight: rectSize.height,
      rectArea: rectSize.width * rectSize.height,
      endX: 0,
      endY: 0,
      baseLineLength: 0,
      lineLength: 0,
      colorClass:
        band === 'outer'
          ? styles.outer
          : band === 'midHigh'
            ? styles.midHigh
            : band === 'midLow'
              ? styles.midLow
              : styles.inner,
      };
  });

  const placementOrder = [...rawEntries].sort(comparePlacementOrder);
  const placedEntries: LayoutEntry[] = [];

  placementOrder.forEach((entry, index) => {
    let low = DISPLAY_RADIUS;
    let high = DISPLAY_RADIUS + Math.max(1, index) * BASE_LAYOUT_LAYER_STEP + 1200;

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
      const collides = placedEntries.some((placedEntry) => (
        rectsOverlap(candidateRect, buildRectForEntry(placedEntry))
      ));

      if (collides) {
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

function buildRectForEntry(entry: LayoutEntry): EndRect {
  const width = entry.rectWidth;
  const height = entry.rectHeight;
  const isBottomRegion = entry.endY > 0;
  const anchorX = entry.endX;
  const anchorY = entry.endY;
  const x = anchorX - width / 2;
  const y = isBottomRegion ? anchorY : anchorY - height;

  return {
    id: entry.id,
    x,
    y,
    width,
    height,
    anchorX,
    anchorY,
    colorClass: entry.colorClass,
  };
}

function rectsOverlap(a: EndRect, b: EndRect) {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
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
  const overlapWidth = Math.min(movingRect.x + movingRect.width, fixedRect.x + fixedRect.width)
    - Math.max(movingRect.x, fixedRect.x);
  const overlapHeight = Math.min(movingRect.y + movingRect.height, fixedRect.y + fixedRect.height)
    - Math.max(movingRect.y, fixedRect.y);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

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

function buildRects(entries: LayoutEntry[]) {
  return entries.map(buildRectForEntry);
}

function getRectArea(rect: EndRect) {
  return rect.width * rect.height;
}

// Smaller rectangles enter the layout first; later entries occupy outer layers.
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
  return left.id - right.id;
}

function countRectCollisions(rects: EndRect[]) {
  let total = 0;
  for (let leftIndex = 0; leftIndex < rects.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex++) {
      if (rectsOverlap(rects[leftIndex], rects[rightIndex])) {
        total += 1;
      }
    }
  }
  return total;
}

function rectCollidesAtIndex(rects: EndRect[], targetIndex: number) {
  for (let index = 0; index < rects.length; index++) {
    if (index === targetIndex) continue;
    if (rectsOverlap(rects[targetIndex], rects[index])) {
      return true;
    }
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

function updateEntryAngle(entry: LayoutEntry, nextAngle: number) {
  const normalizedAngle = normalizeAngle(nextAngle);
  const nextEnd = {
    x: entry.x + Math.cos(normalizedAngle) * entry.lineLength,
    y: entry.y + Math.sin(normalizedAngle) * entry.lineLength,
  };

  return {
    ...entry,
    angle: normalizedAngle,
    endX: nextEnd.x,
    endY: nextEnd.y,
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

function evaluateOptimizedCandidate(entries: LayoutEntry[], targetIndexes: number[]) {
  const candidateRects = buildRects(entries);
  if (targetIndexes.some((targetIndex) => rectCollidesAtIndex(candidateRects, targetIndex))) {
    return null;
  }
  if (targetIndexes.some((targetIndex) => lineIntersectsAtIndex(entries, targetIndex))) {
    return null;
  }
  if (hasAnyLineIntersections(entries)) {
    return null;
  }

  const tightened = tightenRectSpacing(entries);
  if (hasAnyLineIntersections(tightened.entries) || countRectCollisions(tightened.rects) > 0) {
    return null;
  }

  return tightened;
}

function resolveRectCollisions(entries: LayoutEntry[], seed: number) {
  const nextEntries = [...entries];

  for (let pass = 0; pass < RECT_EXTENSION_LIMIT; pass++) {
    const rects = buildRects(nextEntries);
    let changed = false;

    for (let leftIndex = 0; leftIndex < rects.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex++) {
        if (!rectsOverlap(rects[leftIndex], rects[rightIndex])) continue;

        const leftEntry = nextEntries[leftIndex];
        const rightEntry = nextEntries[rightIndex];
        const leftArea = getRectArea(rects[leftIndex]);
        const rightArea = getRectArea(rects[rightIndex]);
        const targetIndex = leftArea >= rightArea ? rightIndex : leftIndex;
        const targetEntry = nextEntries[targetIndex];
        const targetRect = rects[targetIndex];
        const blockerRect = rects[targetIndex === leftIndex ? rightIndex : leftIndex];
        const extension = computeRequiredExtension(targetRect, blockerRect, targetEntry.angle);
        const candidateEntries = [...nextEntries];
        candidateEntries[targetIndex] = updateEntryLength(targetEntry, targetEntry.lineLength + extension);
        if (lineIntersectsAtIndex(candidateEntries, targetIndex)) {
          continue;
        }
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

function tightenRectSpacing(entries: LayoutEntry[]) {
  const nextEntries = [...entries];

  const sortedIndexes = nextEntries
    .map((entry, index) => ({
      index,
      extraLength: entry.lineLength - entry.baseLineLength,
    }))
    .sort((left, right) => right.extraLength - left.extraLength)
    .map((item) => item.index);

  sortedIndexes.forEach((targetIndex) => {
    const entry = nextEntries[targetIndex];
    if (entry.lineLength <= entry.baseLineLength + 1e-6) {
      return;
    }

    let low = entry.baseLineLength;
    let high = entry.lineLength;

    for (let iteration = 0; iteration < RECT_TIGHTEN_ITERATIONS; iteration++) {
      const mid = (low + high) / 2;
      const candidateEntries = [...nextEntries];
      candidateEntries[targetIndex] = updateEntryLength(entry, mid);
      const candidateRects = buildRects(candidateEntries);

      if (
        rectCollidesAtIndex(candidateRects, targetIndex)
        || lineIntersectsAtIndex(candidateEntries, targetIndex)
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

function computeLayoutScore(entries: LayoutEntry[], rects: EndRect[]) {
  const envelope = buildRectEnvelope(rects);
  if (!envelope) return 0;

  const envelopeArea = (envelope.right - envelope.left) * (envelope.bottom - envelope.top);
  const extraLength = entries.reduce((sum, entry) => (
    sum + Math.max(0, entry.lineLength - entry.baseLineLength)
  ), 0);
  const maxExtraLength = entries.reduce((maxValue, entry) => (
    Math.max(maxValue, Math.max(0, entry.lineLength - entry.baseLineLength))
  ), 0);
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

function optimizeAngles(entries: LayoutEntry[]) {
  const nextEntries = [...entries];
  let currentRects = buildRects(nextEntries);
  let currentScore = computeLayoutScore(nextEntries, currentRects);

  const candidateIndexes = nextEntries
    .map((entry, index) => ({
      index,
      extraLength: entry.lineLength - entry.baseLineLength,
    }))
    .sort((left, right) => right.extraLength - left.extraLength)
    .map((item) => item.index);

  for (let pass = 0; pass < ANGLE_OPTIMIZE_PASSES; pass++) {
    let bestCandidate: null | {
      entries: LayoutEntry[];
      rects: EndRect[];
      score: number;
    } = null;

    for (const targetIndex of candidateIndexes) {
      const sourceEntry = nextEntries[targetIndex];
      const sourceDirectionBias = sourceEntry.endY >= 0 ? 1 : -1;
      const linkedPatterns = [
        [{ index: targetIndex, weight: 1 }],
        [
          { index: targetIndex, weight: 1 },
          { index: Math.max(0, targetIndex - 1), weight: 0.45 },
        ],
        [
          { index: targetIndex, weight: 1 },
          { index: Math.min(nextEntries.length - 1, targetIndex + 1), weight: 0.45 },
        ],
        [
          { index: targetIndex, weight: 1 },
          { index: Math.max(0, targetIndex - 1), weight: 0.35 },
          { index: Math.min(nextEntries.length - 1, targetIndex + 1), weight: 0.35 },
        ],
      ].map((pattern) => pattern.filter((item, index, array) => (
        array.findIndex((candidate) => candidate.index === item.index) === index
      )));

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

              const tightened = evaluateOptimizedCandidate(candidateEntries, touchedIndexes);
              if (!tightened) {
                continue;
              }

              const candidateScore = computeLayoutScore(tightened.entries, tightened.rects);
              if (candidateScore >= currentScore - 1e-6) {
                continue;
              }

              if (!bestCandidate || candidateScore < bestCandidate.score - 1e-6) {
                bestCandidate = {
                  entries: tightened.entries,
                  rects: tightened.rects,
                  score: candidateScore,
                };
              }
            }
          }
        }
      }
    }

    if (!bestCandidate) {
      break;
    }

    for (let index = 0; index < bestCandidate.entries.length; index++) {
      nextEntries[index] = bestCandidate.entries[index];
    }
    currentRects = bestCandidate.rects;
    currentScore = bestCandidate.score;
  }

  return {
    entries: nextEntries,
    rects: currentRects,
  };
}

function optimizeAngleGroups(entries: LayoutEntry[]) {
  const nextEntries = [...entries];
  let currentRects = buildRects(nextEntries);
  let currentScore = computeLayoutScore(nextEntries, currentRects);

  for (let pass = 0; pass < GROUP_ANGLE_PASSES; pass++) {
    let bestCandidate: null | {
      entries: LayoutEntry[];
      rects: EndRect[];
      score: number;
    } = null;

    for (let index = 0; index < nextEntries.length - 1; index++) {
      const leftEntry = nextEntries[index];
      const rightEntry = nextEntries[index + 1];
      const patterns: Array<[number, number]> = [
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ];

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

            const tightened = evaluateOptimizedCandidate(candidateEntries, [index, index + 1]);
            if (!tightened) {
              continue;
            }

            const candidateScore = computeLayoutScore(tightened.entries, tightened.rects);
            if (candidateScore >= currentScore - 1e-6) {
              continue;
            }

            if (!bestCandidate || candidateScore < bestCandidate.score - 1e-6) {
              bestCandidate = {
                entries: tightened.entries,
                rects: tightened.rects,
                score: candidateScore,
              };
            }
          }
        }
      }
    }

    if (!bestCandidate) {
      break;
    }

    for (let index = 0; index < bestCandidate.entries.length; index++) {
      nextEntries[index] = bestCandidate.entries[index];
    }
    currentRects = bestCandidate.rects;
    currentScore = bestCandidate.score;
  }

  return {
    entries: nextEntries,
    rects: currentRects,
  };
}

function refineNeighborSpacing(entries: LayoutEntry[]) {
  let nextEntries = [...entries];
  let currentRects = buildRects(nextEntries);
  let currentScore = computeLayoutScore(nextEntries, currentRects);

  for (let pass = 0; pass < NEIGHBOR_RELAX_PASSES; pass++) {
    const orderedPairs = buildOrderedNeighborPairs(nextEntries, currentRects)
      .sort((left, right) => left.gap - right.gap);
    const targetPair = orderedPairs.find((pair) => pair.gap < NEIGHBOR_MIN_GAP + 16);

    if (!targetPair) {
      break;
    }

    const currentMaxLength = nextEntries.reduce((maxValue, entry) => (
      Math.max(maxValue, entry.lineLength)
    ), 0);
    const entryCount = nextEntries.length;
    const neighborhoodPatterns = [
      [targetPair.leftIndex, targetPair.rightIndex],
      [
        (targetPair.leftIndex - 1 + entryCount) % entryCount,
        targetPair.leftIndex,
        targetPair.rightIndex,
      ],
      [
        targetPair.leftIndex,
        targetPair.rightIndex,
        (targetPair.rightIndex + 1) % entryCount,
      ],
      [
        (targetPair.leftIndex - 1 + entryCount) % entryCount,
        targetPair.leftIndex,
        targetPair.rightIndex,
        (targetPair.rightIndex + 1) % entryCount,
      ],
    ].map((pattern) => pattern.filter((index, position, source) => source.indexOf(index) === position));

    let bestCandidate: null | {
      entries: LayoutEntry[];
      rects: EndRect[];
      score: number;
    } = null;

    for (const angleDegree of NEIGHBOR_ANGLE_DEGREES) {
      for (const lengthFactor of NEIGHBOR_LENGTH_FACTORS) {
        neighborhoodPatterns.forEach((pattern) => {
          const center = (pattern.length - 1) / 2;
          const variants: Array<Array<{ index: number; angleOffset: number; lengthFactor: number }>> = [
            pattern.map((index, offset) => {
              const distanceFromCenter = offset - center;
              const spread = distanceFromCenter === 0 ? 0 : Math.sign(distanceFromCenter);
              const weight = pattern.length <= 2 ? 1 : 1 - Math.min(0.55, Math.abs(distanceFromCenter) * 0.28);
              return {
                index,
                angleOffset: angleDegree * spread * weight,
                lengthFactor,
              };
            }),
            pattern.map((index, offset) => {
              const distanceFromCenter = offset - center;
              const spread = distanceFromCenter === 0 ? 0 : -Math.sign(distanceFromCenter);
              const weight = pattern.length <= 2 ? 1 : 1 - Math.min(0.55, Math.abs(distanceFromCenter) * 0.28);
              return {
                index,
                angleOffset: angleDegree * spread * weight,
                lengthFactor,
              };
            }),
          ];

          variants.forEach((variant) => {
            const candidateEntries = [...nextEntries];
            const touchedIndexes: number[] = [];

            variant.forEach(({ index, angleOffset, lengthFactor }) => {
              const source = nextEntries[index];
              const nextLength = source.baseLineLength + (source.lineLength - source.baseLineLength) * lengthFactor;
              candidateEntries[index] = updateEntryAngleAndLength(
                source,
                source.angle + degreesToRadians(angleOffset),
                nextLength,
              );
              touchedIndexes.push(index);
            });

            const tightened = evaluateOptimizedCandidate(candidateEntries, touchedIndexes);
            if (!tightened) {
              return;
            }

            const candidateMaxLength = tightened.entries.reduce((maxValue, entry) => (
              Math.max(maxValue, entry.lineLength)
            ), 0);
            if (candidateMaxLength > currentMaxLength + 1e-6) {
              return;
            }

            const candidateScore = computeLayoutScore(tightened.entries, tightened.rects);
            if (candidateScore >= currentScore - 1e-6) {
              return;
            }

            if (!bestCandidate || candidateScore < bestCandidate.score - 1e-6) {
              bestCandidate = {
                entries: tightened.entries,
                rects: tightened.rects,
                score: candidateScore,
              };
            }
          });
        });
      }
    }

    if (!bestCandidate) {
      break;
    }

    const resolvedCandidate: {
      entries: LayoutEntry[];
      rects: EndRect[];
      score: number;
    } = bestCandidate;
    nextEntries = resolvedCandidate.entries;
    currentRects = resolvedCandidate.rects;
    currentScore = resolvedCandidate.score;
  }

  return {
    entries: nextEntries,
    rects: currentRects,
  };
}

function buildLayout(points: Point[], seed: number) {
  const baseEntries = buildBaseEntries(points, seed);
  const resolved = resolveRectCollisions(baseEntries, seed);
  const tightened = tightenRectSpacing(resolved.entries);
  const optimizedSingles = optimizeAngles(tightened.entries);
  const optimizedGroups = optimizeAngleGroups(optimizedSingles.entries);
  return refineNeighborSpacing(optimizedGroups.entries);
}

function buildRectEnvelope(rects: EndRect[]): BoundsRect | null {
  if (rects.length === 0) {
    return null;
  }

  return rects.reduce(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.x),
      right: Math.max(acc.right, rect.x + rect.width),
      top: Math.min(acc.top, rect.y),
      bottom: Math.max(acc.bottom, rect.y + rect.height),
    }),
    {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    },
  );
}

function cellCoveredByAnyRect(cell: GapCell, rects: EndRect[]) {
  return rects.some((rect) => !(
    cell.x + cell.width <= rect.x
    || rect.x + rect.width <= cell.x
    || cell.y + cell.height <= rect.y
    || rect.y + rect.height <= cell.y
  ));
}

function buildGapCells(rects: EndRect[]) {
  const envelope = buildRectEnvelope(rects);
  if (!envelope) {
    return [];
  }

  const cells: GapCell[] = [];
  for (let y = envelope.top; y < envelope.bottom; y += GAP_GRID_SIZE) {
    for (let x = envelope.left; x < envelope.right; x += GAP_GRID_SIZE) {
      const cell: GapCell = {
        x,
        y,
        width: Math.min(GAP_GRID_SIZE, envelope.right - x),
        height: Math.min(GAP_GRID_SIZE, envelope.bottom - y),
      };
      if (!cellCoveredByAnyRect(cell, rects)) {
        cells.push(cell);
      }
    }
  }

  return cells;
}

function computeRectEdgeDistance(a: EndRect, b: EndRect) {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

function getRectCenter(rect: EndRect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function buildOrderedNeighborPairs(entries: LayoutEntry[], rects: EndRect[]) {
  if (entries.length < 2) {
    return [];
  }

  const rectById = new Map(rects.map((rect) => [rect.id, rect]));
  const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
  const ordered = [...entries].sort((left, right) => left.angle - right.angle);

  return ordered.map((entry, index) => {
    const next = ordered[(index + 1) % ordered.length];
    const currentRect = rectById.get(entry.id);
    const nextRect = rectById.get(next.id);
    const leftIndex = indexById.get(entry.id);
    const rightIndex = indexById.get(next.id);

    if (!currentRect || !nextRect || leftIndex == null || rightIndex == null) {
      return null;
    }

    return {
      leftIndex,
      rightIndex,
      gap: computeRectEdgeDistance(currentRect, nextRect),
    };
  }).filter((item): item is {
    leftIndex: number;
    rightIndex: number;
    gap: number;
  } => item !== null);
}

function computeAngularBalancePenalty(rects: EndRect[]) {
  if (rects.length < 3) {
    return 0;
  }

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
  if (rects.length === 0) {
    return 0;
  }

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

function buildBounds(entries: LayoutEntry[], rects: EndRect[], envelope: BoundsRect | null) {
  if (entries.length === 0 && rects.length === 0) {
    return {
      left: -MAP_SIZE / 2,
      right: MAP_SIZE / 2,
      top: -MAP_SIZE / 2,
      bottom: MAP_SIZE / 2,
    };
  }

  const entryBounds = entries.reduce(
    (acc, entry) => ({
      left: Math.min(acc.left, entry.x, entry.endX, -MAP_SIZE / 2),
      right: Math.max(acc.right, entry.x, entry.endX, MAP_SIZE / 2),
      top: Math.min(acc.top, entry.y, entry.endY, -MAP_SIZE / 2),
      bottom: Math.max(acc.bottom, entry.y, entry.endY, MAP_SIZE / 2),
    }),
    {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    },
  );

  const rectBounds = rects.reduce(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.x),
      right: Math.max(acc.right, rect.x + rect.width),
      top: Math.min(acc.top, rect.y),
      bottom: Math.max(acc.bottom, rect.y + rect.height),
    }),
    entryBounds,
  );

  if (!envelope) {
    return rectBounds;
  }

  return {
    left: Math.min(rectBounds.left, envelope.left),
    right: Math.max(rectBounds.right, envelope.right),
    top: Math.min(rectBounds.top, envelope.top),
    bottom: Math.max(rectBounds.bottom, envelope.bottom),
  };
}

function buildViewport(bounds: { left: number; right: number; top: number; bottom: number }) {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(
    (STAGE_SIZE - VIEWPORT_PADDING * 2) / width,
    (STAGE_SIZE - VIEWPORT_PADDING * 2) / height,
  );

  return {
    scale: Math.min(1.42, scale),
    centerX: (bounds.left + bounds.right) / 2,
    centerY: (bounds.top + bounds.bottom) / 2,
  };
}

export default function TestLayoutV2Page() {
  const [count, setCount] = useState(24);
  const [seed, setSeed] = useState(1);
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    setPoints(buildRandomPoints(count));
  }, [count, seed]);

  const layout = useMemo(
    () => buildLayout(points, seed),
    [points, seed],
  );
  const entryById = useMemo(
    () => new Map(layout.entries.map((entry) => [entry.id, entry])),
    [layout.entries],
  );
  const rectEnvelope = useMemo(() => buildRectEnvelope(layout.rects), [layout.rects]);
  const gapCells = useMemo(() => buildGapCells(layout.rects), [layout.rects]);
  const layeredRects = useMemo(
    () => [...layout.rects].sort((left, right) => {
      const leftEntry = entryById.get(left.id);
      const rightEntry = entryById.get(right.id);
      if (leftEntry && rightEntry) {
        return comparePlacementOrder(leftEntry, rightEntry);
      }
      const leftRadius = leftEntry?.pointRadius ?? Infinity;
      const rightRadius = rightEntry?.pointRadius ?? Infinity;
      return leftRadius - rightRadius;
    }),
    [layout.rects, entryById],
  );
  const rectById = useMemo(
    () => new Map(layeredRects.map((rect) => [rect.id, rect])),
    [layeredRects],
  );
  const bounds = useMemo(
    () => buildBounds(layout.entries, layout.rects, rectEnvelope),
    [layout.entries, layout.rects, rectEnvelope],
  );
  const viewport = useMemo(() => buildViewport(bounds), [bounds]);
  const collisionCount = useMemo(() => countRectCollisions(layout.rects), [layout.rects]);

  return (
    <main className={styles.root}>
      <section className={styles.stagePane}>
        <div className={styles.stage}>
          <svg viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`} className={styles.svg}>
            <g transform={`translate(${STAGE_SIZE / 2} ${STAGE_SIZE / 2})`}>
              <g transform={`scale(${viewport.scale})`}>
                <g transform={`translate(${-viewport.centerX} ${-viewport.centerY})`}>
                  <rect
                    x={-MAP_SIZE / 2}
                    y={-MAP_SIZE / 2}
                    width={MAP_SIZE}
                    height={MAP_SIZE}
                    rx="24"
                    className={styles.mapRect}
                  />

                  {layout.entries.map((entry) => (
                    <line
                      key={`line-${entry.id}`}
                      x1={entry.x}
                      y1={entry.y}
                      x2={rectById.get(entry.id)?.anchorX ?? entry.endX}
                      y2={rectById.get(entry.id)?.anchorY ?? entry.endY}
                      className={`${styles.line} ${entry.colorClass}`}
                    />
                  ))}

                  {gapCells.map((cell, index) => (
                    <rect
                      key={`gap-${index}`}
                      x={cell.x}
                      y={cell.y}
                      width={cell.width}
                      height={cell.height}
                      className={styles.gapCell}
                    />
                  ))}

                  {layeredRects.map((rect) => (
                    <rect
                      key={`rect-${rect.id}`}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      rx="6"
                      className={`${styles.endRect} ${rect.colorClass}`}
                    />
                  ))}

                  {rectEnvelope && (
                    <rect
                      x={rectEnvelope.left}
                      y={rectEnvelope.top}
                      width={rectEnvelope.right - rectEnvelope.left}
                      height={rectEnvelope.bottom - rectEnvelope.top}
                      className={styles.rectEnvelope}
                    />
                  )}
                </g>
              </g>
            </g>
          </svg>
        </div>
      </section>

      <aside className={styles.sidePanel}>
        <div className={styles.card}>
          <span>当前逻辑</span>
          <strong>原始射线 + 矩形避碰</strong>
          <p>
            取消均分终点。所有线先沿自身角度直出，保证线序不改；只有末端矩形碰撞时，才沿原方向继续加长对应线段。
          </p>
        </div>

        <label className={styles.card}>
          <span>数量</span>
          <input
            type="range"
            min="6"
            max="100"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          />
          <strong>{count}</strong>
        </label>

        <div className={styles.grid}>
          <button className={styles.button} onClick={() => setSeed((value) => value + 1)}>
            重新随机
          </button>
        </div>

        <div className={styles.card}>
          <span>结果指标</span>
          <strong>{collisionCount}</strong>
          <p>显示当前矩形碰撞数。线条本身已取消均分与改序，只沿原始方向直出。</p>
        </div>
      </aside>
    </main>
  );
}
