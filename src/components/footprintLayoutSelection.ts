export function chooseFinalPlacementVariant(input: {
  refinedHasHardConflicts: boolean;
  optimizedHasHardConflicts: boolean;
  refinedCorridorRisk: number;
  optimizedCorridorRisk: number;
  refinedEnvelopeScore: number;
  optimizedEnvelopeScore: number;
}) {
  const {
    refinedHasHardConflicts,
    optimizedHasHardConflicts,
    refinedCorridorRisk,
    optimizedCorridorRisk,
    refinedEnvelopeScore,
    optimizedEnvelopeScore,
  } = input;

  if (refinedHasHardConflicts !== optimizedHasHardConflicts) {
    return refinedHasHardConflicts ? 'optimized' : 'refined';
  }

  const shouldUseRefined =
    (refinedCorridorRisk < optimizedCorridorRisk) ||
    (
      refinedCorridorRisk === optimizedCorridorRisk &&
      !refinedHasHardConflicts &&
      !optimizedHasHardConflicts &&
      refinedEnvelopeScore <= optimizedEnvelopeScore * 1.04
    ) ||
    (
      refinedCorridorRisk === optimizedCorridorRisk &&
      refinedHasHardConflicts &&
      optimizedHasHardConflicts &&
      refinedEnvelopeScore < optimizedEnvelopeScore
    );

  return shouldUseRefined ? 'refined' : 'optimized';
}
