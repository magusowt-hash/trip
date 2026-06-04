export function chooseCoordinationVariant(input: {
  baselineStrictConflicts: number;
  bestStrictConflicts: number;
  trialStrictConflicts: number;
  bestScore: number;
  trialScore: number;
  bestGlobalEnergy: number;
  trialGlobalEnergy: number;
  bestTotalRadius: number;
  trialTotalRadius: number;
  baselineOuterShellImproved: boolean;
  trialOuterShellImproved: boolean;
}) {
  const {
    baselineStrictConflicts,
    bestStrictConflicts,
    trialStrictConflicts,
    bestScore,
    trialScore,
    bestGlobalEnergy,
    trialGlobalEnergy,
    bestTotalRadius,
    trialTotalRadius,
    baselineOuterShellImproved,
    trialOuterShellImproved,
  } = input;

  if (trialStrictConflicts < bestStrictConflicts) return true;
  if (trialStrictConflicts > bestStrictConflicts) return false;

  if (bestStrictConflicts > baselineStrictConflicts) return false;

  return (
    trialScore < bestScore - 1e-6 &&
    trialGlobalEnergy < bestGlobalEnergy - 0.5 &&
    trialTotalRadius < bestTotalRadius - 2 &&
    (!baselineOuterShellImproved || trialOuterShellImproved)
  );
}
