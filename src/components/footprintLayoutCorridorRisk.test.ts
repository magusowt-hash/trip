import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildGroupGeometryFromPhotoRect,
  rectsOverlap,
  translateGroupGeometry,
} from './localMapGroupGeometry.ts';
import {
  __layoutSolverInternals,
  solvePendingGroupPlacements,
} from './footprintLayoutSolver.ts';
import { buildRadialLayout } from './localMapLayoutEngine.ts';
import { refineRadialPlacements } from './footprintSectorLayoutEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ReplayFixture = {
  solverInputSnapshot: {
    pendingGroups: Array<ReturnType<typeof buildGroup>>;
    mapRect: { left: number; top: number; right: number; bottom: number };
    safeGap: number;
    labelGapBoost: number;
  };
};

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/3-mapped-layout.json'), 'utf8'),
) as ReplayFixture;

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

function countPlacementLineCrossings(
  groups: Array<{
    placeKey: string;
    logicalX: number;
    logicalY: number;
  }>,
  placementById: Map<string, { centerX: number; centerY: number }>,
) {
  let crossingCount = 0;

  for (let index = 0; index < groups.length; index++) {
    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const group = groups[index]!;
      const neighbor = groups[neighborIndex]!;
      const placement = placementById.get(group.placeKey);
      const neighborPlacement = placementById.get(neighbor.placeKey);
      assert.ok(placement, `missing placement for ${group.placeKey}`);
      assert.ok(neighborPlacement, `missing placement for ${neighbor.placeKey}`);

      if (
        segmentsIntersect(
          { x: group.logicalX, y: group.logicalY },
          { x: placement.centerX, y: placement.centerY },
          { x: neighbor.logicalX, y: neighbor.logicalY },
          { x: neighborPlacement.centerX, y: neighborPlacement.centerY },
        )
      ) {
        crossingCount += 1;
      }
    }
  }

  return crossingCount;
}

function buildCrowdedSouthernGroups() {
  const mapRect = rect(-220, -180, 220, 180);
  return {
    mapRect,
    groups: [
      buildGroup('haikou', '海口市', rect(-30, 120, 90, 200), 20, 165, mapRect),
      buildGroup('guangzhou', '广州市', rect(10, 110, 130, 190), 70, 150, mapRect),
      buildGroup('zhanjiang', '湛江市', rect(-70, 100, 50, 180), -10, 140, mapRect),
      buildGroup('dongguan', '东莞市', rect(55, 165, 175, 245), 125, 220, mapRect),
      buildGroup('zhuhai', '珠海市', rect(20, 180, 140, 260), 90, 240, mapRect),
      buildGroup('xianggang', '香港', rect(90, 220, 210, 300), 160, 290, mapRect),
      buildGroup('xiamen', '厦门市', rect(180, 190, 300, 270), 250, 240, mapRect),
      buildGroup('fuzhou', '福州市', rect(110, 120, 230, 200), 180, 155, mapRect),
    ],
  };
}

test('refineRadialPlacements does not increase corridor risk in a crowded southern cluster', () => {
  const { mapRect, groups } = buildCrowdedSouthernGroups();

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
  const { mapRect, groups } = buildCrowdedSouthernGroups();

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

test('dense map-adjacent groups get cross-sector escape candidates before refinement', () => {
  const { mapRect, groups } = buildCrowdedSouthernGroups();
  const basePlacements = buildRadialLayout(
    groups.map((group) => ({
      id: group.placeKey,
      x: group.logicalX,
      y: group.logicalY,
      rect: group.collisionRect,
    })),
    mapRect,
    { mapGap: 128 },
  );
  const basePlacementById = new Map(basePlacements.map((placement) => [
    placement.id,
    { centerX: placement.centerX, centerY: placement.centerY },
  ]));
  const zhuhaiBase = basePlacementById.get('zhuhai');
  assert.ok(zhuhaiBase, 'expected base placement for zhuhai');

  const candidates = __layoutSolverInternals.buildCandidatePool(
    groups.find((group) => group.placeKey === 'zhuhai')!,
    zhuhaiBase,
    mapRect,
    4,
  );
  const baseAngle = Math.atan2(zhuhaiBase.centerY, zhuhaiBase.centerX);
  const maxAngleDelta = candidates.reduce((max, candidate) => {
    const candidateAngle = Math.atan2(candidate.placement.centerY, candidate.placement.centerX);
    const delta = Math.abs(__layoutSolverInternals.angleDelta(candidateAngle, baseAngle));
    return Math.max(max, delta);
  }, 0);

  assert.ok(
    maxAngleDelta >= Math.PI / 3,
    `expected dense map-adjacent candidate pool to include cross-sector escape angles, got max delta ${(maxAngleDelta * 180) / Math.PI}deg`,
  );
});

test('refineRadialPlacements keeps real fixture connector lines uncrossed', () => {
  const { pendingGroups, mapRect, safeGap, labelGapBoost } = fixture.solverInputSnapshot;
  const basePlacements = new Map(
    buildRadialLayout(
      pendingGroups.map((group) => ({
        id: group.placeKey,
        x: group.logicalX,
        y: group.logicalY,
        rect: group.collisionRect,
      })),
      mapRect,
      { mapGap: 128 },
    ).map((placement) => [
      placement.id,
      { centerX: placement.centerX, centerY: placement.centerY },
    ] as const),
  );

  assert.equal(
    countPlacementLineCrossings(pendingGroups, basePlacements),
    0,
    'expected base radial layout to start uncrossed for the real fixture',
  );

  const refined = refineRadialPlacements(
    pendingGroups,
    new Map(basePlacements),
    mapRect,
    Math.max(safeGap, 128),
    labelGapBoost,
  );

  assert.equal(
    countPlacementLineCrossings(pendingGroups, refined),
    0,
    'expected refinement not to introduce connector crossings for the real fixture',
  );
});
