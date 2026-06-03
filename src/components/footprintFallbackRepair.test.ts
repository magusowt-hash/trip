import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFallbackRepairSteps,
  expandPlacementAlongRay,
} from './footprintFallbackRepair.ts';

test('fallback repair expands outward in increasing steps', () => {
  assert.deepEqual(buildFallbackRepairSteps(), [80, 140, 220, 320, 440, 580, 760]);
});

test('expandPlacementAlongRay preserves angle while increasing radius', () => {
  const next = expandPlacementAlongRay({ centerX: 300, centerY: 400 }, 200);

  assert.ok(next.centerX > 300);
  assert.ok(next.centerY > 400);
  assert.equal(Math.round(Math.atan2(next.centerY, next.centerX) * 1000), Math.round(Math.atan2(400, 300) * 1000));
});
