import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOccupiedGeometryGapPolicy,
  geometryOverlapsOccupiedWithGapPolicy,
} from './footprintCollisionSpacing.ts';

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom };
}

test('occupied geometry gap policy scales with safe gap instead of fixed small constants', () => {
  const compact = buildOccupiedGeometryGapPolicy(10);
  const roomy = buildOccupiedGeometryGapPolicy(128);

  assert.ok(roomy.photoGap > compact.photoGap);
  assert.ok(roomy.labelPhotoGap > compact.labelPhotoGap);
  assert.ok(roomy.labelGap > compact.labelGap);
});

test('geometry overlap check respects the requested safe gap for label to photo clearance', () => {
  const candidate = {
    photoRect: rect(0, 0, 80, 80),
    labelRect: rect(96, 0, 176, 24),
  };
  const occupied = [{
    photoRect: rect(200, 0, 280, 80),
    labelRect: rect(200, 96, 280, 120),
  }];

  const smallGapOverlap = geometryOverlapsOccupiedWithGapPolicy(
    candidate,
    occupied,
    buildOccupiedGeometryGapPolicy(10),
  );
  const largeGapOverlap = geometryOverlapsOccupiedWithGapPolicy(
    candidate,
    occupied,
    buildOccupiedGeometryGapPolicy(128),
  );

  assert.equal(smallGapOverlap, false);
  assert.equal(largeGapOverlap, true);
});
