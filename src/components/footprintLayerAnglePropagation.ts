export type LayerAngleEntry = {
  placeKey: string;
  angle: number;
  sizeScore: number;
};

export type LayerAngleLayer = {
  index: number;
  minAngularGap: number;
  entries: LayerAngleEntry[];
};

export type PropagatedLayerAngle = {
  placeKey: string;
  angle: number;
  reservedSpan: number;
  startAngle: number;
  endAngle: number;
};

const FULL_TURN = Math.PI * 2;

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_TURN;
  return normalized >= 0 ? normalized : normalized + FULL_TURN;
}

function angleDelta(left: number, right: number) {
  let delta = normalizeAngle(left) - normalizeAngle(right);
  if (delta > Math.PI) delta -= FULL_TURN;
  if (delta < -Math.PI) delta += FULL_TURN;
  return delta;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unwrapAngles(entries: LayerAngleEntry[]) {
  if (entries.length === 0) return [] as Array<LayerAngleEntry & { unwrappedAngle: number }>;

  const sorted = [...entries].sort((left, right) => normalizeAngle(left.angle) - normalizeAngle(right.angle));
  let largestGap = -1;
  let breakIndex = 0;
  for (let index = 0; index < sorted.length; index++) {
    const current = normalizeAngle(sorted[index]!.angle);
    const next = normalizeAngle(sorted[(index + 1) % sorted.length]!.angle);
    const gap = index === sorted.length - 1
      ? next + FULL_TURN - current
      : next - current;
    if (gap > largestGap) {
      largestGap = gap;
      breakIndex = (index + 1) % sorted.length;
    }
  }

  const rotated = sorted.slice(breakIndex).concat(sorted.slice(0, breakIndex));
  const base = normalizeAngle(rotated[0]!.angle);
  let previous = base;
  return rotated.map((entry, index) => {
    if (index === 0) {
      return { ...entry, unwrappedAngle: base };
    }
    let next = normalizeAngle(entry.angle);
    while (next < previous) {
      next += FULL_TURN;
    }
    previous = next;
    return { ...entry, unwrappedAngle: next };
  });
}

function buildOuterLoadMap(layers: LayerAngleLayer[]) {
  const loadByKey = new Map<string, { outwardCount: number; outwardArea: number }>();
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]!;
    const outerLayers = layers.slice(layerIndex + 1);
    for (const entry of layer.entries) {
      let outwardCount = 0;
      let outwardArea = 0;
      const influenceWindow = Math.max(layer.minAngularGap * 2.8, Math.PI / 4);
      for (const outerLayer of outerLayers) {
        for (const outerEntry of outerLayer.entries) {
          const gap = Math.abs(angleDelta(outerEntry.angle, entry.angle));
          if (gap > influenceWindow) continue;
          outwardCount += 1;
          outwardArea += outerEntry.sizeScore;
        }
      }
      loadByKey.set(entry.placeKey, { outwardCount, outwardArea });
    }
  }
  return loadByKey;
}

function normalizeWindowsToSingleBranch(
  windows: Array<{
    placeKey: string;
    reservedSpan: number;
    startAngle: number;
    endAngle: number;
  }>,
  minAngularGap: number,
) {
  if (windows.length === 0) return windows;

  const minStart = Math.min(...windows.map((window) => window.startAngle));
  const maxEnd = Math.max(...windows.map((window) => window.endAngle));
  if (maxEnd - minStart >= Math.PI) {
    return windows;
  }

  const branchMargin = Math.max(Math.PI / 90, minAngularGap * 0.08);
  const branchMin = -Math.PI + branchMargin;
  const branchMax = Math.PI - branchMargin;

  let shift = 0;
  if (maxEnd > branchMax) {
    shift = maxEnd - branchMax;
  } else if (minStart < branchMin) {
    shift = minStart - branchMin;
  }
  if (Math.abs(shift) < 1e-6) return windows;

  return windows.map((window) => ({
    placeKey: window.placeKey,
    reservedSpan: window.reservedSpan,
    startAngle: window.startAngle - shift,
    endAngle: window.endAngle - shift,
  }));
}

export function propagateLayerAngles(
  layers: LayerAngleLayer[],
) {
  const propagated = new Map<string, PropagatedLayerAngle>();
  const outwardLoadByKey = buildOuterLoadMap(layers);

  for (const layer of layers) {
    const entries = unwrapAngles(layer.entries);
    if (entries.length === 0) continue;

    const planned = entries.map((entry) => {
      const outwardLoad = outwardLoadByKey.get(entry.placeKey) ?? { outwardCount: 0, outwardArea: 0 };
      const ownUnits = clamp(entry.sizeScore / 70000, 0.7, 2.6);
      const outwardUnits = clamp(
        outwardLoad.outwardCount * 0.75 + outwardLoad.outwardArea / 90000,
        0,
        4.8,
      );
      return {
        ...entry,
        reservedUnits: ownUnits + outwardUnits,
      };
    });

    const anchors = planned.map((entry) => entry.unwrappedAngle);
    const sourceSpan = Math.max(
      layer.minAngularGap * Math.max(0, planned.length - 1),
      anchors[anchors.length - 1]! - anchors[0]!,
    );
    const targetSpan = Math.max(
      sourceSpan,
      layer.minAngularGap * planned.reduce((sum, entry) => sum + entry.reservedUnits, 0),
    );
    const anchorCenter = anchors.reduce((sum, angle) => sum + angle, 0) / anchors.length;
    const startAngle = anchorCenter - targetSpan * 0.5;
    const unitAngle = targetSpan / Math.max(
      planned.reduce((sum, entry) => sum + entry.reservedUnits, 0),
      1e-6,
    );

    const windows = planned.map((entry) => {
      const offsetUnits = planned
        .slice(0, planned.findIndex((candidate) => candidate.placeKey === entry.placeKey))
        .reduce((sum, candidate) => sum + candidate.reservedUnits, 0);
      const rawStart = startAngle + offsetUnits * unitAngle;
      const rawSpan = entry.reservedUnits * unitAngle;
      const desiredCenter = entry.unwrappedAngle;
      const rawCenter = rawStart + rawSpan * 0.5;
      const maxShift = Math.max(layer.minAngularGap * 0.42, Math.PI / 40);
      const centerShift = clamp(desiredCenter - rawCenter, -maxShift, maxShift);
      return {
        placeKey: entry.placeKey,
        reservedSpan: rawSpan,
        startAngle: rawStart + centerShift,
        endAngle: rawStart + rawSpan + centerShift,
      };
    });

    const orderedWindows = windows.map((window, index) => {
      if (index === 0) return window;
      const previous = windows[index - 1]!;
      const minimumGap = layer.minAngularGap * 0.18;
      if (window.startAngle >= previous.endAngle + minimumGap) return window;
      const shift = previous.endAngle + minimumGap - window.startAngle;
      return {
        ...window,
        startAngle: window.startAngle + shift,
        endAngle: window.endAngle + shift,
      };
    });

    const normalizedWindows = normalizeWindowsToSingleBranch(
      orderedWindows,
      layer.minAngularGap,
    );

    for (const window of normalizedWindows) {
      const center = (window.startAngle + window.endAngle) * 0.5;
      propagated.set(window.placeKey, {
        placeKey: window.placeKey,
        angle: normalizeAngle(center),
        reservedSpan: window.reservedSpan,
        startAngle: normalizeAngle(window.startAngle),
        endAngle: normalizeAngle(window.endAngle),
      });
    }
  }

  return propagated;
}
