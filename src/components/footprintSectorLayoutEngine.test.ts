import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroupGeometryFromPhotoRect,
  rectsOverlap,
  translateGroupGeometry,
} from './localMapGroupGeometry.ts';
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

test('refineRadialPlacements does not make a dense southern-sector corridor worse', () => {
  const mapRect = rect(-220, -180, 220, 180);
  const groups = [
    buildGroup('zhuhai', '珠海市', rect(30, 160, 150, 240), 110, 210, mapRect),
    buildGroup('dongguan', '东莞市', rect(40, 175, 160, 255), 120, 235, mapRect),
    buildGroup('chaozhou', '潮州市', rect(55, 190, 175, 270), 130, 260, mapRect),
    buildGroup('xianggang', '香港', rect(70, 205, 190, 285), 140, 285, mapRect),
    buildGroup('fuzhou', '福州市', rect(150, 110, 270, 190), 230, 150, mapRect),
    buildGroup('xiamen', '厦门市', rect(200, 170, 320, 250), 290, 230, mapRect),
  ];

  const placementById = new Map(groups.map((group, index) => {
    const angle = Math.atan2(group.logicalY, group.logicalX);
    const radius = 900 + index * 36;
    return [group.placeKey, {
      centerX: Math.cos(angle) * radius,
      centerY: Math.sin(angle) * radius,
    }] as const;
  }));

  const refined = refineRadialPlacements(groups, placementById, mapRect, 96, 0);
  const geometries = groups.map((group) => {
    const placement = refined.get(group.placeKey);
    assert.ok(placement, `expected placement for ${group.placeKey}`);
    return {
      key: group.placeKey,
      placement,
      geometry: translateGroupGeometry(
        group.collisionGeometry,
        placement.centerX,
        placement.centerY,
      ),
    };
  });

  let baselineConflictCount = 0;
  let refinedConflictCount = 0;
  for (let index = 0; index < groups.length; index++) {
    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const geometry = geometries[index]!;
      const neighbor = geometries[neighborIndex]!;
      const baselineLeft = translateGroupGeometry(
        groups[index]!.collisionGeometry,
        placementById.get(groups[index]!.placeKey)!.centerX,
        placementById.get(groups[index]!.placeKey)!.centerY,
      );
      const baselineRight = translateGroupGeometry(
        groups[neighborIndex]!.collisionGeometry,
        placementById.get(groups[neighborIndex]!.placeKey)!.centerX,
        placementById.get(groups[neighborIndex]!.placeKey)!.centerY,
      );

      const hasBaselineConflict =
        rectsOverlap(baselineLeft.groupRect, baselineRight.groupRect, 48) ||
        rectsOverlap(baselineLeft.labelRect, baselineRight.photoRect, 112) ||
        rectsOverlap(baselineRight.labelRect, baselineLeft.photoRect, 112) ||
        rectsOverlap(baselineLeft.labelRect, baselineRight.labelRect, 112);
      const hasRefinedConflict =
        rectsOverlap(geometry.geometry.groupRect, neighbor.geometry.groupRect, 48) ||
        rectsOverlap(geometry.geometry.labelRect, neighbor.geometry.photoRect, 112) ||
        rectsOverlap(neighbor.geometry.labelRect, geometry.geometry.photoRect, 112) ||
        rectsOverlap(geometry.geometry.labelRect, neighbor.geometry.labelRect, 112);

      if (hasBaselineConflict) baselineConflictCount += 1;
      if (hasRefinedConflict) refinedConflictCount += 1;
    }
  }

  assert.ok(
    refinedConflictCount <= baselineConflictCount,
    `expected refine to not increase strict corridor conflicts, baseline ${baselineConflictCount}, refined ${refinedConflictCount}`,
  );
});
