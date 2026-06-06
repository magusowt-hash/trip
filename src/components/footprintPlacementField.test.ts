import test from 'node:test';
import assert from 'node:assert/strict';

import type { PendingPlaceGroup } from './footprintLayoutTypes.ts';
import { buildGroupGeometryFromPhotoRect } from './localMapGroupGeometry.ts';
import {
  buildBlockedBandFromGeometry,
  computeFreeArcsAtRadius,
  findPlacementInField,
  resolvePlacementSector,
  scoreFreeArcAccess,
  scoreFreeArcStructure,
} from './footprintPlacementField.ts';

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom };
}

function buildGroup(
  placeKey: string,
  title: string,
  photoRect: { left: number; top: number; right: number; bottom: number },
  logicalX: number,
  logicalY: number,
): PendingPlaceGroup {
  const geometry = buildGroupGeometryFromPhotoRect(photoRect, title, 1, 1, 'top', 0);
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
    offsets: [{ offsetX: 0, offsetY: 0 }],
  };
}

test('findPlacementInField prefers the first feasible inner radius instead of inheriting farther neighbor depth', () => {
  const leftNeighbor = buildGroupGeometryFromPhotoRect(rect(-120, -40, 0, 40), '左邻居', 1, 1, 'top', 0);
  const rightNeighbor = buildGroupGeometryFromPhotoRect(rect(0, -40, 120, 40), '右邻居', 1, 1, 'top', 0);
  const blockedBands = [
    buildBlockedBandFromGeometry(leftNeighbor, 32),
    buildBlockedBandFromGeometry(rightNeighbor, 32),
  ];
  const group = buildGroup('self', '当前组', rect(-60, -30, 60, 50), 0, 0);

  const freeAtInnerRadius = computeFreeArcsAtRadius(blockedBands, 180);
  assert.ok(freeAtInnerRadius.length > 0, 'expected an inner free arc before searching');

  const result = findPlacementInField(group, group.collisionGeometry, blockedBands, {
    idealAngle: Math.PI / 2,
    idealRadius: 180,
    minRadius: 180,
    radiusStep: 24,
    radiusScanLimit: 4,
  });

  assert.ok(result.candidate, 'expected a field placement candidate');
  assert.equal(result.candidate!.radius, 204, 'expected the first feasible inner radius to win');
  assert.ok(result.candidates.length > 0, 'expected ranked field candidates to be returned');
  const freeArcCenter = (result.candidate!.freeArc.angleStart + result.candidate!.freeArc.angleEnd) * 0.5;
  assert.ok(
    Math.abs(result.candidate!.angle - freeArcCenter) < Math.PI / 12,
    'expected selected angle to stay near the free-arc center',
  );
});

test('resolvePlacementSector treats lower side corners as transition sectors instead of full lower-region carriers', () => {
  const rightTransition = resolvePlacementSector(Math.PI / 4);
  const lowerCore = resolvePlacementSector(Math.PI / 2);
  const leftTransition = resolvePlacementSector((Math.PI * 3) / 4);

  assert.equal(rightTransition.isTransition, true);
  assert.equal(lowerCore.isTransition, false);
  assert.equal(leftTransition.isTransition, true);
});

test('findPlacementInField stays inside the resolved sector instead of jumping across the full ring', () => {
  const group = buildGroup('sector', '分区组', rect(-60, -30, 60, 50), 180, 180);
  const result = findPlacementInField(group, group.collisionGeometry, [], {
    idealAngle: Math.PI / 4,
    idealRadius: 220,
    minRadius: 220,
    radiusStep: 20,
    radiusScanLimit: 2,
  });

  assert.ok(result.candidate);
  const sector = resolvePlacementSector(Math.PI / 4);
  assert.ok(
    result.candidate!.angle >= sector.start || result.candidate!.angle <= sector.end,
    'expected candidate angle to stay within the transition sector bounds',
  );
});

test('findPlacementInField can settle inside the search floor instead of inheriting a farther layer target', () => {
  const group = buildGroup('inner', '靠内组', rect(-50, -30, 50, 40), 120, 40);
  const result = findPlacementInField(group, group.collisionGeometry, [], {
    idealAngle: Math.atan2(40, 120),
    idealRadius: 260,
    minRadius: 180,
    radiusStep: 20,
    radiusScanLimit: 6,
  });

  assert.ok(result.candidate);
  assert.equal(
    result.candidate!.radius,
    180,
    'expected search to honor the first feasible inner radius instead of sticking to the farther target radius',
  );
});

test('findPlacementInField respects an inner-radius floor from prior occupancy rather than a farther notional layer radius', () => {
  const group = buildGroup('floor', '内边界组', rect(-50, -30, 50, 40), 120, 40);
  const result = findPlacementInField(group, group.collisionGeometry, [], {
    idealAngle: Math.atan2(40, 120),
    idealRadius: 340,
    minRadius: 210,
    radiusStep: 20,
    radiusScanLimit: 6,
  });

  assert.ok(result.candidate);
  assert.equal(
    result.candidate!.radius,
    210,
    'expected the search floor to act as the controlling radius instead of a farther target radius',
  );
});

test('findPlacementInField prefers a balanced interior angle over hugging one free-arc boundary', () => {
  const group = buildGroup('balanced', '平衡组', rect(-50, -30, 50, 40), 0, 0);
  const result = findPlacementInField(group, group.collisionGeometry, [], {
    idealAngle: Math.PI / 2,
    idealRadius: 220,
    minRadius: 220,
    radiusStep: 20,
    radiusScanLimit: 2,
    sectorStart: Math.PI / 3,
    sectorEnd: (Math.PI * 2) / 3,
  });

  assert.ok(result.candidate);
  const leftMargin = result.candidate!.angle - result.candidate!.freeArc.angleStart;
  const rightMargin = result.candidate!.freeArc.angleEnd - result.candidate!.angle;
  assert.ok(
    Math.abs(leftMargin - rightMargin) < Math.PI / 18,
    'expected the chosen angle to stay near the balance point instead of hugging a boundary',
  );
});

test('findPlacementInField compares multiple free arcs on the same radius instead of returning the first one blindly', () => {
  const group = buildGroup('multi-arc', '多弧组', rect(-50, -30, 50, 40), 0, 0);
  const blockedBands = [
    { angleStart: 0, angleEnd: 0.9, radiusInner: 180, radiusOuter: 260 },
    { angleStart: 1.2, angleEnd: 1.45, radiusInner: 180, radiusOuter: 260 },
    { angleStart: 2.2, angleEnd: Math.PI * 2, radiusInner: 180, radiusOuter: 260 },
  ];
  const result = findPlacementInField(group, group.collisionGeometry, blockedBands, {
    idealAngle: Math.PI / 2,
    idealRadius: 220,
    minRadius: 220,
    radiusStep: 20,
    radiusScanLimit: 1,
    sectorStart: 0,
    sectorEnd: 2.2,
  });

  assert.ok(result.candidate);
  assert.ok(
    result.candidate!.angle > 1.45 && result.candidate!.angle < 2.2,
    'expected the search to choose the better-balanced later free arc instead of the first legal arc',
  );
  assert.ok(
    result.candidates.length >= 2,
    'expected same-radius alternatives to remain available for layered evaluation',
  );
  assert.ok(
    result.candidates.every((candidate) => candidate.freeArc.angleEnd - candidate.freeArc.angleStart > 0),
    'expected field candidates to preserve their supporting occupancy arc instead of collapsing to a bare point',
  );
});

test('findPlacementInField preserves multiple angle options within one wide free arc for later layered coordination', () => {
  const group = buildGroup('wide-arc', '宽弧组', rect(-50, -30, 50, 40), 0, 0);
  const result = findPlacementInField(group, group.collisionGeometry, [], {
    idealAngle: Math.PI,
    idealRadius: 320,
    minRadius: 320,
    maxRadius: 320,
    radiusStep: 20,
    radiusScanLimit: 0,
    sectorStart: Math.PI * 0.75,
    sectorEnd: Math.PI * 1.25,
  });

  const sameRadiusAngles = [...new Set(
    result.candidates
      .filter((candidate) => Math.abs(candidate.radius - 320) < 1e-6)
      .map((candidate) => Number(candidate.angle.toFixed(6))),
  )];

  assert.ok(
    sameRadiusAngles.length >= 3,
    `expected multiple same-radius angle options inside one free arc, got ${sameRadiusAngles.join(', ')}`,
  );
});

test('findPlacementInField shrinks required occupancy span when scanning outward radii', () => {
  const group = buildGroup('outward-span', '外扫组', rect(-176.5, -112, 176.5, 144.2), 202.5763379274452, -153.98268040400765);
  const blockedBands = [
    { angleStart: 2.795678420149189, angleEnd: 3.393190669189437, radiusInner: 0, radiusOuter: 20000 },
  ];

  const result = findPlacementInField(group, group.collisionGeometry, blockedBands, {
    idealAngle: Math.atan2(group.logicalY, group.logicalX),
    idealRadius: 303.1279658418274,
    minRadius: 180,
    maxRadius: 7000,
    radiusStep: 273.4459748897578,
    radiusScanLimit: 24,
    sectorStart: 2.670353755551324,
    sectorEnd: 3.9269908169872414,
  });

  assert.ok(
    result.trace.some((step) => step.radius > 700 && step.candidateCount > 0),
    'expected the outward scan to eventually produce legal candidates on larger radii',
  );
  assert.ok(result.candidate, 'expected a candidate once the outward radius makes the occupancy span small enough');
  assert.ok(
    result.candidate!.radius > 700,
    `expected outward candidate to be found on a larger radius, got ${result.candidate!.radius}`,
  );
});

test('scoreFreeArcStructure penalizes fragmented and narrow corridor layouts', () => {
  const smooth = scoreFreeArcStructure([
    { angleStart: 0.8, angleEnd: 1.6 },
  ]);
  const fragmented = scoreFreeArcStructure([
    { angleStart: 0.8, angleEnd: 1.0 },
    { angleStart: 1.15, angleEnd: 1.35 },
    { angleStart: 1.5, angleEnd: 1.6 },
  ]);

  assert.ok(
    fragmented.total > smooth.total,
    'expected fragmented narrow corridors to score worse than one smooth corridor',
  );
});

test('scoreFreeArcAccess favors a corridor that can host the group near its own ideal angle', () => {
  const nearIdeal = scoreFreeArcAccess([
    { angleStart: 1.1, angleEnd: 1.9 },
  ], Math.PI / 2, 0.35);
  const displaced = scoreFreeArcAccess([
    { angleStart: 0.1, angleEnd: 0.5 },
    { angleStart: 2.2, angleEnd: 2.7 },
  ], Math.PI / 2, 0.35);

  assert.ok(
    nearIdeal.total < displaced.total,
    'expected access scoring to prefer a corridor that fits near the group ideal angle',
  );
});
