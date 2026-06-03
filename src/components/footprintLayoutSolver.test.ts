import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGroupGeometryFromPhotoRect, rectsOverlap } from './localMapGroupGeometry.ts';
import { solvePendingGroupPlacements } from './footprintLayoutSolver.ts';

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

test('solvePendingGroupPlacements reduces dense inner-ring label collisions around the map edge', () => {
  const mapRect = rect(-200, -160, 200, 160);
  const groups = [
    buildGroup('zhangjiajie', '张家界', rect(-140, -20, -20, 60), -80, 20, mapRect),
    buildGroup('foshan', '佛山市', rect(60, 30, 180, 110), 120, 70, mapRect),
    buildGroup('zhuhai', '珠海市', rect(-20, 90, 100, 170), 40, 130, mapRect),
    buildGroup('huzhou', '湖州市', rect(40, 80, 160, 160), 100, 120, mapRect),
    buildGroup('luoyang', '洛阳市', rect(-40, -220, 80, -140), 20, -180, mapRect),
    buildGroup('zhangzhou', '漳州市', rect(80, 200, 200, 280), 140, 240, mapRect),
  ];

  const solved = solvePendingGroupPlacements(groups, mapRect, 80, 0, []);
  const geometries = groups.map((group) => solved.geometries.get(group.placeKey)).filter(Boolean);

  let crossGroupConflictCount = 0;
  for (let index = 0; index < geometries.length; index++) {
    for (let neighborIndex = index + 1; neighborIndex < geometries.length; neighborIndex++) {
      const geometry = geometries[index]!;
      const neighbor = geometries[neighborIndex]!;
      if (
        rectsOverlap(geometry.labelRect, neighbor.photoRect, 96) ||
        rectsOverlap(neighbor.labelRect, geometry.photoRect, 96) ||
        rectsOverlap(geometry.labelRect, neighbor.labelRect, 96)
      ) {
        crossGroupConflictCount += 1;
      }
    }
  }

  assert.ok(
    crossGroupConflictCount <= 1,
    `expected dense inner-ring solver conflicts to be at most 1, got ${crossGroupConflictCount}`,
  );
});
