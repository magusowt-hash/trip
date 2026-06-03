import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreMapDistanceBand } from './footprintLayoutHeuristics.ts';

test('scoreMapDistanceBand does not punish candidates that are already just outside the protected map edge', () => {
  const safeGap = 128;
  const edgeAligned = scoreMapDistanceBand(safeGap + 12, safeGap);
  const compact = scoreMapDistanceBand(safeGap + 84, safeGap);

  assert.equal(edgeAligned, 0);
  assert.equal(compact, 0);
});

test('scoreMapDistanceBand lightly penalizes candidates that drift too far outward', () => {
  const safeGap = 128;
  const compact = scoreMapDistanceBand(safeGap + 84, safeGap);
  const stretched = scoreMapDistanceBand(safeGap + 280, safeGap);

  assert.equal(compact, 0);
  assert.ok(stretched > compact);
  assert.ok(stretched > 0);
});
