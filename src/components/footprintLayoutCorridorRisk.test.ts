import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroupGeometryFromPhotoRect,
  rectsOverlap,
  translateGroupGeometry,
} from './localMapGroupGeometry.ts';
import { solvePendingGroupPlacements } from './footprintLayoutSolver.ts';
import { refineRadialPlacements } from './footprintSectorLayoutEngine.ts';

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom };
}

function buildGroup(
  placeKey: string,
  title: string,
  photoRect: { left: number; top: number; right: number; bottom: number },
  logicalX: number,
  logicalY: number,
  mapRect: { left: number; top: number; right: number; bottom: number },
) {
  const geometry = buildGroupGeometryFromPhotoRect(
    photoRect,
    title,
    4,
    1,
    undefined,
    0,
    mapRect,
  );

  return {
    placeKey,
    placePhotos: [
      {
        id: `${placeKey}-1`,
        url: '',
        filename: `${placeKey}.jpg`,
        frameX: logicalX,
        frameY: logicalY,
        pixelWidth: 120,
        pixelHeight: 80,
        placeKey,
        placeTitle: title,
      },
    ],
    collisionGeometry: geometry,
    collisionRect: geometry.groupRect,
    reservedLabelOffset: 0,
    logicalX,
    logicalY,
    mapRect,
    offsets: [{ offsetX: 0, offsetY: 0 }],
  };
}

function countCorridorRisk(
  groups: Array<ReturnType<typeof buildGroup>>,
  placementById: Map<string, { centerX: number; centerY: number }>,
) {
  let risk = 0;
  const geometries = groups.map((group) => ({
    key: group.placeKey,
    geometry: translateGroupGeometry(
      group.collisionGeometry,
      placementById.get(group.placeKey)!.centerX,
      placementById.get(group.placeKey)!.centerY,
    ),
  }));

  for (let index = 0; index < geometries.length; index++) {
    for (let neighborIndex = index + 1; neighborIndex < geometries.length; neighborIndex++) {
      const left = geometries[index]!;
      const right = geometries[neighborIndex]!;
      if (
        rectsOverlap(left.geometry.groupRect, right.geometry.groupRect, 48) ||
        rectsOverlap(left.geometry.labelRect, right.geometry.photoRect, 112) ||
        rectsOverlap(right.geometry.labelRect, left.geometry.photoRect, 112) ||
        rectsOverlap(left.geometry.labelRect, right.geometry.labelRect, 112)
      ) {
        risk += 1;
      }
    }
  }

  return risk;
}

test('refineRadialPlacements does not increase corridor risk in a crowded southern cluster', () => {
  const mapRect = rect(-220, -180, 220, 180);
  const groups = [
    buildGroup('haikou', '海口市', rect(-30, 120, 90, 200), 20, 165, mapRect),
    buildGroup('guangzhou', '广州市', rect(10, 110, 130, 190), 70, 150, mapRect),
    buildGroup('zhanjiang', '湛江市', rect(-70, 100, 50, 180), -10, 140, mapRect),
    buildGroup('dongguan', '东莞市', rect(55, 165, 175, 245), 125, 220, mapRect),
    buildGroup('zhuhai', '珠海市', rect(20, 180, 140, 260), 90, 240, mapRect),
    buildGroup('xianggang', '香港', rect(90, 220, 210, 300), 160, 290, mapRect),
    buildGroup('xiamen', '厦门市', rect(180, 190, 300, 270), 250, 240, mapRect),
    buildGroup('fuzhou', '福州市', rect(110, 120, 230, 200), 180, 155, mapRect),
  ];

  const seededPlacements = new Map(groups.map((group, index) => {
    const angle = Math.atan2(group.logicalY, group.logicalX);
    const radius = 520 + index * 24;
    return [group.placeKey, {
      centerX: Math.cos(angle) * radius,
      centerY: Math.sin(angle) * radius,
    }] as const;
  }));

  const baselineRisk = countCorridorRisk(groups, seededPlacements);
  const refined = refineRadialPlacements(groups, seededPlacements, mapRect, 96, 0);
  const refinedRisk = countCorridorRisk(groups, refined);

  assert.ok(
    refinedRisk <= baselineRisk,
    `expected refine not to increase corridor risk, baseline ${baselineRisk}, refined ${refinedRisk}`,
  );
});

test('solvePendingGroupPlacements does not increase corridor risk over the base radial layout', () => {
  const mapRect = rect(-220, -180, 220, 180);
  const groups = [
    buildGroup('haikou', '海口市', rect(-30, 120, 90, 200), 20, 165, mapRect),
    buildGroup('guangzhou', '广州市', rect(10, 110, 130, 190), 70, 150, mapRect),
    buildGroup('zhanjiang', '湛江市', rect(-70, 100, 50, 180), -10, 140, mapRect),
    buildGroup('dongguan', '东莞市', rect(55, 165, 175, 245), 125, 220, mapRect),
    buildGroup('zhuhai', '珠海市', rect(20, 180, 140, 260), 90, 240, mapRect),
    buildGroup('xianggang', '香港', rect(90, 220, 210, 300), 160, 290, mapRect),
    buildGroup('xiamen', '厦门市', rect(180, 190, 300, 270), 250, 240, mapRect),
    buildGroup('fuzhou', '福州市', rect(110, 120, 230, 200), 180, 155, mapRect),
  ];

  const basePlacements = new Map(groups.map((group, index) => {
    const angle = Math.atan2(group.logicalY, group.logicalX);
    const radius = 520 + index * 24;
    return [group.placeKey, {
      centerX: Math.cos(angle) * radius,
      centerY: Math.sin(angle) * radius,
    }] as const;
  }));
  const baseRisk = countCorridorRisk(groups, basePlacements);
  const solved = solvePendingGroupPlacements(groups, mapRect, 96, 0, []);
  const solvedRisk = countCorridorRisk(groups, solved.placements);

  assert.ok(
    solvedRisk <= baseRisk,
    `expected solver not to increase corridor risk over the base layout, base ${baseRisk}, solved ${solvedRisk}`,
  );
});
