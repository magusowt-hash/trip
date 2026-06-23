'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type TestPoint = {
  id: number;
  x: number;
  y: number;
};

type BoundsRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LineExtension = TestPoint & {
  lineAngle: number;
  intersectionX: number;
  intersectionY: number;
  circleAngle: number;
  endX: number;
  endY: number;
  segmentLength: number;
  totalLength: number;
  angle: number;
  pointAngle: number;
  pointRadius: number;
  isOuterBand: boolean;
  isMiddleBand: boolean;
  isInnerBand: boolean;
  halfCircleAngle: number;
  halfCircleX: number;
  halfCircleY: number;
};

type GapEntry = {
  key: string;
  fromId: number;
  toId: number;
  angleDelta: number;
  labelX: number;
  labelY: number;
};

type OuterArcEntry = GapEntry & {
  arcLength: number;
};

const STAGE_SIZE = 1120;
const MAP_SIZE = 420;
const VIEWPORT_PADDING = 96;
const MAP_CIRCLE_RADIUS = (Math.sqrt(2) * MAP_SIZE) / 2;
const EXTENDED_CIRCLE_RADIUS = MAP_CIRCLE_RADIUS * 1.5;
const INNER_THIRD_RADIUS = MAP_CIRCLE_RADIUS / 3;
const HALF_RADIUS = MAP_CIRCLE_RADIUS / 2;
const OUTER_BAND_RADIUS = (MAP_CIRCLE_RADIUS * 2) / 3;
const GREEN_GAP_MIN_DEGREES = 10;
const GREEN_TO_RED_BLUE_MIN_GAP_DEGREES = 2;
const GREEN_CLUSTER_OUTER_WINDOW_DEGREES = 20;
const GREEN_CLUSTER_SKIP_THRESHOLD = 5;
const BAND_MIN_GAP_DEGREES = 2;
const BLUE_MAX_OFFSET_DEGREES = 5;
const BLUE_MAX_DISTRIBUTION_SPAN_DEGREES = 90;
const GREEN_SEGMENT_PRIORITY_MAX_DEGREES = 90;
const BLUE_REFERENCE_OUTER_GAP_DEGREES = 10;
const GREEN_MAX_OFFSET_DEGREES = 20;
const RED_MAX_OFFSET_DEGREES = 3;
const RED_MAX_DISTRIBUTION_SPAN_DEGREES = 30;
const HIGH_COUNT_BLOCKER_GAP_DEGREES = 0.01;

function applyMinGapRelaxation(
  entries: LineExtension[],
  targetIds: number[],
  minGapDegrees: number,
  strategies: Array<{
    ranges: Array<{
      minOffsetDegrees: number;
      maxOffsetDegrees: number;
    }>;
  }>,
  blockerIds: number[] = [],
  blockerGapDegrees = 0,
  originalAngleById?: Map<number, number>,
) {
  const targetIdSet = new Set(targetIds);
  const targetEntries = entries
    .filter((entry) => targetIdSet.has(entry.id))
    .sort((a, b) => getCircleIntersectionAngle(a) - getCircleIntersectionAngle(b));

  if (targetEntries.length === 0) return entries;
  if (targetEntries.length === 1 && blockerGapDegrees <= 0) return entries;

  const minGap = degreesToRadians(minGapDegrees);
  const blockerGap = degreesToRadians(blockerGapDegrees);
  const fullTurn = Math.PI * 2;
  const blockerAngles = entries
    .filter((entry) => blockerIds.includes(entry.id))
    .map((entry) => getCircleIntersectionAngle(entry))
    .sort((a, b) => a - b);

  let largestGapIndex = 0;
  let largestGap = -Infinity;
  for (let index = 0; index < targetEntries.length; index++) {
    const current = targetEntries[index];
    const next = targetEntries[(index + 1) % targetEntries.length];
    const currentAngle = originalAngleById?.get(current.id) ?? getCircleIntersectionAngle(current);
    const nextRawAngle = originalAngleById?.get(next.id) ?? getCircleIntersectionAngle(next);
    const nextAngle = index === targetEntries.length - 1 ? nextRawAngle + fullTurn : nextRawAngle;
    const gap = nextAngle - currentAngle;
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  const linearEntries = Array.from({ length: targetEntries.length }, (_, offset) => {
    const sourceIndex = (largestGapIndex + 1 + offset) % targetEntries.length;
    const source = targetEntries[sourceIndex];
    const turns = sourceIndex <= largestGapIndex ? 1 : 0;
    return {
      ...source,
      linearAngle: (originalAngleById?.get(source.id) ?? getCircleIntersectionAngle(source)) + turns * fullTurn,
    };
  });
  const linearStart = linearEntries[0].linearAngle;
  const linearEnd = linearEntries[linearEntries.length - 1].linearAngle;
  const linearBlockerAngles = blockerAngles.length === 0
    ? []
    : blockerAngles
      .flatMap((angle) => [angle - fullTurn, angle, angle + fullTurn])
      .filter((angle) => angle >= linearStart - fullTurn && angle <= linearEnd + fullTurn)
      .sort((a, b) => a - b);

  const candidates = strategies.map((strategy) => {
    const adjustedAngles = linearEntries.map((entry) => entry.linearAngle);
    const allowedRanges = linearEntries.map((entry) => strategy.ranges
      .map((range) => ({
        min: entry.linearAngle + degreesToRadians(range.minOffsetDegrees),
        max: entry.linearAngle + degreesToRadians(range.maxOffsetDegrees),
      }))
      .sort((a, b) => a.min - b.min));

    const lowerBounds = allowedRanges.map((ranges) => ranges[0].min);
    const upperBounds = allowedRanges.map((ranges) => ranges[ranges.length - 1].max);

    function clampToAllowedRange(index: number, angle: number) {
      const ranges = allowedRanges[index];
      for (const range of ranges) {
        if (angle >= range.min && angle <= range.max) {
          return angle;
        }
      }

      let best = ranges[0].min;
      let bestDistance = Math.abs(angle - best);
      for (const range of ranges) {
        const candidate = angle < range.min ? range.min : range.max;
        const distance = Math.abs(angle - candidate);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      return best;
    }

    adjustedAngles.forEach((angle, index) => {
      adjustedAngles[index] = clampToAllowedRange(index, angle);
    });

    let changed = false;
    for (let pass = 0; pass < 240; pass++) {
      let passChanged = false;

      for (let scan = 0; scan < adjustedAngles.length + linearBlockerAngles.length; scan++) {
        const nodes = [
          ...adjustedAngles.map((angle, index) => ({
            type: 'moving' as const,
            angle,
            movingIndex: index,
          })),
          ...linearBlockerAngles.map((angle, index) => ({
            type: 'fixed' as const,
            angle,
            movingIndex: index,
          })),
        ].sort((a, b) => a.angle - b.angle);

        let localMoveHappened = false;
        for (let index = 0; index < nodes.length - 1; index++) {
          const current = nodes[index];
          const next = nodes[index + 1];
        const gap = next.angle - current.angle;
        const requiredGap = current.type === 'moving' && next.type === 'moving'
          ? minGap
          : current.type !== next.type && blockerGap > 0
            ? blockerGap
            : 0;
        const deficit = requiredGap - gap;
          if (deficit <= 1e-6) continue;

          const leftIndex = current.type === 'moving' ? current.movingIndex : -1;
          const rightIndex = next.type === 'moving' ? next.movingIndex : -1;
          const availableLeft = leftIndex >= 0
            ? Math.max(0, adjustedAngles[leftIndex] - lowerBounds[leftIndex])
            : 0;
          const availableRight = rightIndex >= 0
            ? Math.max(0, upperBounds[rightIndex] - adjustedAngles[rightIndex])
            : 0;

          let moveLeft = Math.min(deficit / 2, availableLeft);
          let moveRight = Math.min(deficit / 2, availableRight);
          let remaining = deficit - moveLeft - moveRight;

          if (remaining > 1e-6 && availableLeft > moveLeft) {
            const extraLeft = Math.min(remaining, availableLeft - moveLeft);
            moveLeft += extraLeft;
            remaining -= extraLeft;
          }

          if (remaining > 1e-6 && availableRight > moveRight) {
            const extraRight = Math.min(remaining, availableRight - moveRight);
            moveRight += extraRight;
            remaining -= extraRight;
          }

          if (moveLeft <= 1e-6 && moveRight <= 1e-6) continue;

          if (leftIndex >= 0) {
            adjustedAngles[leftIndex] = clampToAllowedRange(leftIndex, adjustedAngles[leftIndex] - moveLeft);
          }
          if (rightIndex >= 0) {
            adjustedAngles[rightIndex] = clampToAllowedRange(rightIndex, adjustedAngles[rightIndex] + moveRight);
          }
          passChanged = true;
          changed = true;
          localMoveHappened = true;
          break;
        }

        if (!localMoveHappened) {
          break;
        }
      }

      for (let index = 0; index < adjustedAngles.length; index++) {
        const sortedNodes = [
          ...adjustedAngles.map((angle, movingIndex) => ({
            type: 'moving' as const,
            angle,
            movingIndex,
          })),
          ...linearBlockerAngles.map((angle) => ({
            type: 'fixed' as const,
            angle,
            movingIndex: -1,
          })),
        ].sort((a, b) => a.angle - b.angle);

        for (const nodeIndex in sortedNodes) {
          const numericNodeIndex = Number(nodeIndex);
          const node = sortedNodes[numericNodeIndex];
          if (node.type !== 'moving') continue;

          let minAllowed = lowerBounds[node.movingIndex];
          let maxAllowed = upperBounds[node.movingIndex];

          const previousNode = numericNodeIndex > 0 ? sortedNodes[numericNodeIndex - 1] : null;
          const nextNode = numericNodeIndex < sortedNodes.length - 1 ? sortedNodes[numericNodeIndex + 1] : null;

          if (previousNode) {
          const previousGap = previousNode.type === 'moving' ? minGap : blockerGap;
          minAllowed = Math.max(minAllowed, previousNode.angle + previousGap);
          }

          if (nextNode) {
            const nextGap = nextNode.type === 'moving' ? minGap : blockerGap;
            maxAllowed = Math.min(maxAllowed, nextNode.angle - nextGap);
          }

          const clamped = Math.min(Math.max(adjustedAngles[node.movingIndex], minAllowed), maxAllowed);
          const bounded = clampToAllowedRange(
            node.movingIndex,
            Math.min(Math.max(clamped, lowerBounds[node.movingIndex]), upperBounds[node.movingIndex]),
          );
          if (Math.abs(bounded - adjustedAngles[node.movingIndex]) > 1e-6) {
            adjustedAngles[node.movingIndex] = bounded;
            passChanged = true;
            changed = true;
          }
        }
      }

      if (!passChanged) break;
    }

    const evaluatedNodes = [
      ...adjustedAngles.map((angle) => ({
        type: 'moving' as const,
        angle: normalizeAngle(angle),
      })),
      ...blockerAngles.map((angle) => ({
        type: 'fixed' as const,
        angle: normalizeAngle(angle),
      })),
    ].sort((a, b) => a.angle - b.angle);

    let minResolvedGap = Infinity;
    let minBlockerGap = Infinity;
    for (let index = 0; index < evaluatedNodes.length; index++) {
      const current = evaluatedNodes[index];
      const next = evaluatedNodes[(index + 1) % evaluatedNodes.length];
      const nextAngle = index === evaluatedNodes.length - 1 ? next.angle + fullTurn : next.angle;
      const gap = nextAngle - current.angle;

      if (current.type === 'moving' && next.type === 'moving') {
        minResolvedGap = Math.min(minResolvedGap, gap);
      }

      if (current.type !== next.type) {
        minBlockerGap = Math.min(minBlockerGap, gap);
      }
    }

    if (!Number.isFinite(minResolvedGap)) {
      minResolvedGap = Infinity;
    }
    if (!Number.isFinite(minBlockerGap)) {
      minBlockerGap = Infinity;
    }

    const totalShift = adjustedAngles.reduce((sum, angle, index) => (
      sum + Math.abs(angle - linearEntries[index].linearAngle)
    ), 0);

    return {
      adjustedAngles,
      changed,
      minResolvedGap,
      minBlockerGap,
      totalShift,
    };
  });

  const bestCandidate = candidates.reduce((best, candidate) => {
    if (!best) return candidate;

    const bestSatisfied = best.minResolvedGap >= minGap - 1e-6;
    const candidateSatisfied = candidate.minResolvedGap >= minGap - 1e-6;
    const bestBlockerSatisfied = best.minBlockerGap >= blockerGap - 1e-6;
    const candidateBlockerSatisfied = candidate.minBlockerGap >= blockerGap - 1e-6;

    if (candidateBlockerSatisfied && !bestBlockerSatisfied) return candidate;
    if (!candidateBlockerSatisfied && bestBlockerSatisfied) return best;

    if (candidateSatisfied && !bestSatisfied) return candidate;
    if (!candidateSatisfied && bestSatisfied) return best;
    if (candidate.minBlockerGap > best.minBlockerGap + 1e-6) return candidate;
    if (best.minBlockerGap > candidate.minBlockerGap + 1e-6) return best;
    if (candidate.minResolvedGap > best.minResolvedGap + 1e-6) return candidate;
    if (best.minResolvedGap > candidate.minResolvedGap + 1e-6) return best;
    if (candidate.totalShift < best.totalShift - 1e-6) return candidate;
    return best;
  }, null as null | {
    adjustedAngles: number[];
    changed: boolean;
    minResolvedGap: number;
    minBlockerGap: number;
    totalShift: number;
  });

  if (!bestCandidate?.changed) return entries;

  const angleMap = new Map<number, number>();
  linearEntries.forEach((entry, index) => {
    angleMap.set(entry.id, normalizeAngle(bestCandidate.adjustedAngles[index]));
  });

  return entries.map((entry) => {
    const nextAngle = angleMap.get(entry.id);
    if (nextAngle == null) return entry;

    const intersection = projectAngleToCircle(nextAngle, MAP_CIRCLE_RADIUS);
    const nextLineAngle = normalizeSignedAngle(
      Math.atan2(intersection.y - entry.y, intersection.x - entry.x),
    );
    const halfIntersection = projectAngleToCircle(nextAngle, HALF_RADIUS);
    const extendedIntersection = intersectRayWithCircle(entry, nextLineAngle, EXTENDED_CIRCLE_RADIUS);

    return {
      ...entry,
      lineAngle: nextLineAngle,
      angle: nextAngle,
      intersectionX: intersection.x,
      intersectionY: intersection.y,
      circleAngle: nextAngle,
      endX: extendedIntersection.x,
      endY: extendedIntersection.y,
      halfCircleAngle: nextAngle,
      halfCircleX: halfIntersection.x,
      halfCircleY: halfIntersection.y,
      totalLength: distance(entry, extendedIntersection),
    };
  });
}

function applyExtendedMinGapRelaxation(
  entries: LineExtension[],
  targetIds: number[],
  minGapDegrees: number,
  strategies: Array<{
    ranges: Array<{
      minOffsetDegrees: number;
      maxOffsetDegrees: number;
    }>;
  }>,
  blockerIds: number[] = [],
  blockerGapDegrees = 0,
  originalAngleById?: Map<number, number>,
) {
  const targetIdSet = new Set(targetIds);
  const targetEntries = entries
    .filter((entry) => targetIdSet.has(entry.id))
    .sort((a, b) => getExtendedCircleAngle(a) - getExtendedCircleAngle(b));

  if (targetEntries.length === 0) return entries;
  if (targetEntries.length === 1 && blockerGapDegrees <= 0) return entries;

  const minGap = degreesToRadians(minGapDegrees);
  const blockerGap = degreesToRadians(blockerGapDegrees);
  const fullTurn = Math.PI * 2;
  const blockerAngles = entries
    .filter((entry) => blockerIds.includes(entry.id))
    .map((entry) => getExtendedCircleAngle(entry))
    .sort((a, b) => a - b);

  let largestGapIndex = 0;
  let largestGap = -Infinity;
  for (let index = 0; index < targetEntries.length; index++) {
    const current = targetEntries[index];
    const next = targetEntries[(index + 1) % targetEntries.length];
    const currentAngle = originalAngleById?.get(current.id) ?? getExtendedCircleAngle(current);
    const nextRawAngle = originalAngleById?.get(next.id) ?? getExtendedCircleAngle(next);
    const nextAngle = index === targetEntries.length - 1 ? nextRawAngle + fullTurn : nextRawAngle;
    const gap = nextAngle - currentAngle;
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  const linearEntries = Array.from({ length: targetEntries.length }, (_, offset) => {
    const sourceIndex = (largestGapIndex + 1 + offset) % targetEntries.length;
    const source = targetEntries[sourceIndex];
    const turns = sourceIndex <= largestGapIndex ? 1 : 0;
    return {
      ...source,
      linearAngle: (originalAngleById?.get(source.id) ?? getExtendedCircleAngle(source)) + turns * fullTurn,
    };
  });
  const linearStart = linearEntries[0].linearAngle;
  const linearEnd = linearEntries[linearEntries.length - 1].linearAngle;
  const linearBlockerAngles = blockerAngles.length === 0
    ? []
    : blockerAngles
      .flatMap((angle) => [angle - fullTurn, angle, angle + fullTurn])
      .filter((angle) => angle >= linearStart - fullTurn && angle <= linearEnd + fullTurn)
      .sort((a, b) => a - b);

  const candidates = strategies.map((strategy) => {
    const adjustedAngles = linearEntries.map((entry) => entry.linearAngle);
    const allowedRanges = linearEntries.map((entry) => strategy.ranges
      .map((range) => ({
        min: entry.linearAngle + degreesToRadians(range.minOffsetDegrees),
        max: entry.linearAngle + degreesToRadians(range.maxOffsetDegrees),
      }))
      .sort((a, b) => a.min - b.min));

    const lowerBounds = allowedRanges.map((ranges) => ranges[0].min);
    const upperBounds = allowedRanges.map((ranges) => ranges[ranges.length - 1].max);

    function clampToAllowedRange(index: number, angle: number) {
      const ranges = allowedRanges[index];
      for (const range of ranges) {
        if (angle >= range.min && angle <= range.max) {
          return angle;
        }
      }

      let best = ranges[0].min;
      let bestDistance = Math.abs(angle - best);
      for (const range of ranges) {
        const candidate = angle < range.min ? range.min : range.max;
        const distance = Math.abs(angle - candidate);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      return best;
    }

    adjustedAngles.forEach((angle, index) => {
      adjustedAngles[index] = clampToAllowedRange(index, angle);
    });

    let changed = false;
    for (let pass = 0; pass < 240; pass++) {
      let passChanged = false;

      for (let scan = 0; scan < adjustedAngles.length + linearBlockerAngles.length; scan++) {
        const nodes = [
          ...adjustedAngles.map((angle, index) => ({
            type: 'moving' as const,
            angle,
            movingIndex: index,
          })),
          ...linearBlockerAngles.map((angle, index) => ({
            type: 'fixed' as const,
            angle,
            movingIndex: index,
          })),
        ].sort((a, b) => a.angle - b.angle);

        let localMoveHappened = false;
        for (let index = 0; index < nodes.length - 1; index++) {
          const current = nodes[index];
          const next = nodes[index + 1];
          const gap = next.angle - current.angle;
          const requiredGap = current.type === 'moving' && next.type === 'moving'
            ? minGap
            : current.type !== next.type && blockerGap > 0
              ? blockerGap
              : 0;
          const deficit = requiredGap - gap;
          if (deficit <= 1e-6) continue;

          const leftIndex = current.type === 'moving' ? current.movingIndex : -1;
          const rightIndex = next.type === 'moving' ? next.movingIndex : -1;
          const availableLeft = leftIndex >= 0
            ? Math.max(0, adjustedAngles[leftIndex] - lowerBounds[leftIndex])
            : 0;
          const availableRight = rightIndex >= 0
            ? Math.max(0, upperBounds[rightIndex] - adjustedAngles[rightIndex])
            : 0;

          let moveLeft = Math.min(deficit / 2, availableLeft);
          let moveRight = Math.min(deficit / 2, availableRight);
          let remaining = deficit - moveLeft - moveRight;

          if (remaining > 1e-6 && availableLeft > moveLeft) {
            const extraLeft = Math.min(remaining, availableLeft - moveLeft);
            moveLeft += extraLeft;
            remaining -= extraLeft;
          }

          if (remaining > 1e-6 && availableRight > moveRight) {
            const extraRight = Math.min(remaining, availableRight - moveRight);
            moveRight += extraRight;
            remaining -= extraRight;
          }

          if (moveLeft <= 1e-6 && moveRight <= 1e-6) continue;

          if (leftIndex >= 0) {
            adjustedAngles[leftIndex] = clampToAllowedRange(leftIndex, adjustedAngles[leftIndex] - moveLeft);
          }
          if (rightIndex >= 0) {
            adjustedAngles[rightIndex] = clampToAllowedRange(rightIndex, adjustedAngles[rightIndex] + moveRight);
          }
          passChanged = true;
          changed = true;
          localMoveHappened = true;
          break;
        }

        if (!localMoveHappened) {
          break;
        }
      }

      for (let index = 0; index < adjustedAngles.length; index++) {
        const sortedNodes = [
          ...adjustedAngles.map((angle, movingIndex) => ({
            type: 'moving' as const,
            angle,
            movingIndex,
          })),
          ...linearBlockerAngles.map((angle) => ({
            type: 'fixed' as const,
            angle,
            movingIndex: -1,
          })),
        ].sort((a, b) => a.angle - b.angle);

        for (const nodeIndex in sortedNodes) {
          const numericNodeIndex = Number(nodeIndex);
          const node = sortedNodes[numericNodeIndex];
          if (node.type !== 'moving') continue;

          let minAllowed = lowerBounds[node.movingIndex];
          let maxAllowed = upperBounds[node.movingIndex];

          const previousNode = numericNodeIndex > 0 ? sortedNodes[numericNodeIndex - 1] : null;
          const nextNode = numericNodeIndex < sortedNodes.length - 1 ? sortedNodes[numericNodeIndex + 1] : null;

          if (previousNode) {
            const previousGap = previousNode.type === 'moving' ? minGap : blockerGap;
            minAllowed = Math.max(minAllowed, previousNode.angle + previousGap);
          }

          if (nextNode) {
            const nextGap = nextNode.type === 'moving' ? minGap : blockerGap;
            maxAllowed = Math.min(maxAllowed, nextNode.angle - nextGap);
          }

          const clamped = Math.min(Math.max(adjustedAngles[node.movingIndex], minAllowed), maxAllowed);
          const bounded = clampToAllowedRange(
            node.movingIndex,
            Math.min(Math.max(clamped, lowerBounds[node.movingIndex]), upperBounds[node.movingIndex]),
          );
          if (Math.abs(bounded - adjustedAngles[node.movingIndex]) > 1e-6) {
            adjustedAngles[node.movingIndex] = bounded;
            passChanged = true;
            changed = true;
          }
        }
      }

      if (!passChanged) break;
    }

    const evaluatedNodes = [
      ...adjustedAngles.map((angle) => ({
        type: 'moving' as const,
        angle: normalizeAngle(angle),
      })),
      ...blockerAngles.map((angle) => ({
        type: 'fixed' as const,
        angle: normalizeAngle(angle),
      })),
    ].sort((a, b) => a.angle - b.angle);

    let minResolvedGap = Infinity;
    let minBlockerGap = Infinity;
    for (let index = 0; index < evaluatedNodes.length; index++) {
      const current = evaluatedNodes[index];
      const next = evaluatedNodes[(index + 1) % evaluatedNodes.length];
      const nextAngle = index === evaluatedNodes.length - 1 ? next.angle + fullTurn : next.angle;
      const gap = nextAngle - current.angle;

      if (current.type === 'moving' && next.type === 'moving') {
        minResolvedGap = Math.min(minResolvedGap, gap);
      }

      if (current.type !== next.type) {
        minBlockerGap = Math.min(minBlockerGap, gap);
      }
    }

    if (!Number.isFinite(minResolvedGap)) {
      minResolvedGap = Infinity;
    }
    if (!Number.isFinite(minBlockerGap)) {
      minBlockerGap = Infinity;
    }

    const totalShift = adjustedAngles.reduce((sum, angle, index) => (
      sum + Math.abs(angle - linearEntries[index].linearAngle)
    ), 0);

    return {
      adjustedAngles,
      changed,
      minResolvedGap,
      minBlockerGap,
      totalShift,
    };
  });

  const bestCandidate = candidates.reduce((best, candidate) => {
    if (!best) return candidate;

    const bestSatisfied = best.minResolvedGap >= minGap - 1e-6;
    const candidateSatisfied = candidate.minResolvedGap >= minGap - 1e-6;
    const bestBlockerSatisfied = best.minBlockerGap >= blockerGap - 1e-6;
    const candidateBlockerSatisfied = candidate.minBlockerGap >= blockerGap - 1e-6;

    if (candidateBlockerSatisfied && !bestBlockerSatisfied) return candidate;
    if (!candidateBlockerSatisfied && bestBlockerSatisfied) return best;

    if (candidateSatisfied && !bestSatisfied) return candidate;
    if (!candidateSatisfied && bestSatisfied) return best;
    if (candidate.minBlockerGap > best.minBlockerGap + 1e-6) return candidate;
    if (best.minBlockerGap > candidate.minBlockerGap + 1e-6) return best;
    if (candidate.minResolvedGap > best.minResolvedGap + 1e-6) return candidate;
    if (best.minResolvedGap > candidate.minResolvedGap + 1e-6) return best;
    if (candidate.totalShift < best.totalShift - 1e-6) return candidate;
    return best;
  }, null as null | {
    adjustedAngles: number[];
    changed: boolean;
    minResolvedGap: number;
    minBlockerGap: number;
    totalShift: number;
  });

  if (!bestCandidate?.changed) return entries;

  const angleMap = new Map<number, number>();
  linearEntries.forEach((entry, index) => {
    angleMap.set(entry.id, normalizeAngle(bestCandidate.adjustedAngles[index]));
  });

  return updateEntriesByExtendedAngleMap(entries, angleMap);
}

function getShortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function resolveGreenDirectionalPriority(
  originalEntries: LineExtension[],
  adjustedEntries: LineExtension[],
) {
  type GreenCandidate = {
    angle: number;
    scorePrimary: number;
    scoreSecondary: number;
    shift: number;
  };

  const minGap = degreesToRadians(GREEN_TO_RED_BLUE_MIN_GAP_DEGREES);
  const maxOffset = degreesToRadians(GREEN_MAX_OFFSET_DEGREES);
  const fullTurn = Math.PI * 2;
  const originalAngleById = new Map(
    originalEntries.map((entry) => [entry.id, getCircleIntersectionAngle(entry)]),
  );

  let nextEntries = adjustedEntries;

  const greenIds = adjustedEntries.filter(isGreenEntry).map((entry) => entry.id);
  greenIds.forEach((greenId) => {
    const currentEntries = [...nextEntries]
      .map((entry) => ({
        ...entry,
        circleAngle: getCircleIntersectionAngle(entry),
      }))
      .sort((a, b) => a.circleAngle - b.circleAngle);

    const currentIndex = currentEntries.findIndex((entry) => entry.id === greenId);
    if (currentIndex < 0) return;

    const current = currentEntries[currentIndex];
    const left = currentEntries[(currentIndex - 1 + currentEntries.length) % currentEntries.length];
    const right = currentEntries[(currentIndex + 1) % currentEntries.length];
    const leftGap = normalizeAngle(current.circleAngle - left.circleAngle);
    const rightGap = normalizeAngle(right.circleAngle - current.circleAngle);

    const leftIsBlocker = isRedOrBlueEntry(left);
    const rightIsBlocker = isRedOrBlueEntry(right);
    const hasConflict = (leftIsBlocker && leftGap < minGap - 1e-6)
      || (rightIsBlocker && rightGap < minGap - 1e-6);
    if (!hasConflict) return;

    const originalAngle = originalAngleById.get(greenId);
    if (originalAngle == null) return;

    const candidateAngles = new Set<number>();
    if (leftIsBlocker) {
      candidateAngles.add(normalizeAngle(left.circleAngle + minGap));
      candidateAngles.add(normalizeAngle(left.circleAngle - minGap));
    }
    if (rightIsBlocker) {
      candidateAngles.add(normalizeAngle(right.circleAngle - minGap));
      candidateAngles.add(normalizeAngle(right.circleAngle + minGap));
    }

    const candidateResults: GreenCandidate[] = [];

    candidateAngles.forEach((candidateAngle) => {
      const shift = Math.abs(getShortestAngleDelta(originalAngle, candidateAngle));
      if (shift > maxOffset + 1e-6) return;

      const evaluated = currentEntries
        .map((entry) => ({
          ...entry,
          circleAngle: entry.id === greenId ? candidateAngle : entry.circleAngle,
        }))
        .sort((a, b) => a.circleAngle - b.circleAngle);

      const candidateIndex = evaluated.findIndex((entry) => entry.id === greenId);
      if (candidateIndex < 0) return;

      const candidateLeft = evaluated[(candidateIndex - 1 + evaluated.length) % evaluated.length];
      const candidateRight = evaluated[(candidateIndex + 1) % evaluated.length];
      const candidateLeftGap = normalizeAngle(
        evaluated[candidateIndex].circleAngle - candidateLeft.circleAngle,
      );
      const candidateRightGap = normalizeAngle(
        candidateRight.circleAngle - evaluated[candidateIndex].circleAngle,
      );

      const scorePrimary = Math.max(candidateLeftGap, candidateRightGap);
      const scoreSecondary = Math.min(candidateLeftGap, candidateRightGap);
      candidateResults.push({ angle: candidateAngle, scorePrimary, scoreSecondary, shift });
    });

    const bestCandidate = candidateResults.reduce<GreenCandidate | null>((best, candidate) => {
      if (!best) return candidate;
      if (candidate.scorePrimary > best.scorePrimary + 1e-6) return candidate;
      if (best.scorePrimary > candidate.scorePrimary + 1e-6) return best;
      if (candidate.scoreSecondary > best.scoreSecondary + 1e-6) return candidate;
      if (best.scoreSecondary > candidate.scoreSecondary + 1e-6) return best;
      if (candidate.shift < best.shift - 1e-6) return candidate;
      return best;
    }, null);

    if (!bestCandidate) return;
    const resolvedAngle = bestCandidate.angle;
    nextEntries = updateEntriesByAngleMap(nextEntries, new Map([[greenId, resolvedAngle]]));
  });

  return nextEntries;
}

function resolveThirdLayerDirectionalPriority(
  entries: LineExtension[],
  originalAngleById?: Map<number, number>,
) {
  type DirectionalCandidate = {
    angle: number;
    scorePrimary: number;
    scoreSecondary: number;
    shift: number;
  };

  const minGap = degreesToRadians(BAND_MIN_GAP_DEGREES);
  const candidateIds = entries
    .filter((entry) => isBlueEntry(entry) || isRedEntry(entry))
    .map((entry) => entry.id);

  let nextEntries = entries;

  candidateIds.forEach((candidateId) => {
    const currentEntries = [...nextEntries]
      .map((entry) => ({
        ...entry,
        circleAngle: getCircleIntersectionAngle(entry),
      }))
      .sort((a, b) => a.circleAngle - b.circleAngle);

    const currentIndex = currentEntries.findIndex((entry) => entry.id === candidateId);
    if (currentIndex < 0) return;

    const current = currentEntries[currentIndex];
    const currentIsBlue = isBlueEntry(current);
    const maxOffset = degreesToRadians(currentIsBlue ? BLUE_MAX_OFFSET_DEGREES : RED_MAX_OFFSET_DEGREES);
    const left = currentEntries[(currentIndex - 1 + currentEntries.length) % currentEntries.length];
    const right = currentEntries[(currentIndex + 1) % currentEntries.length];
    const leftGap = normalizeAngle(current.circleAngle - left.circleAngle);
    const rightGap = normalizeAngle(right.circleAngle - current.circleAngle);

    const leftBlocks = currentIsBlue
      ? isGreenEntry(left)
      : isGreenEntry(left) || isBlueEntry(left);
    const rightBlocks = currentIsBlue
      ? isGreenEntry(right)
      : isGreenEntry(right) || isBlueEntry(right);
    const hasConflict = (leftBlocks && leftGap < minGap - 1e-6)
      || (rightBlocks && rightGap < minGap - 1e-6);
    if (!hasConflict) return;

    const candidateAngles = new Set<number>();
    if (leftBlocks) {
      candidateAngles.add(normalizeAngle(left.circleAngle + minGap));
      candidateAngles.add(normalizeAngle(left.circleAngle - minGap));
    }
    if (rightBlocks) {
      candidateAngles.add(normalizeAngle(right.circleAngle - minGap));
      candidateAngles.add(normalizeAngle(right.circleAngle + minGap));
    }

    const candidateResults: DirectionalCandidate[] = [];
    candidateAngles.forEach((candidateAngle) => {
      const baseAngle = originalAngleById?.get(candidateId) ?? current.circleAngle;
      const shift = Math.abs(getShortestAngleDelta(baseAngle, candidateAngle));
      if (shift > maxOffset + 1e-6) return;

      const evaluated = currentEntries
        .map((entry) => ({
          ...entry,
          circleAngle: entry.id === candidateId ? candidateAngle : entry.circleAngle,
        }))
        .sort((a, b) => a.circleAngle - b.circleAngle);

      const candidateIndex = evaluated.findIndex((entry) => entry.id === candidateId);
      if (candidateIndex < 0) return;

      const candidateLeft = evaluated[(candidateIndex - 1 + evaluated.length) % evaluated.length];
      const candidateRight = evaluated[(candidateIndex + 1) % evaluated.length];
      const candidateLeftGap = normalizeAngle(
        evaluated[candidateIndex].circleAngle - candidateLeft.circleAngle,
      );
      const candidateRightGap = normalizeAngle(
        candidateRight.circleAngle - evaluated[candidateIndex].circleAngle,
      );

      const scorePrimary = Math.max(candidateLeftGap, candidateRightGap);
      const scoreSecondary = Math.min(candidateLeftGap, candidateRightGap);
      candidateResults.push({ angle: candidateAngle, scorePrimary, scoreSecondary, shift });
    });

    const bestCandidate = candidateResults.reduce<DirectionalCandidate | null>((best, candidate) => {
      if (!best) return candidate;
      if (candidate.scorePrimary > best.scorePrimary + 1e-6) return candidate;
      if (best.scorePrimary > candidate.scorePrimary + 1e-6) return best;
      if (candidate.scoreSecondary > best.scoreSecondary + 1e-6) return candidate;
      if (best.scoreSecondary > candidate.scoreSecondary + 1e-6) return best;
      if (candidate.shift < best.shift - 1e-6) return candidate;
      return best;
    }, null);

    if (!bestCandidate) return;
    nextEntries = updateEntriesByAngleMap(nextEntries, new Map([[candidateId, bestCandidate.angle]]));
  });

  return nextEntries;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function buildRandomPoints(count: number) {
  const points: TestPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      id: i + 1,
      x: roundToTwo(Math.random() * MAP_SIZE - MAP_SIZE / 2),
      y: roundToTwo(Math.random() * MAP_SIZE - MAP_SIZE / 2),
    });
  }
  return points;
}

function buildBounds(points: TestPoint[]): BoundsRect {
  if (points.length === 0) {
    return {
      left: -MAP_SIZE / 2,
      right: MAP_SIZE / 2,
      top: -MAP_SIZE / 2,
      bottom: MAP_SIZE / 2,
    };
  }

  return points.reduce(
    (acc, point) => ({
      left: Math.min(acc.left, point.x),
      right: Math.max(acc.right, point.x),
      top: Math.min(acc.top, point.y),
      bottom: Math.max(acc.bottom, point.y),
    }),
    {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    },
  );
}

function buildViewport(bounds: BoundsRect) {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(
    (STAGE_SIZE - VIEWPORT_PADDING * 2) / width,
    (STAGE_SIZE - VIEWPORT_PADDING * 2) / height,
  );

  return {
    scale: Math.min(1.6, scale),
    centerX: (bounds.left + bounds.right) / 2,
    centerY: (bounds.top + bounds.bottom) / 2,
  };
}

function buildViewportFromLineExtensions(entries: LineExtension[]) {
  if (entries.length === 0) {
    return buildViewport({
      left: -MAP_SIZE / 2,
      right: MAP_SIZE / 2,
      top: -MAP_SIZE / 2,
      bottom: MAP_SIZE / 2,
    });
  }

  const bounds = entries.reduce(
    (acc, entry) => ({
      left: Math.min(
        acc.left,
        entry.x,
        entry.intersectionX,
        entry.endX,
        -MAP_SIZE / 2,
      ),
      right: Math.max(
        acc.right,
        entry.x,
        entry.intersectionX,
        entry.endX,
        MAP_SIZE / 2,
      ),
      top: Math.min(
        acc.top,
        entry.y,
        entry.intersectionY,
        entry.endY,
        -MAP_SIZE / 2,
      ),
      bottom: Math.max(
        acc.bottom,
        entry.y,
        entry.intersectionY,
        entry.endY,
        MAP_SIZE / 2,
      ),
    }),
    {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    },
  );

  const padding = 12;
  return buildViewport({
    left: bounds.left - padding,
    right: bounds.right + padding,
    top: bounds.top - padding,
    bottom: bounds.bottom + padding,
  });
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function normalizeSignedAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle + Math.PI) % full + full) % full - Math.PI;
}

function getCircleIntersectionAngle(
  entry: Pick<LineExtension, 'intersectionX' | 'intersectionY'> & Partial<Pick<LineExtension, 'circleAngle'>>,
) {
  return normalizeAngle(Math.atan2(entry.intersectionY, entry.intersectionX));
}

function projectAngleToCircle(angle: number, radius: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function buildGapEntriesFromCircleAngles(
  entries: Array<Pick<LineExtension, 'id' | 'intersectionX' | 'intersectionY'>>,
  labelRadius: number,
  keyPrefix = '',
) {
  if (entries.length < 2) return [] as GapEntry[];

  const sorted = [...entries]
    .map((entry) => ({
      ...entry,
      circleAngle: getCircleIntersectionAngle(entry),
    }))
    .sort((a, b) => a.circleAngle - b.circleAngle);

  return sorted.map((current, index) => {
    const next = sorted[(index + 1) % sorted.length];
    const nextAngle = index === sorted.length - 1 ? next.circleAngle + Math.PI * 2 : next.circleAngle;
    const angleDelta = Math.max(0, nextAngle - current.circleAngle);
    const midAngle = current.circleAngle + angleDelta / 2;
    return {
      key: `${keyPrefix}${current.id}-${next.id}`,
      fromId: current.id,
      toId: next.id,
      angleDelta,
      labelX: Math.cos(midAngle) * labelRadius,
      labelY: Math.sin(midAngle) * labelRadius,
    };
  });
}

function buildExtendedCircleArcEntries(
  entries: Array<Pick<LineExtension, 'id' | 'endX' | 'endY'>>,
  labelRadius: number,
  keyPrefix = '',
) {
  if (entries.length < 2) return [] as OuterArcEntry[];

  const sorted = [...entries]
    .map((entry) => ({
      ...entry,
      circleAngle: getExtendedCircleAngle(entry),
    }))
    .sort((a, b) => a.circleAngle - b.circleAngle);

  return sorted.map((current, index) => {
    const next = sorted[(index + 1) % sorted.length];
    const nextAngle = index === sorted.length - 1 ? next.circleAngle + Math.PI * 2 : next.circleAngle;
    const angleDelta = Math.max(0, nextAngle - current.circleAngle);
    const midAngle = current.circleAngle + angleDelta / 2;
    return {
      key: `${keyPrefix}${current.id}-${next.id}`,
      fromId: current.id,
      toId: next.id,
      angleDelta,
      arcLength: EXTENDED_CIRCLE_RADIUS * angleDelta,
      labelX: Math.cos(midAngle) * labelRadius,
      labelY: Math.sin(midAngle) * labelRadius,
    };
  });
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function formatAngle(value: number) {
  return `${radiansToDegrees(value).toFixed(2)}°`;
}

function intersectRayWithCircle(
  origin: { x: number; y: number },
  angle: number,
  radius: number,
) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const a = dx * dx + dy * dy;
  if (a < 1e-8) {
    return { x: origin.x, y: origin.y };
  }

  const b = 2 * (origin.x * dx + origin.y * dy);
  const c = origin.x * origin.x + origin.y * origin.y - radius * radius;
  const discriminant = Math.max(0, b * b - 4 * a * c);
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b + sqrtDiscriminant) / (2 * a);
  const t2 = (-b - sqrtDiscriminant) / (2 * a);
  const t = Math.max(t1, t2);

  return {
    x: origin.x + dx * t,
    y: origin.y + dy * t,
  };
}

function updateEntriesByAngleMap(entries: LineExtension[], angleMap: Map<number, number>) {
  return entries.map((entry) => {
    const nextAngle = angleMap.get(entry.id);
    if (nextAngle == null) return entry;

    const intersection = projectAngleToCircle(nextAngle, MAP_CIRCLE_RADIUS);
    const nextLineAngle = normalizeSignedAngle(
      Math.atan2(intersection.y - entry.y, intersection.x - entry.x),
    );
    const halfIntersection = projectAngleToCircle(nextAngle, HALF_RADIUS);
    const extendedIntersection = intersectRayWithCircle(entry, nextLineAngle, EXTENDED_CIRCLE_RADIUS);

    return {
      ...entry,
      lineAngle: nextLineAngle,
      angle: nextAngle,
      intersectionX: intersection.x,
      intersectionY: intersection.y,
      circleAngle: nextAngle,
      endX: extendedIntersection.x,
      endY: extendedIntersection.y,
      halfCircleAngle: nextAngle,
      halfCircleX: halfIntersection.x,
      halfCircleY: halfIntersection.y,
      totalLength: distance(entry, extendedIntersection),
    };
  });
}

function updateEntriesByExtendedAngleMap(entries: LineExtension[], angleMap: Map<number, number>) {
  return entries.map((entry) => {
    const nextExtendedAngle = angleMap.get(entry.id);
    if (nextExtendedAngle == null) return entry;

    const extendedTarget = projectAngleToCircle(nextExtendedAngle, EXTENDED_CIRCLE_RADIUS);
    const nextLineAngle = normalizeSignedAngle(
      Math.atan2(extendedTarget.y - entry.y, extendedTarget.x - entry.x),
    );
    const intersection = intersectRayWithCircle(entry, nextLineAngle, MAP_CIRCLE_RADIUS);
    const halfIntersection = intersectRayWithCircle(entry, nextLineAngle, HALF_RADIUS);

    return {
      ...entry,
      lineAngle: nextLineAngle,
      angle: normalizeAngle(Math.atan2(intersection.y, intersection.x)),
      intersectionX: intersection.x,
      intersectionY: intersection.y,
      circleAngle: normalizeAngle(Math.atan2(intersection.y, intersection.x)),
      endX: extendedTarget.x,
      endY: extendedTarget.y,
      halfCircleAngle: normalizeAngle(Math.atan2(halfIntersection.y, halfIntersection.x)),
      halfCircleX: halfIntersection.x,
      halfCircleY: halfIntersection.y,
      totalLength: distance(entry, extendedTarget),
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getEntriesInsideAnchorSegment(
  entries: LineExtension[],
  leftAngle: number,
  rightAngle: number,
  ids: Set<number>,
) {
  return entries
    .filter((entry) => ids.has(entry.id))
    .map((entry) => {
      let angle = getCircleIntersectionAngle(entry);
      if (rightAngle > Math.PI * 2 && angle < leftAngle) {
        angle += Math.PI * 2;
      }
      return { entry, angle };
    })
    .filter(({ angle }) => angle > leftAngle && angle < rightAngle)
    .sort((a, b) => a.angle - b.angle)
    .map(({ entry }) => entry.id);
}

type BlueAnchorSegment = {
  leftGreenId: number;
  rightGreenId: number;
};

type AngleAnchor = {
  id: number;
  angle: number;
};

function getEntryIds(entries: LineExtension[], predicate: (entry: LineExtension) => boolean) {
  return entries.filter(predicate).map((entry) => entry.id);
}

function buildAngleMap(
  entries: LineExtension[],
  predicate: (entry: LineExtension) => boolean,
) {
  return new Map(
    entries
      .filter(predicate)
      .map((entry) => [entry.id, getCircleIntersectionAngle(entry)]),
  );
}

function buildExtendedAngleMap(
  entries: LineExtension[],
  predicate: (entry: LineExtension) => boolean,
) {
  return new Map(
    entries
      .filter(predicate)
      .map((entry) => [entry.id, getExtendedCircleAngle(entry)]),
  );
}

function buildSortedAnchors(
  entries: LineExtension[],
  predicate: (entry: LineExtension) => boolean,
) {
  return entries
    .filter(predicate)
    .map((entry) => ({ id: entry.id, angle: getCircleIntersectionAngle(entry) }))
    .sort((a, b) => a.angle - b.angle);
}

function getWrappedRightAngle(anchors: AngleAnchor[], index: number) {
  const rightAnchor = anchors[(index + 1) % anchors.length];
  const fullTurn = Math.PI * 2;
  return index === anchors.length - 1 ? rightAnchor.angle + fullTurn : rightAnchor.angle;
}

function buildBlueAnchorSegmentMap(entries: LineExtension[]) {
  const fullTurn = Math.PI * 2;
  const greenEntries = buildSortedAnchors(entries, isGreenEntry);

  const result = new Map<number, BlueAnchorSegment>();
  if (greenEntries.length < 2) return result;

  const blueIds = new Set(getEntryIds(entries, isBlueEntry));
  greenEntries.forEach((leftGreen, index) => {
    const rightGreen = greenEntries[(index + 1) % greenEntries.length];
    const rightAngle = index === greenEntries.length - 1 ? rightGreen.angle + fullTurn : rightGreen.angle;
    const blueIdsInSegment = getEntriesInsideAnchorSegment(entries, leftGreen.angle, rightAngle, blueIds);
    blueIdsInSegment.forEach((blueId) => {
      result.set(blueId, {
        leftGreenId: leftGreen.id,
        rightGreenId: rightGreen.id,
      });
    });
  });

  return result;
}

function buildLinearAngleEntries(
  entries: LineExtension[],
  targetIds: number[],
  originalAngleById?: Map<number, number>,
) {
  const fullTurn = Math.PI * 2;
  const targetIdSet = new Set(targetIds);
  const targetEntries = entries
    .filter((entry) => targetIdSet.has(entry.id))
    .sort((a, b) => getCircleIntersectionAngle(a) - getCircleIntersectionAngle(b));

  if (targetEntries.length === 0) return [];

  let largestGapIndex = 0;
  let largestGap = -Infinity;
  for (let index = 0; index < targetEntries.length; index++) {
    const current = targetEntries[index];
    const next = targetEntries[(index + 1) % targetEntries.length];
    const currentAngle = originalAngleById?.get(current.id) ?? getCircleIntersectionAngle(current);
    const nextRawAngle = originalAngleById?.get(next.id) ?? getCircleIntersectionAngle(next);
    const nextAngle = index === targetEntries.length - 1 ? nextRawAngle + fullTurn : nextRawAngle;
    const gap = nextAngle - currentAngle;
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  return Array.from({ length: targetEntries.length }, (_, offset) => {
    const sourceIndex = (largestGapIndex + 1 + offset) % targetEntries.length;
    const source = targetEntries[sourceIndex];
    const turns = sourceIndex <= largestGapIndex ? 1 : 0;
    return {
      entry: source,
      linearAngle: (originalAngleById?.get(source.id) ?? getCircleIntersectionAngle(source)) + turns * fullTurn,
    };
  });
}

function buildExtendedLinearAngleEntries(
  entries: LineExtension[],
  targetIds: number[],
  originalAngleById?: Map<number, number>,
) {
  const fullTurn = Math.PI * 2;
  const targetIdSet = new Set(targetIds);
  const targetEntries = entries
    .filter((entry) => targetIdSet.has(entry.id))
    .sort((a, b) => getExtendedCircleAngle(a) - getExtendedCircleAngle(b));

  if (targetEntries.length === 0) return [];

  let largestGapIndex = 0;
  let largestGap = -Infinity;
  for (let index = 0; index < targetEntries.length; index++) {
    const current = targetEntries[index];
    const next = targetEntries[(index + 1) % targetEntries.length];
    const currentAngle = originalAngleById?.get(current.id) ?? getExtendedCircleAngle(current);
    const nextRawAngle = originalAngleById?.get(next.id) ?? getExtendedCircleAngle(next);
    const nextAngle = index === targetEntries.length - 1 ? nextRawAngle + fullTurn : nextRawAngle;
    const gap = nextAngle - currentAngle;
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  return Array.from({ length: targetEntries.length }, (_, offset) => {
    const sourceIndex = (largestGapIndex + 1 + offset) % targetEntries.length;
    const source = targetEntries[sourceIndex];
    const turns = sourceIndex <= largestGapIndex ? 1 : 0;
    return {
      entry: source,
      linearAngle: (originalAngleById?.get(source.id) ?? getExtendedCircleAngle(source)) + turns * fullTurn,
    };
  });
}

function getExtendedCircleAngle(entry: Pick<LineExtension, 'endX' | 'endY'>) {
  return normalizeAngle(Math.atan2(entry.endY, entry.endX));
}

function getHighCountMaxOffsetArcLength(movableCount: number) {
  if (movableCount <= 0) return 0;
  const circumference = Math.PI * 2 * EXTENDED_CIRCLE_RADIUS;
  const averageArcLength = circumference / movableCount;
  return averageArcLength * 0.9;
}

function buildExtendedGapSequence(entries: Array<{ id: number; angle: number }>) {
  if (entries.length < 2) return [] as Array<{ leftId: number; rightId: number; gapAngle: number }>;

  return entries.map((current, index) => {
    const next = entries[(index + 1) % entries.length];
    const nextAngle = index === entries.length - 1 ? next.angle + Math.PI * 2 : next.angle;
    return {
      leftId: current.id,
      rightId: next.id,
      gapAngle: nextAngle - current.angle,
    };
  });
}

function buildGapClusters(gapFlags: boolean[]) {
  if (gapFlags.length === 0) return [] as number[][];

  const firstTrueIndex = gapFlags.findIndex(Boolean);
  if (firstTrueIndex < 0) return [] as number[][];

  const rotatedFlags = [
    ...gapFlags.slice(firstTrueIndex),
    ...gapFlags.slice(0, firstTrueIndex),
  ];
  const rotatedIndices = [
    ...gapFlags.map((_, index) => index).slice(firstTrueIndex),
    ...gapFlags.map((_, index) => index).slice(0, firstTrueIndex),
  ];

  const clusters: number[][] = [];
  let currentCluster: number[] = [];

  rotatedFlags.forEach((flag, index) => {
    if (flag) {
      currentCluster.push(rotatedIndices[index]);
      return;
    }

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
      currentCluster = [];
    }
  });

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
}

function getInnerBandAttractionWeights(innerCount: number) {
  const density = clamp(innerCount / 10, 0, 1);
  return {
    gapWeight: 0.82 + density * 0.14,
    distanceWeight: 0.18 - density * 0.14,
    gapExponent: 1.35 + density * 0.55,
  };
}

function buildClusterNodeIds(
  cluster: number[],
  gapSequence: Array<{ leftId: number; rightId: number; gapAngle: number }>,
) {
  if (cluster.length === 0) return [] as number[];

  const nodeIds = [gapSequence[cluster[0]].leftId];
  cluster.forEach((gapIndex) => {
    nodeIds.push(gapSequence[gapIndex].rightId);
  });
  return nodeIds;
}

function enforceExtendedCircleOrder(
  entries: LineExtension[],
  targetIds: number[],
  originalAngleById?: Map<number, number>,
) {
  const linearEntries = buildExtendedLinearAngleEntries(entries, targetIds, originalAngleById);
  if (linearEntries.length < 2) {
    return entries;
  }

  const fullTurn = Math.PI * 2;
  const extendedAngles: number[] = [];
  linearEntries.forEach((item, index) => {
    const rawAngle = getExtendedCircleAngle(item.entry);
    const previousAngle = index > 0 ? extendedAngles[index - 1] : null;
    let normalizedAngle = rawAngle;
    if (previousAngle != null && normalizedAngle < previousAngle) {
      normalizedAngle += fullTurn;
    }
    extendedAngles.push(normalizedAngle);
  });

  let needsCorrection = false;
  for (let index = 1; index < extendedAngles.length; index++) {
    if (extendedAngles[index] <= extendedAngles[index - 1]) {
      needsCorrection = true;
      break;
    }
  }

  if (!needsCorrection) {
    return entries;
  }

  const correctedAngleMap = new Map<number, number>();
  linearEntries.forEach((item) => {
    correctedAngleMap.set(
      item.entry.id,
      normalizeAngle(item.linearAngle),
    );
  });

  return updateEntriesByExtendedAngleMap(entries, correctedAngleMap);
}

function enforceMinimumExtendedArcGap(
  entries: LineExtension[],
  targetIds: number[],
  minArcLength: number,
  originalAngleById?: Map<number, number>,
) {
  const linearEntries = buildExtendedLinearAngleEntries(entries, targetIds, originalAngleById);
  if (linearEntries.length < 2) {
    return entries;
  }

  const minGapAngle = minArcLength / EXTENDED_CIRCLE_RADIUS;
  const adjustedAngles = linearEntries.map((item) => item.linearAngle);
  let changed = false;

  for (let pass = 0; pass < 24; pass++) {
    let passChanged = false;

    for (let index = 0; index < adjustedAngles.length - 1; index++) {
      const gap = adjustedAngles[index + 1] - adjustedAngles[index];
      if (gap >= minGapAngle - 1e-6) {
        continue;
      }

      const deficit = minGapAngle - gap;
      const leftBase = linearEntries[index].linearAngle;
      const rightBase = linearEntries[index + 1].linearAngle;
      const leftMin = leftBase - Math.PI * 2;
      const leftMax = leftBase + Math.PI * 2;
      const rightMin = rightBase - Math.PI * 2;
      const rightMax = rightBase + Math.PI * 2;
      const leftAvailable = Math.max(0, adjustedAngles[index] - leftMin);
      const rightAvailable = Math.max(0, rightMax - adjustedAngles[index + 1]);

      let moveLeft = Math.min(deficit / 2, leftAvailable);
      let moveRight = Math.min(deficit / 2, rightAvailable);
      let remaining = deficit - moveLeft - moveRight;

      if (remaining > 1e-6 && leftAvailable > moveLeft) {
        const extraLeft = Math.min(remaining, leftAvailable - moveLeft);
        moveLeft += extraLeft;
        remaining -= extraLeft;
      }

      if (remaining > 1e-6 && rightAvailable > moveRight) {
        const extraRight = Math.min(remaining, rightAvailable - moveRight);
        moveRight += extraRight;
        remaining -= extraRight;
      }

      if (moveLeft <= 1e-6 && moveRight <= 1e-6) {
        continue;
      }

      adjustedAngles[index] -= moveLeft;
      adjustedAngles[index + 1] += moveRight;
      passChanged = true;
      changed = true;
    }

    if (!passChanged) {
      break;
    }
  }

  if (!changed) {
    return entries;
  }

  const angleMap = new Map<number, number>();
  linearEntries.forEach((item, index) => {
    angleMap.set(item.entry.id, normalizeAngle(adjustedAngles[index]));
  });

  return updateEntriesByExtendedAngleMap(entries, angleMap);
}

function enforceGlobalMinimumExtendedArcGap(
  entries: LineExtension[],
  minArcLength: number,
  targetIds?: number[],
) {
  const targetIdSet = targetIds ? new Set(targetIds) : null;
  const targetEntries = entries
    .filter((entry) => (targetIdSet ? targetIdSet.has(entry.id) : true))
    .map((entry) => ({
      entry,
      angle: getExtendedCircleAngle(entry),
    }))
    .sort((a, b) => a.angle - b.angle);

  if (targetEntries.length < 2) {
    return entries;
  }

  const fullTurn = Math.PI * 2;
  const minGapAngle = minArcLength / EXTENDED_CIRCLE_RADIUS;
  const adjustedAngles = targetEntries.map((item) => item.angle);
  let changed = false;

  for (let pass = 0; pass < 32; pass++) {
    let passChanged = false;

    for (let index = 0; index < adjustedAngles.length; index++) {
      const nextIndex = (index + 1) % adjustedAngles.length;
      const nextAngle = index === adjustedAngles.length - 1
        ? adjustedAngles[nextIndex] + fullTurn
        : adjustedAngles[nextIndex];
      const gap = nextAngle - adjustedAngles[index];
      if (gap >= minGapAngle - 1e-6) {
        continue;
      }

      const deficit = minGapAngle - gap;
      adjustedAngles[index] -= deficit / 2;
      if (index === adjustedAngles.length - 1) {
        adjustedAngles[nextIndex] += deficit / 2;
      } else {
        adjustedAngles[nextIndex] += deficit / 2;
      }
      passChanged = true;
      changed = true;
    }

    if (!passChanged) {
      break;
    }
  }

  if (!changed) {
    return entries;
  }

  const angleMap = new Map<number, number>();
  targetEntries.forEach((item, index) => {
    angleMap.set(item.entry.id, normalizeAngle(adjustedAngles[index]));
  });

  return updateEntriesByExtendedAngleMap(entries, angleMap);
}

function applyExtendedArcOffsetDistribution(
  entries: LineExtension[],
) {
  const movableEntries = entries.filter((entry) => !entry.isInnerBand);
  if (movableEntries.length < 2) {
    return entries;
  }

  const movableIds = movableEntries.map((entry) => entry.id);
  const originalAngleById = buildExtendedAngleMap(entries, (entry) => !entry.isInnerBand);
  const targetArcLength = (Math.PI * 2 * EXTENDED_CIRCLE_RADIUS) / movableEntries.length;
  const minArcLength = targetArcLength / 2;
  const maxOffsetArcLength = getHighCountMaxOffsetArcLength(movableEntries.length);
  const maxOffsetAngle = maxOffsetArcLength / EXTENDED_CIRCLE_RADIUS;
  const densityFactor = clamp(80 / movableEntries.length, 0.45, 1);
  const toleranceArc = targetArcLength * 0.04 * densityFactor;
  const minToleranceArc = minArcLength * 0.02;
  const correctionGain = 0.55 / densityFactor;
  let nextEntries = entries;

  for (let pass = 0; pass < 16; pass++) {
    const sorted = nextEntries
      .filter((entry) => !entry.isInnerBand)
      .map((entry) => ({
        id: entry.id,
        angle: getExtendedCircleAngle(entry),
      }))
      .sort((a, b) => a.angle - b.angle);

    if (sorted.length < 2) {
      break;
    }

    const deltaById = new Map<number, number>();
    let changed = false;
    const gapSequence = buildExtendedGapSequence(sorted);
    const largeGapFlags = gapSequence.map((gap) => gap.gapAngle * EXTENDED_CIRCLE_RADIUS > targetArcLength + toleranceArc);
    const smallGapFlags = gapSequence.map((gap) => gap.gapAngle * EXTENDED_CIRCLE_RADIUS < minArcLength - minToleranceArc);
    const largeGapClusters = buildGapClusters(largeGapFlags);
    const smallGapClusters = buildGapClusters(smallGapFlags);

    for (const cluster of largeGapClusters) {
      const totalErrorArc = cluster.reduce((sum, gapIndex) => {
        const gapArc = gapSequence[gapIndex].gapAngle * EXTENDED_CIRCLE_RADIUS;
        return sum + (gapArc - targetArcLength);
      }, 0);
      const correctionArc = Math.min(
        totalErrorArc * correctionGain,
        maxOffsetArcLength * Math.min(0.8, 0.3 * cluster.length),
      );
      if (correctionArc <= 1e-6) {
        continue;
      }

      const clusterNodeIds = buildClusterNodeIds(cluster, gapSequence);
      const signedCorrection = correctionArc / EXTENDED_CIRCLE_RADIUS;
      const nodeCount = clusterNodeIds.length;

      clusterNodeIds.forEach((nodeId, nodeIndex) => {
        if (nodeCount <= 1) return;
        const relative = nodeCount === 2 ? (nodeIndex === 0 ? -1 : 1) : (nodeIndex / (nodeCount - 1)) * 2 - 1;
        const weight = Math.abs(relative);
        if (weight <= 1e-6) return;
        const direction = relative < 0 ? 1 : -1;
        const nodeDelta = direction * weight * signedCorrection * 0.5;
        deltaById.set(nodeId, (deltaById.get(nodeId) ?? 0) + nodeDelta);
      });
      changed = true;
    }

    for (const cluster of smallGapClusters) {
      const totalDeficitArc = cluster.reduce((sum, gapIndex) => {
        const gapArc = gapSequence[gapIndex].gapAngle * EXTENDED_CIRCLE_RADIUS;
        return sum + (minArcLength - gapArc);
      }, 0);
      const correctionArc = Math.min(
        totalDeficitArc * Math.max(0.7, correctionGain),
        maxOffsetArcLength * Math.min(0.8, 0.3 * cluster.length),
      );
      if (correctionArc <= 1e-6) {
        continue;
      }

      const clusterNodeIds = buildClusterNodeIds(cluster, gapSequence);
      const signedCorrection = correctionArc / EXTENDED_CIRCLE_RADIUS;
      const nodeCount = clusterNodeIds.length;

      clusterNodeIds.forEach((nodeId, nodeIndex) => {
        if (nodeCount <= 1) return;
        const relative = nodeCount === 2 ? (nodeIndex === 0 ? -1 : 1) : (nodeIndex / (nodeCount - 1)) * 2 - 1;
        const weight = Math.abs(relative);
        if (weight <= 1e-6) return;
        const direction = relative < 0 ? -1 : 1;
        const nodeDelta = direction * weight * signedCorrection * 0.5;
        deltaById.set(nodeId, (deltaById.get(nodeId) ?? 0) + nodeDelta);
      });
      changed = true;
    }

    if (!changed) {
      break;
    }

    const currentAngleById = new Map(
      nextEntries
        .filter((entry) => !entry.isInnerBand)
        .map((entry) => [entry.id, getExtendedCircleAngle(entry)]),
    );
    const angleMap = new Map<number, number>();

    movableIds.forEach((id) => {
      const currentAngle = currentAngleById.get(id);
      const originalAngle = originalAngleById.get(id);
      const delta = deltaById.get(id);
      if (currentAngle == null || originalAngle == null || delta == null) {
        return;
      }

      const minAllowed = originalAngle - maxOffsetAngle;
      const maxAllowed = originalAngle + maxOffsetAngle;
      const normalizedCurrent = currentAngle < minAllowed ? currentAngle + Math.PI * 2 : currentAngle;
      const nextAngle = clamp(normalizedCurrent + delta, minAllowed, maxAllowed);
      angleMap.set(id, normalizeAngle(nextAngle));
    });

    if (angleMap.size === 0) {
      break;
    }

    nextEntries = updateEntriesByExtendedAngleMap(nextEntries, angleMap);
    nextEntries = enforceExtendedCircleOrder(nextEntries, movableIds, originalAngleById);
  }

  return enforceMinimumExtendedArcGap(
    nextEntries,
    movableIds,
    minArcLength,
    originalAngleById,
  );
}

function applyHighCountDistribution(entries: LineExtension[]) {
  const movableEntries = entries.filter((entry) => !entry.isInnerBand);
  if (movableEntries.length < 2) {
    return entries;
  }

  const movableIds = movableEntries.map((entry) => entry.id);
  const originalAngleById = buildExtendedAngleMap(entries, (entry) => !entry.isInnerBand);
  const maxGapDegrees = 360 / movableEntries.length;
  const minGapDegrees = 180 / movableEntries.length;
  const maxGapRadians = degreesToRadians(maxGapDegrees);
  const linearEntries = buildExtendedLinearAngleEntries(entries, movableIds, originalAngleById);

  if (linearEntries.length < 2) {
    return entries;
  }

  const compressedAngles = linearEntries.map((item) => item.linearAngle);
  for (let index = 1; index < compressedAngles.length; index++) {
    const cappedAngle = compressedAngles[index - 1] + maxGapRadians;
    if (compressedAngles[index] > cappedAngle) {
      compressedAngles[index] = cappedAngle;
    }
  }

  for (let index = compressedAngles.length - 2; index >= 0; index--) {
    const cappedAngle = compressedAngles[index + 1] - maxGapRadians;
    if (compressedAngles[index] < cappedAngle) {
      compressedAngles[index] = cappedAngle;
    }
  }

  const compressedAngleMap = new Map<number, number>();
  linearEntries.forEach((item, index) => {
    compressedAngleMap.set(item.entry.id, normalizeAngle(compressedAngles[index]));
  });

  const compressedEntries = updateEntriesByExtendedAngleMap(entries, compressedAngleMap);
  const relaxedEntries = applyExtendedMinGapRelaxation(
    compressedEntries,
    movableIds,
    minGapDegrees,
    [
      {
        ranges: [
          { minOffsetDegrees: -360, maxOffsetDegrees: 360 },
        ],
      },
    ],
    getEntryIds(entries, (entry) => entry.isInnerBand),
    HIGH_COUNT_BLOCKER_GAP_DEGREES,
    originalAngleById,
  );

  return enforceExtendedCircleOrder(
    relaxedEntries,
    movableIds,
    originalAngleById,
  );
}

function enforceBlueAnchorSegments(
  entries: LineExtension[],
  blueAnchorSegments: Map<number, BlueAnchorSegment>,
  minGapDegrees: number,
) {
  if (blueAnchorSegments.size === 0) return entries;

  const minGap = degreesToRadians(minGapDegrees);
  const greenAngleById = buildAngleMap(entries, isGreenEntry);
  const angleMap = new Map<number, number>();

  entries.forEach((entry) => {
    if (!isBlueEntry(entry)) return;

    const anchorSegment = blueAnchorSegments.get(entry.id);
    if (!anchorSegment) return;

    const leftAngle = greenAngleById.get(anchorSegment.leftGreenId);
    const rightBaseAngle = greenAngleById.get(anchorSegment.rightGreenId);
    if (leftAngle == null || rightBaseAngle == null) return;

    const currentAngle = getCircleIntersectionAngle(entry);
    const rightAngle = rightBaseAngle <= leftAngle ? rightBaseAngle + Math.PI * 2 : rightBaseAngle;
    const normalizedCurrentAngle = currentAngle < leftAngle ? currentAngle + Math.PI * 2 : currentAngle;
    const clampedAngle = clamp(
      normalizedCurrentAngle,
      leftAngle + minGap,
      rightAngle - minGap,
    );

    if (Math.abs(clampedAngle - normalizedCurrentAngle) > 1e-6) {
      angleMap.set(entry.id, normalizeAngle(clampedAngle));
    }
  });

  if (angleMap.size === 0) return entries;
  return updateEntriesByAngleMap(entries, angleMap);
}

function collectSegmentChunkIds(
  entries: LineExtension[],
  segmentIds: number[],
  startIndex: number,
  segmentLeftAngle: number,
  segmentRightAngle: number,
  maxSpanDegrees: number,
  originalAngleById?: Map<number, number>,
) {
  const chunkIds: number[] = [];
  let firstAngle = 0;
  const maxSpan = degreesToRadians(maxSpanDegrees);

  for (let targetIndex = startIndex; targetIndex < segmentIds.length; targetIndex++) {
    const targetEntry = entries.find((entry) => entry.id === segmentIds[targetIndex]);
    if (!targetEntry) continue;

    let targetAngle = originalAngleById?.get(targetEntry.id) ?? getCircleIntersectionAngle(targetEntry);
    if (segmentRightAngle > Math.PI * 2 && targetAngle < segmentLeftAngle) {
      targetAngle += Math.PI * 2;
    }

    if (chunkIds.length === 0) {
      chunkIds.push(targetEntry.id);
      firstAngle = targetAngle;
      continue;
    }

    if (targetAngle - firstAngle > maxSpan) {
      break;
    }

    chunkIds.push(targetEntry.id);
  }

  return chunkIds;
}

function distributeBlueGroupByReference(
  entries: LineExtension[],
  targetIds: number[],
  leftBoundary: number,
  rightBoundary: number,
  maxOffsetDegrees: number,
  minGapDegrees: number,
  originalAngleById?: Map<number, number>,
) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const minGap = degreesToRadians(minGapDegrees);
  const maxOffset = degreesToRadians(maxOffsetDegrees);
  const referenceGap = degreesToRadians(BLUE_REFERENCE_OUTER_GAP_DEGREES);
  if (targetIds.length === 0) return entries;

  const targets = targetIds
    .map((id) => byId.get(id))
    .filter((entry): entry is LineExtension => Boolean(entry))
    .map((entry) => ({
      id: entry.id,
      angle: originalAngleById?.get(entry.id) ?? getCircleIntersectionAngle(entry),
    }))
    .sort((a, b) => a.angle - b.angle);

  if (targets.length === 0) return entries;

  const protectedLeftBoundary = leftBoundary + minGap;
  const protectedRightBoundary = rightBoundary - minGap;
  if (protectedRightBoundary <= protectedLeftBoundary) return entries;

  const leftReference = Math.max(protectedLeftBoundary, targets[0].angle - referenceGap);
  const rightReference = Math.min(protectedRightBoundary, targets[targets.length - 1].angle + referenceGap);
  const step = targets.length === 1
    ? 0
    : (rightReference - leftReference) / (targets.length + 1);

  const angleMap = new Map<number, number>();
  targets.forEach((target, index) => {
    const targetEntry = byId.get(target.id);
    if (!targetEntry) return;

    const desired = targets.length === 1
      ? (leftReference + rightReference) / 2
      : leftReference + step * (index + 1);
    const lower = Math.max(protectedLeftBoundary, target.angle - maxOffset);
    const upper = Math.min(protectedRightBoundary, target.angle + maxOffset);
    const nextAngle = clamp(desired, lower, upper);
    angleMap.set(target.id, normalizeAngle(nextAngle));
  });

  return updateEntriesByAngleMap(entries, angleMap);
}

function isRedOrBlueEntry(entry: LineExtension) {
  return entry.isOuterBand || (!entry.isInnerBand && !entry.isMiddleBand && !entry.isOuterBand);
}

function isBlueEntry(entry: LineExtension) {
  return !entry.isInnerBand && !entry.isMiddleBand && !entry.isOuterBand;
}

function isGreenEntry(entry: LineExtension) {
  return entry.isMiddleBand && !entry.isInnerBand;
}

function isRedEntry(entry: LineExtension) {
  return entry.isOuterBand;
}

function findGreenClusterSkipIds(entries: LineExtension[]) {
  const sorted = [...entries].sort((a, b) => getCircleIntersectionAngle(a) - getCircleIntersectionAngle(b));
  if (sorted.length === 0) return new Set<number>();

  const greenFlags = sorted.map((entry) => entry.isMiddleBand && !entry.isInnerBand);
  const firstNonGreenIndex = greenFlags.findIndex((flag) => !flag);
  const linearSorted = firstNonGreenIndex === -1
    ? sorted
    : [...sorted.slice(firstNonGreenIndex), ...sorted.slice(0, firstNonGreenIndex)];

  const clusters: LineExtension[][] = [];
  let currentCluster: LineExtension[] = [];

  linearSorted.forEach((entry) => {
    if (entry.isMiddleBand && !entry.isInnerBand) {
      currentCluster.push(entry);
      return;
    }

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
      currentCluster = [];
    }
  });

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const windowAngle = degreesToRadians(GREEN_CLUSTER_OUTER_WINDOW_DEGREES);
  const skipIds = new Set<number>();

  clusters.forEach((cluster) => {
    if (cluster.length < 2) return;

    const leftAngle = getCircleIntersectionAngle(cluster[0]);
    const rightAngle = getCircleIntersectionAngle(cluster[cluster.length - 1]);

    let redBlueCount = 0;
    for (const entry of entries) {
      if (!isRedOrBlueEntry(entry)) continue;

      const entryAngle = getCircleIntersectionAngle(entry);
      const leftDelta = normalizeAngle(leftAngle - entryAngle);
      const rightDelta = normalizeAngle(entryAngle - rightAngle);
      const inLeftWindow = leftDelta > 0 && leftDelta <= windowAngle;
      const inRightWindow = rightDelta > 0 && rightDelta <= windowAngle;

      if (inLeftWindow || inRightWindow) {
        redBlueCount += 1;
      }
    }

    if (redBlueCount >= GREEN_CLUSTER_SKIP_THRESHOLD) {
      cluster.forEach((entry) => {
        skipIds.add(entry.id);
      });
    }
  });

  return skipIds;
}

function applyGreenExtremeGapFix(entries: LineExtension[]) {
  const greenEntries = getEntryIds(entries, isGreenEntry);
  const skipGreenIds = findGreenClusterSkipIds(entries);
  const skipGreenIdList = [...skipGreenIds];
  const adjustableGreenIds = greenEntries.filter((id) => !skipGreenIds.has(id));
  const blockerIds = getEntryIds(entries, isRedOrBlueEntry);

  const blockerOnlyAdjusted = applyMinGapRelaxation(
    entries,
    skipGreenIdList,
    0,
    [
      {
        ranges: [
          { minOffsetDegrees: -20, maxOffsetDegrees: 20 },
        ],
      },
    ],
    blockerIds,
    GREEN_TO_RED_BLUE_MIN_GAP_DEGREES,
  );

  const greenAdjusted = applyMinGapRelaxation(
    blockerOnlyAdjusted,
    adjustableGreenIds,
    GREEN_GAP_MIN_DEGREES,
    [
      {
        ranges: [
          { minOffsetDegrees: -20, maxOffsetDegrees: 20 },
        ],
      },
    ],
    [...blockerIds, ...skipGreenIdList],
    GREEN_TO_RED_BLUE_MIN_GAP_DEGREES,
  );

  return resolveGreenDirectionalPriority(entries, greenAdjusted);
}

function applyBlueDistribution(entries: LineExtension[]) {
  const greenBoundaryGap = degreesToRadians(BAND_MIN_GAP_DEGREES);
  const blueAnchorSegments = buildBlueAnchorSegmentMap(entries);
  const blueOriginAngleById = buildAngleMap(entries, isBlueEntry);
  const fixedGreenEntries = buildSortedAnchors(entries, isGreenEntry);

  if (fixedGreenEntries.length < 2) {
    return entries;
  }

  const blueIdSet = new Set(getEntryIds(entries, isBlueEntry));
  const priorityBlueIds = new Set<number>();

  fixedGreenEntries.forEach((leftGreen, index) => {
    const rightAngle = getWrappedRightAngle(fixedGreenEntries, index);
    const gap = rightAngle - leftGreen.angle;

    if (gap >= degreesToRadians(GREEN_SEGMENT_PRIORITY_MAX_DEGREES)) {
      return;
    }

    getEntriesInsideAnchorSegment(entries, leftGreen.angle, rightAngle, blueIdSet).forEach((id) => {
      priorityBlueIds.add(id);
    });
  });

  let nextEntries = entries;

  fixedGreenEntries.forEach((leftGreen, index) => {
    const rightAngle = getWrappedRightAngle(fixedGreenEntries, index);
    const gap = rightAngle - leftGreen.angle;

    if (gap >= degreesToRadians(GREEN_SEGMENT_PRIORITY_MAX_DEGREES)) {
      return;
    }

    const segmentBlueIds = getEntriesInsideAnchorSegment(nextEntries, leftGreen.angle, rightAngle, priorityBlueIds);
    if (segmentBlueIds.length === 0) {
      return;
    }

    nextEntries = distributeBlueGroupByReference(
      nextEntries,
      segmentBlueIds,
      leftGreen.angle,
      rightAngle,
      BLUE_MAX_OFFSET_DEGREES,
      BAND_MIN_GAP_DEGREES,
      blueOriginAngleById,
    );
  });

  const remainingBlueIds = [...blueIdSet].filter((id) => !priorityBlueIds.has(id));
  if (remainingBlueIds.length === 0) {
    return nextEntries;
  }

  fixedGreenEntries.forEach((leftGreen, index) => {
    const rightAngle = getWrappedRightAngle(fixedGreenEntries, index);
    const segmentBlueIds = getEntriesInsideAnchorSegment(nextEntries, leftGreen.angle, rightAngle, new Set(remainingBlueIds));
    if (segmentBlueIds.length === 0) {
      return;
    }

    let startIndex = 0;
    while (startIndex < segmentBlueIds.length) {
      const chunkIds = collectSegmentChunkIds(
        nextEntries,
        segmentBlueIds,
        startIndex,
        leftGreen.angle,
        rightAngle,
        BLUE_MAX_DISTRIBUTION_SPAN_DEGREES,
        blueOriginAngleById,
      );

      if (chunkIds.length === 0) {
        break;
      }

      nextEntries = distributeBlueGroupByReference(
        nextEntries,
        chunkIds,
        leftGreen.angle + greenBoundaryGap,
        rightAngle - greenBoundaryGap,
        BLUE_MAX_OFFSET_DEGREES,
        BAND_MIN_GAP_DEGREES,
        blueOriginAngleById,
      );
      startIndex += chunkIds.length;
    }
  });

  return enforceBlueAnchorSegments(nextEntries, blueAnchorSegments, BAND_MIN_GAP_DEGREES);
}

function applyEnclosedRedDistribution(
  entries: LineExtension[],
  originalAngleById?: Map<number, number>,
) {
  const anchors = buildSortedAnchors(
    entries,
    (entry) => isGreenEntry(entry) || isBlueEntry(entry),
  );

  if (anchors.length < 2) return entries;

  let nextEntries = entries;
  const redIdSet = new Set(getEntryIds(entries, isRedEntry));

  anchors.forEach((leftAnchor, index) => {
    const rightAngle = getWrappedRightAngle(anchors, index);
    const segmentRedIds = getEntriesInsideAnchorSegment(nextEntries, leftAnchor.angle, rightAngle, redIdSet);
    if (segmentRedIds.length === 0) return;

    let startIndex = 0;
    while (startIndex < segmentRedIds.length) {
      const chunkIds = collectSegmentChunkIds(
        nextEntries,
        segmentRedIds,
        startIndex,
        leftAnchor.angle,
        rightAngle,
        RED_MAX_DISTRIBUTION_SPAN_DEGREES,
        originalAngleById,
      );

      if (chunkIds.length === 0) break;

      nextEntries = distributeBlueGroupByReference(
        nextEntries,
        chunkIds,
        leftAnchor.angle,
        rightAngle,
        RED_MAX_OFFSET_DEGREES,
        BAND_MIN_GAP_DEGREES,
        originalAngleById,
      );
      startIndex += chunkIds.length;
    }
  });

  const greenAndBlueIds = getEntryIds(
    nextEntries,
    (entry) => isGreenEntry(entry) || isBlueEntry(entry),
  );
  const redIds = getEntryIds(nextEntries, isRedEntry);

  return applyMinGapRelaxation(
    nextEntries,
    redIds,
    BAND_MIN_GAP_DEGREES,
    [
      {
        ranges: [
          { minOffsetDegrees: -RED_MAX_OFFSET_DEGREES, maxOffsetDegrees: RED_MAX_OFFSET_DEGREES },
        ],
      },
    ],
    greenAndBlueIds,
    BAND_MIN_GAP_DEGREES,
  );
}

function applyThirdLayer(entries: LineExtension[]) {
  const blueAnchorSegments = buildBlueAnchorSegmentMap(entries);
  const thirdLayerOriginAngleById = buildAngleMap(
    entries,
    (entry) => isBlueEntry(entry) || isRedEntry(entry),
  );
  const blueIds = getEntryIds(entries, isBlueEntry);
  const greenIds = getEntryIds(entries, isGreenEntry);
  const redIds = getEntryIds(entries, isRedEntry);
  const globallyAvoided = applyMinGapRelaxation(
    entries,
    blueIds,
    BAND_MIN_GAP_DEGREES,
    [
      {
        ranges: [
          { minOffsetDegrees: -BLUE_MAX_OFFSET_DEGREES, maxOffsetDegrees: BLUE_MAX_OFFSET_DEGREES },
        ],
      },
    ],
    greenIds,
    BAND_MIN_GAP_DEGREES,
    thirdLayerOriginAngleById,
  );
  const anchoredBlue = enforceBlueAnchorSegments(
    globallyAvoided,
    blueAnchorSegments,
    BAND_MIN_GAP_DEGREES,
  );
  const globallyAvoidedRed = applyMinGapRelaxation(
    anchoredBlue,
    redIds,
    BAND_MIN_GAP_DEGREES,
    [
      {
        ranges: [
          { minOffsetDegrees: -RED_MAX_OFFSET_DEGREES, maxOffsetDegrees: RED_MAX_OFFSET_DEGREES },
        ],
      },
    ],
    [
      ...greenIds,
      ...getEntryIds(anchoredBlue, isBlueEntry),
    ],
    BAND_MIN_GAP_DEGREES,
    thirdLayerOriginAngleById,
  );
  const directionResolved = resolveThirdLayerDirectionalPriority(
    globallyAvoidedRed,
    thirdLayerOriginAngleById,
  );
  const redBalanced = applyEnclosedRedDistribution(
    directionResolved,
    thirdLayerOriginAngleById,
  );
  const finalRedIds = getEntryIds(redBalanced, isRedEntry);
  const greenAndBlueIds = getEntryIds(
    redBalanced,
    (entry) => isGreenEntry(entry) || isBlueEntry(entry),
  );

  const finalRedRelaxed = applyMinGapRelaxation(
    redBalanced,
    finalRedIds,
    BAND_MIN_GAP_DEGREES,
    [
      {
        ranges: [
          { minOffsetDegrees: -RED_MAX_OFFSET_DEGREES, maxOffsetDegrees: RED_MAX_OFFSET_DEGREES },
        ],
      },
    ],
    greenAndBlueIds,
    BAND_MIN_GAP_DEGREES,
    thirdLayerOriginAngleById,
  );

  return enforceBlueAnchorSegments(finalRedRelaxed, blueAnchorSegments, BAND_MIN_GAP_DEGREES);
}

function applyInnerBandGapInsertion(entries: LineExtension[]) {
  const innerEntries = entries.filter((entry) => entry.isInnerBand);
  if (innerEntries.length === 0) {
    return entries;
  }

  const anchorEntries = entries.filter((entry) => !entry.isInnerBand);
  if (anchorEntries.length < 2) {
    return entries;
  }

  const innerOriginAngleById = new Map(
    entries
      .filter((entry) => entry.isInnerBand)
      .map((entry) => [entry.id, getExtendedCircleAngle(entry)]),
  );
  const maxOffsetAngle = degreesToRadians(45);
  let nextEntries = entries;
  const orderedInnerEntries = buildExtendedLinearAngleEntries(
    entries,
    innerEntries.map((entry) => entry.id),
    innerOriginAngleById,
  );
  const innerLinearAngleById = new Map(
    orderedInnerEntries.map((item) => [item.entry.id, item.linearAngle]),
  );
  const minimumYellowGapArc = (Math.PI * 2 * EXTENDED_CIRCLE_RADIUS) / Math.max(innerEntries.length * 4, 12);
  const fullTurn = Math.PI * 2;

  type GapCandidate = {
    key: string;
    leftAngle: number;
    rightAngle: number;
    gapAngle: number;
    gapArc: number;
    center: number;
  };

  type YellowOption = {
    yellowId: number;
    gapKey: string;
    leftAngle: number;
    rightAngle: number;
    gapArc: number;
    center: number;
    offsetScore: number;
    gapScore: number;
    baseScore: number;
  };

  function buildGapCandidates(currentEntries: LineExtension[], excludedIds: Set<number>) {
    const occupiedEntries = currentEntries
      .filter((entry) => !excludedIds.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        angle: getExtendedCircleAngle(entry),
      }))
      .sort((a, b) => a.angle - b.angle);

    if (occupiedEntries.length < 2) {
      return [] as GapCandidate[];
    }

    const allGaps = occupiedEntries.map((left, index) => {
      const right = occupiedEntries[(index + 1) % occupiedEntries.length];
      const rightAngle = index === occupiedEntries.length - 1 ? right.angle + fullTurn : right.angle;
      const gapAngle = rightAngle - left.angle;
      const gapArc = gapAngle * EXTENDED_CIRCLE_RADIUS;
      return {
        key: `${left.id}-${right.id}`,
        leftAngle: left.angle,
        rightAngle,
        gapAngle,
        gapArc,
        center: left.angle + gapAngle / 2,
      };
    });

    return allGaps.sort((a, b) => b.gapArc - a.gapArc);
  }

  function getNearestLinearGap(
    gap: GapCandidate,
    referenceAngle: number,
  ) {
    const shifted = [-fullTurn, 0, fullTurn].map((shift) => ({
      leftAngle: gap.leftAngle + shift,
      rightAngle: gap.rightAngle + shift,
      center: gap.center + shift,
    }));

    return shifted.reduce((best, current) => {
      const bestDistance = Math.abs(best.center - referenceAngle);
      const currentDistance = Math.abs(current.center - referenceAngle);
      return currentDistance < bestDistance ? current : best;
    });
  }

  function getOffsetScore(originalAngle: number, targetAngle: number) {
    const offset = Math.abs(
      getShortestAngleDelta(
        normalizeAngle(originalAngle),
        normalizeAngle(targetAngle),
      ),
    );
    const normalized = clamp(offset / maxOffsetAngle, 0, 1);
    return 45 * (1 - normalized);
  }

  function buildYellowOptions(
    yellowId: number,
    gapCandidates: GapCandidate[],
  ) {
    const originalLinearAngle = innerLinearAngleById.get(yellowId);
    if (originalLinearAngle == null) {
      return [] as YellowOption[];
    }

    const lower = originalLinearAngle - maxOffsetAngle;
    const upper = originalLinearAngle + maxOffsetAngle;
    const candidates = gapCandidates
      .map((gap) => {
        const linearGap = getNearestLinearGap(gap, originalLinearAngle);
        if (linearGap.center < lower || linearGap.center > upper) {
          return null;
        }

        return {
          leftAngle: linearGap.leftAngle,
          rightAngle: linearGap.rightAngle,
          gapArc: gap.gapArc,
          center: linearGap.center,
          gapKey: gap.key,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => b.gapArc - a.gapArc)
      .slice(0, 3);

    const groupSize = Math.max(candidates.length, 1);
    return candidates.map((candidate, index) => {
      const gapScore = (55 * (groupSize - index)) / groupSize;
      const offsetScore = getOffsetScore(originalLinearAngle, candidate.center);
      return {
        yellowId,
        ...candidate,
        offsetScore,
        gapScore,
        baseScore: offsetScore + gapScore,
      };
    });
  }

  type Assignment = {
    updates: Array<{ id: number; targetAngle: number }>;
    totalScore: number;
    minGapArc: number;
    balancePenalty: number;
  };

  const gapCandidates = buildGapCandidates(entries, new Set(innerEntries.map((entry) => entry.id)));
  if (gapCandidates.length === 0) {
    return entries;
  }

  const optionsByYellowId = new Map<number, YellowOption[]>();
  orderedInnerEntries.forEach((item) => {
    const options = buildYellowOptions(item.entry.id, gapCandidates);
    if (options.length > 0) {
      optionsByYellowId.set(item.entry.id, options);
    }
  });

  if (optionsByYellowId.size === 0) {
    return entries;
  }

  const orderedYellowIds = orderedInnerEntries
    .map((item) => item.entry.id)
    .filter((id) => optionsByYellowId.has(id));
  function canPlaceInGap(bucket: YellowOption[], candidate: YellowOption) {
    const nextBucket = [...bucket, candidate].sort((a, b) => {
      const leftAngle = innerLinearAngleById.get(a.yellowId) ?? 0;
      const rightAngle = innerLinearAngleById.get(b.yellowId) ?? 0;
      return leftAngle - rightAngle;
    });
    const first = nextBucket[0];
    const slotAngle = (first.rightAngle - first.leftAngle) / (nextBucket.length + 1);
    const slotArc = slotAngle * EXTENDED_CIRCLE_RADIUS;
    if (slotArc < minimumYellowGapArc - 1e-6) {
      return false;
    }

    return nextBucket.every((option, index) => {
      const targetAngle = first.leftAngle + slotAngle * (index + 1);
      const originalAngle = innerLinearAngleById.get(option.yellowId);
      if (originalAngle == null) {
        return false;
      }
      return Math.abs(
        getShortestAngleDelta(
          normalizeAngle(originalAngle),
          normalizeAngle(targetAngle),
        ),
      ) <= maxOffsetAngle + 1e-6;
    });
  }

  const allOptions = orderedYellowIds.flatMap((yellowId) => (
    (optionsByYellowId.get(yellowId) ?? []).map((option) => option)
  )).sort((a, b) => {
    if (b.baseScore !== a.baseScore) {
      return b.baseScore - a.baseScore;
    }
    return b.gapArc - a.gapArc;
  });

  const assignedYellowIds = new Set<number>();
  const gapBuckets = new Map<string, YellowOption[]>();

  allOptions.forEach((option) => {
    if (assignedYellowIds.has(option.yellowId)) {
      return;
    }
    const bucket = gapBuckets.get(option.gapKey) ?? [];
    if (!canPlaceInGap(bucket, option)) {
      return;
    }
    gapBuckets.set(option.gapKey, [...bucket, option]);
    assignedYellowIds.add(option.yellowId);
  });

  const fallbackAssignments: YellowOption[] = [];
  orderedYellowIds.forEach((yellowId) => {
    if (assignedYellowIds.has(yellowId)) {
      return;
    }
    const options = optionsByYellowId.get(yellowId) ?? [];
    const fallback = options.find((option) => canPlaceInGap(gapBuckets.get(option.gapKey) ?? [], option));
    if (!fallback) {
      return;
    }
    const bucket = gapBuckets.get(fallback.gapKey) ?? [];
    gapBuckets.set(fallback.gapKey, [...bucket, fallback]);
    assignedYellowIds.add(yellowId);
    fallbackAssignments.push(fallback);
  });

  const updates: Array<{ id: number; targetAngle: number }> = [];
  gapBuckets.forEach((bucket) => {
    const sortedBucket = [...bucket].sort((a, b) => {
      const leftAngle = innerLinearAngleById.get(a.yellowId) ?? 0;
      const rightAngle = innerLinearAngleById.get(b.yellowId) ?? 0;
      return leftAngle - rightAngle;
    });
    const first = sortedBucket[0];
    const slotAngle = (first.rightAngle - first.leftAngle) / (sortedBucket.length + 1);
    sortedBucket.forEach((option, index) => {
      updates.push({
        id: option.yellowId,
        targetAngle: first.leftAngle + slotAngle * (index + 1),
      });
    });
  });

  if (updates.length === 0) {
    return entries;
  }

  nextEntries = updateEntriesByExtendedAngleMap(
    nextEntries,
    new Map(
      updates.map((update: { id: number; targetAngle: number }) => [
        update.id,
        normalizeAngle(update.targetAngle),
      ]),
    ),
  );

  return nextEntries;
}

export default function TestCssPage() {
  const [count, setCount] = useState(9);
  const [seed, setSeed] = useState(1);
  const [adjustmentLayer, setAdjustmentLayer] = useState(3);
  const [showCircleIntersections, setShowCircleIntersections] = useState(false);
  const [showExtendedCircleArcs, setShowExtendedCircleArcs] = useState(false);
  const [enableHighCountArcOffset, setEnableHighCountArcOffset] = useState(false);
  const [showInnerBand, setShowInnerBand] = useState(true);
  const [showMiddleBand, setShowMiddleBand] = useState(true);
  const [showOuterBand, setShowOuterBand] = useState(true);
  const [showDefaultBand, setShowDefaultBand] = useState(true);
  const [points, setPoints] = useState<TestPoint[]>([]);
  const usesLayerRules = count <= 50;
  const usesHighCountRules = count > 50;

  useEffect(() => {
    setPoints(buildRandomPoints(count));
  }, [count, seed]);

  const bounds = useMemo(() => buildBounds(points), [points]);
  const centerPoint = useMemo(
    () => ({
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    }),
    [bounds],
  );
  const baseLineExtensions = useMemo(
    () => points.map((point) => {
      const baseAngle = Math.atan2(point.y - centerPoint.y, point.x - centerPoint.x);
      const lineAngle = normalizeSignedAngle(baseAngle);
      const intersection = intersectRayWithCircle(point, lineAngle, MAP_CIRCLE_RADIUS);
      const segmentLength = distance(point, intersection);
      const extendedIntersection = intersectRayWithCircle(point, lineAngle, EXTENDED_CIRCLE_RADIUS);
      const pointRadius = distance({ x: 0, y: 0 }, point);
      const halfCircleProjection = intersectRayWithCircle(point, lineAngle, HALF_RADIUS);
      const isInnerBand = pointRadius < INNER_THIRD_RADIUS;
      const isMiddleBand = pointRadius >= INNER_THIRD_RADIUS && pointRadius <= HALF_RADIUS;
      return {
        ...point,
        lineAngle,
        intersectionX: intersection.x,
        intersectionY: intersection.y,
        circleAngle: normalizeAngle(Math.atan2(intersection.y, intersection.x)),
        endX: extendedIntersection.x,
        endY: extendedIntersection.y,
        segmentLength,
        totalLength: distance(point, extendedIntersection),
        angle: normalizeAngle(Math.atan2(intersection.y, intersection.x)),
        pointAngle: normalizeSignedAngle(Math.atan2(point.y, point.x)),
        pointRadius,
        isOuterBand: pointRadius > OUTER_BAND_RADIUS,
        isMiddleBand,
        isInnerBand,
        halfCircleAngle: normalizeSignedAngle(Math.atan2(halfCircleProjection.y, halfCircleProjection.x)),
        halfCircleX: halfCircleProjection.x,
        halfCircleY: halfCircleProjection.y,
      };
    }),
    [centerPoint, points],
  );
  const lineExtensions = useMemo(
    () => {
      if (usesHighCountRules) {
        const highCountLineExtensions = applyHighCountDistribution(baseLineExtensions);
        if (enableHighCountArcOffset) {
          const highCountArcOffsetLineExtensions = applyExtendedArcOffsetDistribution(highCountLineExtensions);
          return applyInnerBandGapInsertion(highCountArcOffsetLineExtensions);
        }
        return applyInnerBandGapInsertion(highCountLineExtensions);
      }
      if (adjustmentLayer <= 0) {
        return applyInnerBandGapInsertion(baseLineExtensions);
      }
      const greenAdjustedLineExtensions = applyGreenExtremeGapFix(baseLineExtensions);
      if (adjustmentLayer === 1) {
        return applyInnerBandGapInsertion(greenAdjustedLineExtensions);
      }
      const blueAdjustedLineExtensions = applyBlueDistribution(greenAdjustedLineExtensions);
      if (adjustmentLayer === 2) {
        return applyInnerBandGapInsertion(blueAdjustedLineExtensions);
      }
      const thirdLayerLineExtensions = applyThirdLayer(blueAdjustedLineExtensions);
      return applyInnerBandGapInsertion(thirdLayerLineExtensions);
    },
    [
      usesHighCountRules,
      enableHighCountArcOffset,
      adjustmentLayer,
      baseLineExtensions,
    ],
  );
  const viewport = useMemo(() => buildViewportFromLineExtensions(lineExtensions), [lineExtensions]);
  const visibleLineExtensions = useMemo(
    () => lineExtensions.filter((entry) => {
      if (entry.isOuterBand) return showOuterBand;
      if (entry.isInnerBand) return showInnerBand;
      if (entry.isMiddleBand) return showMiddleBand;
      return showDefaultBand;
    }),
    [lineExtensions, showDefaultBand, showInnerBand, showMiddleBand, showOuterBand],
  );
  const gapEntries = useMemo(
    () => buildGapEntriesFromCircleAngles(visibleLineExtensions, MAP_CIRCLE_RADIUS + 22),
    [visibleLineExtensions],
  );
  const extendedCircleArcEntries = useMemo(
    () => buildExtendedCircleArcEntries(visibleLineExtensions, EXTENDED_CIRCLE_RADIUS + 26, 'outer-'),
    [visibleLineExtensions],
  );
  const minGap = gapEntries.length ? Math.min(...gapEntries.map((item) => item.angleDelta)) : 0;
  const maxGap = gapEntries.length ? Math.max(...gapEntries.map((item) => item.angleDelta)) : 0;
  const meanGap = gapEntries.length
    ? gapEntries.reduce((sum, item) => sum + item.angleDelta, 0) / gapEntries.length
    : 0;
  const bandCounts = useMemo(() => ({
    inner: lineExtensions.filter((entry) => entry.isInnerBand).length,
    middle: lineExtensions.filter((entry) => entry.isMiddleBand).length,
    outer: lineExtensions.filter((entry) => entry.isOuterBand).length,
    default: lineExtensions.filter((entry) => !entry.isInnerBand && !entry.isMiddleBand && !entry.isOuterBand).length,
  }), [lineExtensions]);

  return (
    <main className={styles.rootFull}>
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

                  <rect
                    x={bounds.left}
                    y={bounds.top}
                    width={Math.max(1, bounds.right - bounds.left)}
                    height={Math.max(1, bounds.bottom - bounds.top)}
                    className={styles.boundsRect}
                  />

                  <circle
                    cx="0"
                    cy="0"
                    r={MAP_CIRCLE_RADIUS}
                    className={styles.mapCircle}
                  />

                  <circle
                    cx="0"
                    cy="0"
                    r={EXTENDED_CIRCLE_RADIUS}
                    className={styles.mapCircleOuterExtended}
                  />

                  <circle
                    cx="0"
                    cy="0"
                    r={MAP_CIRCLE_RADIUS / 3}
                    className={styles.mapCircleThird}
                  />

                  <circle
                    cx="0"
                    cy="0"
                    r={HALF_RADIUS}
                    className={styles.mapCircleInner}
                  />

                  <circle
                    cx="0"
                    cy="0"
                    r={(MAP_CIRCLE_RADIUS * 2) / 3}
                    className={styles.mapCircleTwoThirds}
                  />

                  {visibleLineExtensions.map((point) => (
                    <line
                      key={`line-${point.id}`}
                      x1={point.x}
                      y1={point.y}
                      x2={point.endX}
                      y2={point.endY}
                      className={
                        point.isOuterBand
                          ? styles.centerLinkOuter
                          : point.isInnerBand
                            ? styles.centerLinkInner
                          : point.isMiddleBand
                            ? styles.centerLinkMiddle
                            : styles.centerLink
                      }
                    />
                  ))}

                  {gapEntries.map((gap) => (
                    <g key={gap.key}>
                      <rect
                        x={gap.labelX - 16}
                        y={gap.labelY - 10}
                        width="32"
                        height="20"
                        rx="10"
                        className={styles.gapBadge}
                      />
                      <text
                        x={gap.labelX}
                        y={gap.labelY + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className={styles.gapLabel}
                      >
                        {radiansToDegrees(gap.angleDelta).toFixed(2)}
                      </text>
                    </g>
                  ))}

                  {showExtendedCircleArcs && extendedCircleArcEntries.map((arc) => (
                    <g key={arc.key}>
                      <rect
                        x={arc.labelX - 22}
                        y={arc.labelY - 10}
                        width="44"
                        height="20"
                        rx="10"
                        className={styles.outerArcBadge}
                      />
                      <text
                        x={arc.labelX}
                        y={arc.labelY + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className={styles.outerArcLabel}
                      >
                        {arc.arcLength.toFixed(2)}
                      </text>
                    </g>
                  ))}

                  {showCircleIntersections && visibleLineExtensions.map((entry) => (
                    <g key={`intersection-${entry.id}`}>
                      <circle
                        cx={entry.intersectionX}
                        cy={entry.intersectionY}
                        r="4.5"
                        className={styles.intersectionPoint}
                      />
                      <text
                        x={entry.intersectionX}
                        y={entry.intersectionY - 12}
                        textAnchor="middle"
                        className={styles.intersectionLabel}
                      >
                        {entry.id}
                      </text>
                    </g>
                  ))}

                  {showCircleIntersections && visibleLineExtensions.map((entry) => (
                    <g key={`outer-intersection-${entry.id}`}>
                      <circle
                        cx={entry.endX}
                        cy={entry.endY}
                        r="4.5"
                        className={styles.outerIntersectionPoint}
                      />
                      <text
                        x={entry.endX}
                        y={entry.endY - 12}
                        textAnchor="middle"
                        className={styles.outerIntersectionLabel}
                      >
                        {entry.id}
                      </text>
                    </g>
                  ))}

                  {points.map((point) => {
                    const entry = lineExtensions.find((item) => item.id === point.id);
                    if (!entry) return null;
                    const isVisible = entry.isOuterBand
                      ? showOuterBand
                      : entry.isInnerBand
                        ? showInnerBand
                        : entry.isMiddleBand
                          ? showMiddleBand
                          : showDefaultBand;
                    if (!isVisible) return null;

                    return (
                    <g key={`poi-${point.id}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="2.67"
                        className={
                          entry.isOuterBand
                            ? styles.poiOuter
                            : entry.isInnerBand
                              ? styles.poiInner
                              : entry.isMiddleBand
                                ? styles.poiMiddle
                                : styles.poi
                        }
                      />
                      <text
                        x={point.x}
                        y={point.y - 16}
                        textAnchor="middle"
                        className={styles.poiLabel}
                      >
                        {point.id}
                      </text>
                    </g>
                    );
                  })}
                </g>
              </g>
            </g>
          </svg>
        </div>
      </section>

      <aside className={styles.sidePanel}>
        <div className={styles.summary}>
          <div className={styles.metric}>
            <span>坐标点数量</span>
            <strong>{points.length}</strong>
          </div>
          <div className={styles.metric}>
            <span>矩形中心点</span>
            <strong>
              {Math.round(centerPoint.x)}, {Math.round(centerPoint.y)}
            </strong>
          </div>
        </div>

        <div className={styles.controls}>
          <label className={styles.control}>
            <span>数量</span>
            <input
              type="range"
              min="3"
              max="100"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <strong>{count}</strong>
          </label>
          <button className={styles.button} onClick={() => setSeed((value) => value + 1)}>
            随机重排
          </button>
          <button
            className={styles.button}
            onClick={() => setShowCircleIntersections((value) => !value)}
          >
            {showCircleIntersections ? '隐藏外接圆交点' : '显示外接圆交点'}
          </button>
          <button
            className={styles.button}
            onClick={() => setShowExtendedCircleArcs((value) => !value)}
          >
            {showExtendedCircleArcs ? '隐藏 1.5 倍圆弧长' : '显示 1.5 倍圆弧长'}
          </button>
          <div className={styles.togglePanel}>
            <label className={styles.control}>
              <span>调整层级</span>
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={adjustmentLayer}
                onChange={(event) => setAdjustmentLayer(Number(event.target.value))}
                disabled={usesHighCountRules}
              />
              <strong>
                {usesHighCountRules
                  ? '50 以上高密规则'
                  : adjustmentLayer === 0
                    ? '原始'
                    : adjustmentLayer === 1
                      ? '第一层'
                      : adjustmentLayer === 2
                        ? '第二层'
                        : '第三层'}
              </strong>
            </label>
            <label className={styles.toggleItem}>
              <input
                type="checkbox"
                checked={enableHighCountArcOffset}
                disabled={!usesHighCountRules}
                onChange={(event) => setEnableHighCountArcOffset(event.target.checked)}
              />
              <span>50 以上启用 1.5 倍圆弧长偏移</span>
            </label>
            <label className={styles.toggleItem}>
              <input
                type="checkbox"
                checked={showInnerBand}
                onChange={(event) => setShowInnerBand(event.target.checked)}
              />
              <span>显示 1/3 内黄点黄线（{bandCounts.inner}）</span>
            </label>
            <label className={styles.toggleItem}>
              <input
                type="checkbox"
                checked={showMiddleBand}
                onChange={(event) => setShowMiddleBand(event.target.checked)}
              />
              <span>显示 1/3-1/2 绿点绿线（{bandCounts.middle}）</span>
            </label>
            <label className={styles.toggleItem}>
              <input
                type="checkbox"
                checked={showOuterBand}
                onChange={(event) => setShowOuterBand(event.target.checked)}
              />
              <span>显示 2/3 外红点红线（{bandCounts.outer}）</span>
            </label>
            <label className={styles.toggleItem}>
              <input
                type="checkbox"
                checked={showDefaultBand}
                onChange={(event) => setShowDefaultBand(event.target.checked)}
              />
              <span>显示 1/2-2/3 蓝点蓝线（{bandCounts.default}）</span>
            </label>
          </div>
        </div>
      </aside>
    </main>
  );
}
