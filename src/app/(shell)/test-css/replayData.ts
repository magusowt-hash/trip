export type ReplaySnapshot = {
  exportedAt: string;
  selectedGroupId: number | null;
  selectedGroupName: string;
  pageState: {
    items: Array<Record<string, unknown>>;
    poiPoints: Array<Record<string, unknown>>;
    groupLayouts: Array<Record<string, unknown>>;
    photos: Array<Record<string, unknown>>;
  };
  solverInputSnapshot: {
    viewportWidth: number;
    viewportHeight: number;
    mapRect: { left: number; right: number; top: number; bottom: number };
    safeGap: number;
    labelGapBoost: number;
    collisionScale: number;
    layout: Record<string, unknown>;
    lockedGroups: Array<Record<string, unknown>>;
    pendingGroups: Array<Record<string, unknown>>;
  };
};

export function buildReplaySnapshot(input: ReplaySnapshot): ReplaySnapshot {
  return input;
}
