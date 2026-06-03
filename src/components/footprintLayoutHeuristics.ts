export function scoreMapDistanceBand(
  mapDistance: number,
  safeGap: number,
) {
  const minPreferred = safeGap;
  const maxPreferred = safeGap + 220;

  if (mapDistance < minPreferred) {
    const deficit = minPreferred - mapDistance;
    return deficit * deficit * 0.9;
  }

  if (mapDistance > maxPreferred) {
    const overflow = mapDistance - maxPreferred;
    return overflow * overflow * 0.08;
  }

  return 0;
}
