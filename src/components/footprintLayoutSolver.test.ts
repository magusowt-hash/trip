import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGroupGeometryFromPhotoRect, rectsOverlap } from './localMapGroupGeometry.ts';
import {
  __layoutSolverInternals,
  solvePendingGroupPlacements,
} from './footprintLayoutSolver.ts';
import { buildRadialLayout } from './localMapLayoutEngine.ts';

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

function getRealFixturePairConflictFlags(
  leftTitle: string,
  rightTitle: string,
) {
  const { pendingGroups, mapRect, safeGap, labelGapBoost } = fixture.solverInputSnapshot;
  const solved = solvePendingGroupPlacements(
    pendingGroups,
    mapRect,
    safeGap,
    labelGapBoost,
    [],
  );
  const labelGap = Math.max(22, safeGap + 16);
  const groupGap = Math.max(48, safeGap * 0.5);
  const namedGroups = new Map(
    pendingGroups.map((group) => [
      group.placePhotos?.[0]?.placeTitle ?? group.placeKey,
      group,
    ] as const),
  );

  const leftGroup = namedGroups.get(leftTitle);
  const rightGroup = namedGroups.get(rightTitle);
  assert.ok(leftGroup, `missing real fixture group ${leftTitle}`);
  assert.ok(rightGroup, `missing real fixture group ${rightTitle}`);

  const left = solved.geometries.get(leftGroup!.placeKey);
  const right = solved.geometries.get(rightGroup!.placeKey);
  assert.ok(left, `missing solved geometry for ${leftTitle}`);
  assert.ok(right, `missing solved geometry for ${rightTitle}`);

  return {
    groupRect: rectsOverlap(left!.groupRect, right!.groupRect, groupGap),
    leftLabelToRightPhoto: rectsOverlap(left!.labelRect, right!.photoRect, labelGap),
    rightLabelToLeftPhoto: rectsOverlap(right!.labelRect, left!.photoRect, labelGap),
    labelLabel: rectsOverlap(left!.labelRect, right!.labelRect, labelGap),
  };
}

function buildRealFixtureCandidatePools() {
  const { pendingGroups, mapRect } = fixture.solverInputSnapshot;
  const basePlacements = buildRadialLayout(
    pendingGroups.map((group) => ({
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
  const baseSectorCounts = Array.from({ length: 16 }, () => 0);
  basePlacementById.forEach((placement) => {
    const angle = Math.atan2(placement.centerY, placement.centerX);
    const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const index = Math.min(15, Math.floor((normalized / (Math.PI * 2)) * 16));
    baseSectorCounts[index] += 1;
  });

  const groupsByTitle = new Map(
    pendingGroups.map((group) => [
      group.placePhotos?.[0]?.placeTitle ?? group.placeKey,
      group,
    ] as const),
  );

  const poolsByTitle = new Map(
    pendingGroups.map((group) => {
      const basePlacement = basePlacementById.get(group.placeKey) ?? { centerX: 0, centerY: 0 };
      const angle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
      const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sectorIndex = Math.min(15, Math.floor((normalized / (Math.PI * 2)) * 16));
      const sectorDensity = baseSectorCounts[sectorIndex] ?? 0;
      return [
        group.placePhotos?.[0]?.placeTitle ?? group.placeKey,
        __layoutSolverInternals.buildCandidatePool(group, basePlacement, mapRect, sectorDensity),
      ] as const;
    }),
  );

  return { groupsByTitle, poolsByTitle };
}

function countPairCollisionFlags(
  leftGeometry: ReturnType<typeof buildGroupGeometryFromPhotoRect>,
  rightGeometry: ReturnType<typeof buildGroupGeometryFromPhotoRect>,
  safeGap: number,
) {
  const labelGap = Math.max(22, safeGap + 16);
  const groupGap = Math.max(48, safeGap * 0.5);
  return {
    groupRect: rectsOverlap(leftGeometry.groupRect, rightGeometry.groupRect, groupGap),
    leftLabelToRightPhoto: rectsOverlap(leftGeometry.labelRect, rightGeometry.photoRect, labelGap),
    rightLabelToLeftPhoto: rectsOverlap(rightGeometry.labelRect, leftGeometry.photoRect, labelGap),
    labelLabel: rectsOverlap(leftGeometry.labelRect, rightGeometry.labelRect, labelGap),
  };
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

test('solvePendingGroupPlacements expands group spacing for larger map views', () => {
  const compactMapRect = rect(-220, -180, 220, 180);
  const largeMapRect = rect(-520, -420, 520, 420);
  const safeGap = 96;
  const compactGroups = [
    buildGroup('left', '超长长标签测试甲乙丙丁戊己庚辛', rect(-180, -30, -60, 50), -120, 10, compactMapRect),
    buildGroup('center', '超长长标签测试甲乙丙丁戊己庚辛', rect(-60, -30, 60, 50), 0, 10, compactMapRect),
    buildGroup('right', '超长长标签测试甲乙丙丁戊己庚辛', rect(60, -30, 180, 50), 120, 10, compactMapRect),
  ];
  const largeGroups = [
    buildGroup('left', '超长长标签测试甲乙丙丁戊己庚辛', rect(-180, -30, -60, 50), -120, 10, largeMapRect),
    buildGroup('center', '超长长标签测试甲乙丙丁戊己庚辛', rect(-60, -30, 60, 50), 0, 10, largeMapRect),
    buildGroup('right', '超长长标签测试甲乙丙丁戊己庚辛', rect(60, -30, 180, 50), 120, 10, largeMapRect),
  ];

  const compactSolved = solvePendingGroupPlacements(compactGroups, compactMapRect, safeGap, 0, []);
  const largeSolved = solvePendingGroupPlacements(largeGroups, largeMapRect, safeGap, 0, []);
  const compactLeft = compactSolved.geometries.get('left');
  const compactCenter = compactSolved.geometries.get('center');
  const largeLeft = largeSolved.geometries.get('left');
  const largeCenter = largeSolved.geometries.get('center');

  assert.ok(compactLeft);
  assert.ok(compactCenter);
  assert.ok(largeLeft);
  assert.ok(largeCenter);
  assert.equal(
    rectsOverlap(largeLeft!.groupRect, largeCenter!.groupRect, Math.max(48, safeGap * 0.5)),
    false,
    'expected neighboring groups to stay separated in the larger view',
  );
  const compactDistance = Math.hypot(
    compactSolved.placements.get('left')!.centerX - compactSolved.placements.get('center')!.centerX,
    compactSolved.placements.get('left')!.centerY - compactSolved.placements.get('center')!.centerY,
  );
  const largeDistance = Math.hypot(
    largeSolved.placements.get('left')!.centerX - largeSolved.placements.get('center')!.centerX,
    largeSolved.placements.get('left')!.centerY - largeSolved.placements.get('center')!.centerY,
  );
  assert.ok(
    largeDistance > compactDistance,
    `expected larger map view to allow wider group spacing, got compact=${compactDistance} large=${largeDistance}`,
  );
});

test('solvePendingGroupPlacements keeps real fixture connector lines uncrossed', () => {
  const { pendingGroups, mapRect, safeGap, labelGapBoost } = fixture.solverInputSnapshot;

  const solved = solvePendingGroupPlacements(
    pendingGroups,
    mapRect,
    safeGap,
    labelGapBoost,
    [],
  );

  assert.equal(
    countPlacementLineCrossings(pendingGroups, solved.placements),
    0,
    'expected real fixture connector lines to remain uncrossed',
  );
});

test('corridor repair candidate subset keeps head candidates and samples deeper escapes', () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    placement: { centerX: index, centerY: index },
    geometry: buildGroupGeometryFromPhotoRect(
      rect(0, 0, 120, 80),
      `candidate-${index}`,
      1,
      1,
      undefined,
      0,
      rect(-200, -160, 200, 160),
    ),
    basePenalty: index,
  }));

  const subset = __layoutSolverInternals.buildCorridorRepairCandidateSubset(candidates);
  const pickedIndexes = subset.map((candidate) => candidate.basePenalty);

  assert.deepEqual(pickedIndexes.slice(0, 8), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(
    pickedIndexes.some((index) => index >= 8),
    `expected deeper repair sample beyond the first 8 candidates, got ${pickedIndexes.join(', ')}`,
  );
});

test('real fixture candidate pool already contains an early feasible pair for zhanjiang and maoming', () => {
  const { poolsByTitle } = buildRealFixtureCandidatePools();
  const leftCandidates = poolsByTitle.get('湛江市');
  const rightCandidates = poolsByTitle.get('茂名市');
  assert.ok(leftCandidates);
  assert.ok(rightCandidates);

  let foundEarlyFeasiblePair = false;
  for (let leftIndex = 0; leftIndex < Math.min(8, leftCandidates!.length); leftIndex++) {
    for (let rightIndex = 0; rightIndex < Math.min(8, rightCandidates!.length); rightIndex++) {
      const flags = countPairCollisionFlags(
        leftCandidates![leftIndex]!.geometry,
        rightCandidates![rightIndex]!.geometry,
        fixture.solverInputSnapshot.safeGap,
      );
      if (!flags.groupRect && !flags.leftLabelToRightPhoto && !flags.rightLabelToLeftPhoto && !flags.labelLabel) {
        foundEarlyFeasiblePair = true;
        break;
      }
    }
    if (foundEarlyFeasiblePair) break;
  }

  assert.equal(
    foundEarlyFeasiblePair,
    true,
    'expected an early feasible zhanjiang-maoming candidate pair inside the repair head subset',
  );
});

test('real fixture corridor repair subset now reaches the feasible chenzhou-dongguan dongguan candidate', () => {
  const { poolsByTitle } = buildRealFixtureCandidatePools();
  const leftCandidates = poolsByTitle.get('郴州市');
  const rightCandidates = poolsByTitle.get('东莞市');
  assert.ok(leftCandidates);
  assert.ok(rightCandidates);

  let firstFeasibleRightIndex = -1;
  for (let rightIndex = 0; rightIndex < rightCandidates!.length; rightIndex++) {
    const flags = countPairCollisionFlags(
      leftCandidates![0]!.geometry,
      rightCandidates![rightIndex]!.geometry,
      fixture.solverInputSnapshot.safeGap,
    );
    if (!flags.groupRect && !flags.leftLabelToRightPhoto && !flags.rightLabelToLeftPhoto && !flags.labelLabel) {
      firstFeasibleRightIndex = rightIndex;
      break;
    }
  }

  assert.equal(firstFeasibleRightIndex >= 8, true, `expected first feasible dongguan repair candidate to be deeper than head subset, got ${firstFeasibleRightIndex}`);

  const subset = __layoutSolverInternals.buildCorridorRepairCandidateSubset(rightCandidates!);
  const subsetIndexes = subset.map((candidate) => rightCandidates!.indexOf(candidate));
  assert.equal(
    subsetIndexes.includes(firstFeasibleRightIndex),
    true,
    `expected corridor repair subset to include feasible dongguan candidate ${firstFeasibleRightIndex}, got ${subsetIndexes.join(', ')}`,
  );
});

test('real fixture keeps zhanjiang and maoming separated after solver repair', () => {
  assert.deepEqual(
    getRealFixturePairConflictFlags('湛江市', '茂名市'),
    {
      groupRect: false,
      leftLabelToRightPhoto: false,
      rightLabelToLeftPhoto: false,
      labelLabel: false,
    },
  );
});

test('real fixture keeps chenzhou and dongguan separated after solver repair', () => {
  assert.deepEqual(
    getRealFixturePairConflictFlags('郴州市', '东莞市'),
    {
      groupRect: false,
      leftLabelToRightPhoto: false,
      rightLabelToLeftPhoto: false,
      labelLabel: false,
    },
  );
});

test('real fixture candidate pool already contains an early feasible pair for zhuhai and maoming', () => {
  const { poolsByTitle } = buildRealFixtureCandidatePools();
  const leftCandidates = poolsByTitle.get('珠海市');
  const rightCandidates = poolsByTitle.get('茂名市');
  assert.ok(leftCandidates);
  assert.ok(rightCandidates);

  let foundEarlyFeasiblePair = false;
  for (let leftIndex = 0; leftIndex < Math.min(8, leftCandidates!.length); leftIndex++) {
    for (let rightIndex = 0; rightIndex < Math.min(8, rightCandidates!.length); rightIndex++) {
      const flags = countPairCollisionFlags(
        leftCandidates![leftIndex]!.geometry,
        rightCandidates![rightIndex]!.geometry,
        fixture.solverInputSnapshot.safeGap,
      );
      if (!flags.groupRect && !flags.leftLabelToRightPhoto && !flags.rightLabelToLeftPhoto && !flags.labelLabel) {
        foundEarlyFeasiblePair = true;
        break;
      }
    }
    if (foundEarlyFeasiblePair) break;
  }

  assert.equal(
    foundEarlyFeasiblePair,
    true,
    'expected an early feasible zhuhai-maoming candidate pair inside the repair head subset',
  );
});

test('real fixture keeps zhuhai and maoming separated after solver repair', () => {
  assert.deepEqual(
    getRealFixturePairConflictFlags('珠海市', '茂名市'),
    {
      groupRect: false,
      leftLabelToRightPhoto: false,
      rightLabelToLeftPhoto: false,
      labelLabel: false,
    },
  );
});

test('real fixture keeps dali and kunming separated after solver repair', () => {
  assert.deepEqual(
    getRealFixturePairConflictFlags('大理市', '昆明市'),
    {
      groupRect: false,
      leftLabelToRightPhoto: false,
      rightLabelToLeftPhoto: false,
      labelLabel: false,
    },
  );
});

test('real fixture keeps nanyang and luoyang separated after solver repair', () => {
  assert.deepEqual(
    getRealFixturePairConflictFlags('南阳市', '洛阳市'),
    {
      groupRect: false,
      leftLabelToRightPhoto: false,
      rightLabelToLeftPhoto: false,
      labelLabel: false,
    },
  );
});

test('solver optimized branch keeps real fixture connector lines uncrossed before refinement fallback', () => {
  const { pendingGroups, mapRect, safeGap, labelGapBoost } = fixture.solverInputSnapshot;
  const basePlacements = buildRadialLayout(
    pendingGroups.map((group) => ({
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
  const baseSectorCounts = Array.from({ length: 16 }, () => 0);
  basePlacementById.forEach((placement) => {
    const angle = Math.atan2(placement.centerY, placement.centerX);
    const index = Math.min(15, Math.floor((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 16));
    baseSectorCounts[index] += 1;
  });

  const candidatePoolById = new Map();
  const sectorDensityById = new Map();
  const candidateCountById = new Map();
  for (const group of pendingGroups) {
    const basePlacement = basePlacementById.get(group.placeKey) ?? { centerX: 0, centerY: 0 };
    const sectorIndex = Math.min(15, Math.floor((((Math.atan2(basePlacement.centerY, basePlacement.centerX) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 16));
    const sectorDensity = baseSectorCounts[sectorIndex] ?? 0;
    sectorDensityById.set(group.placeKey, sectorDensity);
    const candidates = __layoutSolverInternals.buildCandidatePool(group, basePlacement, mapRect, sectorDensity);
    candidatePoolById.set(group.placeKey, candidates);
    candidateCountById.set(group.placeKey, candidates.length);
  }

  const orderedGroups = [...pendingGroups].sort((left, right) => {
    const leftSectorDensity = sectorDensityById.get(left.placeKey) ?? 0;
    const rightSectorDensity = sectorDensityById.get(right.placeKey) ?? 0;
    if (leftSectorDensity !== rightSectorDensity) return rightSectorDensity - leftSectorDensity;

    const leftCandidateCount = candidateCountById.get(left.placeKey) ?? Number.POSITIVE_INFINITY;
    const rightCandidateCount = candidateCountById.get(right.placeKey) ?? Number.POSITIVE_INFINITY;
    if (leftCandidateCount !== rightCandidateCount) return leftCandidateCount - rightCandidateCount;

    const leftPlacement = basePlacementById.get(left.placeKey);
    const rightPlacement = basePlacementById.get(right.placeKey);
    const leftRadius = leftPlacement ? Math.hypot(leftPlacement.centerX, leftPlacement.centerY) : 0;
    const rightRadius = rightPlacement ? Math.hypot(rightPlacement.centerX, rightPlacement.centerY) : 0;
    if (Math.abs(rightRadius - leftRadius) > 1e-6) return rightRadius - leftRadius;

    const leftArea =
      Math.max(1, left.collisionRect.right - left.collisionRect.left) *
      Math.max(1, left.collisionRect.bottom - left.collisionRect.top);
    const rightArea =
      Math.max(1, right.collisionRect.right - right.collisionRect.left) *
      Math.max(1, right.collisionRect.bottom - right.collisionRect.top);
    if (Math.abs(rightArea - leftArea) > 1e-6) return rightArea - leftArea;

    return left.placeKey.localeCompare(right.placeKey, 'zh-CN');
  });

  const assignedState = __layoutSolverInternals.assignInitialPlacements(
    orderedGroups,
    candidatePoolById,
    [],
    safeGap,
  );
  const workingState = assignedState ?? {
    placementById: new Map(basePlacementById),
    geometryById: new Map(),
    candidateIndexById: new Map(),
  };

  __layoutSolverInternals.optimizeAssignments(
    orderedGroups,
    candidatePoolById,
    workingState,
    [],
    safeGap,
  );
  __layoutSolverInternals.improveCorridorRisk(
    orderedGroups,
    candidatePoolById,
    workingState,
    mapRect,
    safeGap,
    labelGapBoost,
    [],
  );

  assert.equal(
    __layoutSolverInternals.countPlacementLineCrossings(orderedGroups, workingState.placementById),
    0,
    'expected optimized branch to remain uncrossed before refinement fallback',
  );
});

test('assignInitialPlacements finds a usable real-fixture initial solution before fallback repair', () => {
  const { pendingGroups, mapRect, safeGap } = fixture.solverInputSnapshot;
  const basePlacements = buildRadialLayout(
    pendingGroups.map((group) => ({
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
  const baseSectorCounts = Array.from({ length: 16 }, () => 0);
  basePlacementById.forEach((placement) => {
    const angle = Math.atan2(placement.centerY, placement.centerX);
    const index = Math.min(
      15,
      Math.floor((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 16),
    );
    baseSectorCounts[index] += 1;
  });

  const candidatePoolById = new Map();
  const sectorDensityById = new Map();
  const candidateCountById = new Map();
  for (const group of pendingGroups) {
    const basePlacement = basePlacementById.get(group.placeKey) ?? { centerX: 0, centerY: 0 };
    const sectorIndex = Math.min(
      15,
      Math.floor((((Math.atan2(basePlacement.centerY, basePlacement.centerX) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 16),
    );
    const sectorDensity = baseSectorCounts[sectorIndex] ?? 0;
    sectorDensityById.set(group.placeKey, sectorDensity);
    const candidates = __layoutSolverInternals.buildCandidatePool(group, basePlacement, mapRect, sectorDensity);
    candidatePoolById.set(group.placeKey, candidates);
    candidateCountById.set(group.placeKey, candidates.length);
  }

  const orderedGroups = [...pendingGroups].sort((left, right) => {
    const leftSectorDensity = sectorDensityById.get(left.placeKey) ?? 0;
    const rightSectorDensity = sectorDensityById.get(right.placeKey) ?? 0;
    if (leftSectorDensity !== rightSectorDensity) return rightSectorDensity - leftSectorDensity;

    const leftCandidateCount = candidateCountById.get(left.placeKey) ?? Number.POSITIVE_INFINITY;
    const rightCandidateCount = candidateCountById.get(right.placeKey) ?? Number.POSITIVE_INFINITY;
    if (leftCandidateCount !== rightCandidateCount) return leftCandidateCount - rightCandidateCount;

    const leftPlacement = basePlacementById.get(left.placeKey);
    const rightPlacement = basePlacementById.get(right.placeKey);
    const leftRadius = leftPlacement ? Math.hypot(leftPlacement.centerX, leftPlacement.centerY) : 0;
    const rightRadius = rightPlacement ? Math.hypot(rightPlacement.centerX, rightPlacement.centerY) : 0;
    if (Math.abs(rightRadius - leftRadius) > 1e-6) return rightRadius - leftRadius;

    const leftArea =
      Math.max(1, left.collisionRect.right - left.collisionRect.left) *
      Math.max(1, left.collisionRect.bottom - left.collisionRect.top);
    const rightArea =
      Math.max(1, right.collisionRect.right - right.collisionRect.left) *
      Math.max(1, right.collisionRect.bottom - right.collisionRect.top);
    if (Math.abs(rightArea - leftArea) > 1e-6) return rightArea - leftArea;

    return left.placeKey.localeCompare(right.placeKey, 'zh-CN');
  });

  const assignedState = __layoutSolverInternals.assignInitialPlacements(
    orderedGroups,
    candidatePoolById,
    [],
    safeGap,
  );

  assert.ok(
    assignedState,
    'expected initial assignment to find a real-fixture solution instead of falling back immediately',
  );
  assert.equal(
    __layoutSolverInternals.countPlacementLineCrossings(
      orderedGroups,
      assignedState!.placementById,
    ),
    0,
    'expected initial assignment result to keep real-fixture connector lines uncrossed',
  );
});
