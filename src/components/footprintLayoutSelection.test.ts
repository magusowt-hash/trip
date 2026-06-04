import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseFinalPlacementVariant } from './footprintLayoutSelection.ts';

test('chooseFinalPlacementVariant keeps the conflict-free optimized result over a refined result with hard conflicts', () => {
  const choice = chooseFinalPlacementVariant({
    refinedHasHardConflicts: true,
    optimizedHasHardConflicts: false,
    refinedCorridorRisk: 1,
    optimizedCorridorRisk: 2,
    refinedEnvelopeScore: 1000,
    optimizedEnvelopeScore: 1200,
  });

  assert.equal(choice, 'optimized');
});

test('chooseFinalPlacementVariant prefers refined when it removes hard conflicts', () => {
  const choice = chooseFinalPlacementVariant({
    refinedHasHardConflicts: false,
    optimizedHasHardConflicts: true,
    refinedCorridorRisk: 4,
    optimizedCorridorRisk: 0,
    refinedEnvelopeScore: 1000,
    optimizedEnvelopeScore: 900,
  });

  assert.equal(choice, 'refined');
});
