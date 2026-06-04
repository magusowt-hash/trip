import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCoordinationVariant } from './footprintCoordinationPriority.ts';

test('chooseCoordinationVariant prefers lower strict conflicts even when total radius grows', () => {
  const choice = chooseCoordinationVariant({
    baselineStrictConflicts: 2,
    bestStrictConflicts: 2,
    trialStrictConflicts: 0,
    bestScore: 1000,
    trialScore: 1100,
    bestGlobalEnergy: 800,
    trialGlobalEnergy: 860,
    bestTotalRadius: 5000,
    trialTotalRadius: 5600,
    baselineOuterShellImproved: false,
    trialOuterShellImproved: false,
  });

  assert.equal(choice, true);
});

test('chooseCoordinationVariant keeps compaction preference only when strict conflicts are tied', () => {
  const choice = chooseCoordinationVariant({
    baselineStrictConflicts: 0,
    bestStrictConflicts: 0,
    trialStrictConflicts: 0,
    bestScore: 1000,
    trialScore: 999,
    bestGlobalEnergy: 800,
    trialGlobalEnergy: 780,
    bestTotalRadius: 5000,
    trialTotalRadius: 4950,
    baselineOuterShellImproved: true,
    trialOuterShellImproved: true,
  });

  assert.equal(choice, true);
});
