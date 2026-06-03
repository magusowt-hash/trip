import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreMapDistanceBand } from './footprintLayoutHeuristics.ts';

test('scoreMapDistanceBand strongly penalizes candidates that are too close to the protected map edge', () => {
  const safeGap = 128;
  const ideal = scoreMapDistanceBand(safeGap + 48, safeGap);
  const tooClose = scoreMapDistanceBand(safeGap - 12, safeGap);

  assert.equal(ideal, 0);
  assert.ok(tooClose > ideal);
  assert.ok(tooClose > 1000);
});

test('scoreMapDistanceBand lightly penalizes candidates that drift too far outward', () => {
  const safeGap = 128;
  const compact = scoreMapDistanceBand(safeGap + 84, safeGap);
  const stretched = scoreMapDistanceBand(safeGap + 280, safeGap);

  assert.equal(compact, 0);
  assert.ok(stretched > compact);
  assert.ok(stretched < scoreMapDistanceBand(safeGap - 12, safeGap));
});
