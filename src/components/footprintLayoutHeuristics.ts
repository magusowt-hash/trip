export function scoreMapDistanceBand(
  mapDistance: number,
  safeGap: number,
) {
  const minPreferred = safeGap + 48;
  const maxPreferred = safeGap + 220;

  if (mapDistance < minPreferred) {
    const deficit = minPreferred - mapDistance;
    return deficit * deficit * 1.8;
  }

  if (mapDistance > maxPreferred) {
    const overflow = mapDistance - maxPreferred;
    return overflow * overflow * 0.18;
  }

  return 0;
}
