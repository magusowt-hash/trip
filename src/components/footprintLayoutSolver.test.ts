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
  let groupOverlapCount = 0;
  for (let index = 0; index < geometries.length; index++) {
    for (let neighborIndex = index + 1; neighborIndex < geometries.length; neighborIndex++) {
      const geometry = geometries[index]!;
      const neighbor = geometries[neighborIndex]!;
      if (rectsOverlap(geometry.photoRect, neighbor.photoRect, 80)) {
        groupOverlapCount += 1;
      }
      if (
        rectsOverlap(geometry.labelRect, neighbor.photoRect, 96) ||
        rectsOverlap(neighbor.labelRect, geometry.photoRect, 96) ||
        rectsOverlap(geometry.labelRect, neighbor.labelRect, 96)
      ) {
        crossGroupConflictCount += 1;
      }
    }
  }

  assert.equal(
    groupOverlapCount,
    0,
    `expected no photo/group overlap in dense inner-ring solver result, got ${groupOverlapCount}`,
  );
  assert.ok(
    crossGroupConflictCount <= 1,
    `expected dense inner-ring solver conflicts to be at most 1, got ${crossGroupConflictCount}`,
  );
});

test('solvePendingGroupPlacements keeps neighboring groups apart when label footprint is much wider than photo footprint', () => {
  const mapRect = rect(-200, -160, 200, 160);
  const left = buildGroup('left', '武功山风景名胜区很多字', rect(-120, -20, 0, 60), -60, 0, mapRect);
  const right = buildGroup('right', '武功山风景名胜区很多字', rect(0, -20, 120, 60), 60, 0, mapRect);

  const solved = solvePendingGroupPlacements([left, right], mapRect, 80, 0, []);
  const leftGeometry = solved.geometries.get('left');
  const rightGeometry = solved.geometries.get('right');

  assert.ok(leftGeometry);
  assert.ok(rightGeometry);
  assert.equal(
    rectsOverlap(leftGeometry!.groupRect, rightGeometry!.groupRect, 40),
    false,
    'expected full group footprints to remain separated',
  );
});

test('solvePendingGroupPlacements preserves a strict safe gap between dense neighboring groups', () => {
  const mapRect = rect(-220, -180, 220, 180);
  const groups = [
    buildGroup('a', 'aaa', rect(-140, -40, -20, 40), -80, 10, mapRect),
    buildGroup('b', 'bbb', rect(-60, -30, 60, 50), 0, 20, mapRect),
    buildGroup('c', 'ccc', rect(20, -40, 140, 40), 80, 10, mapRect),
    buildGroup('d', 'ddd', rect(-40, 40, 80, 120), 20, 90, mapRect),
  ];

  const safeGap = 96;
  const solved = solvePendingGroupPlacements(groups, mapRect, safeGap, 0, []);
  const geometries = groups.map((group) => solved.geometries.get(group.placeKey)).filter(Boolean);

  for (let index = 0; index < geometries.length; index++) {
    for (let neighborIndex = index + 1; neighborIndex < geometries.length; neighborIndex++) {
      const geometry = geometries[index]!;
      const neighbor = geometries[neighborIndex]!;
      assert.equal(
        rectsOverlap(geometry.photoRect, neighbor.photoRect, safeGap),
        false,
        `expected photo safe gap between group ${index} and ${neighborIndex}`,
      );
      assert.equal(
        rectsOverlap(geometry.labelRect, neighbor.photoRect, safeGap + 16),
        false,
        `expected label-photo safe gap between group ${index} and ${neighborIndex}`,
      );
      assert.equal(
        rectsOverlap(geometry.labelRect, neighbor.labelRect, safeGap + 16),
        false,
        `expected label-label safe gap between group ${index} and ${neighborIndex}`,
      );
    }
  }
});
