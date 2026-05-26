'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';

type TestPoint = {
  id: number;
  x: number;
  y: number;
};

type LayoutGroup = TestPoint & {
  order: number;
  theta: number;
  displayTheta: number;
  slotMin: number;
  slotMax: number;
  layoutX: number;
  layoutY: number;
};

type Segment = {
  from: TestPoint;
  to: LayoutGroup;
};

const STAGE_SIZE = 880;
const MAP_SIZE = 420;
const LAYOUT_RADIUS = 300;
const GROUP_RADIUS = 28;

function normalizeRadians(angle: number) {
  let next = angle;
  while (next <= -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

function unwrapAngles(angles: number[]) {
  if (angles.length === 0) return [] as number[];
  const unwrapped = [angles[0]];
  for (let i = 1; i < angles.length; i++) {
    let next = angles[i];
    while (next < unwrapped[i - 1]) next += Math.PI * 2;
    unwrapped.push(next);
  }
  return unwrapped;
}

function buildRandomPoints(count: number) {
  const points: TestPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      id: i + 1,
      x: Math.random() * MAP_SIZE - MAP_SIZE / 2,
      y: Math.random() * MAP_SIZE - MAP_SIZE / 2,
    });
  }
  return points;
}

function distance(a: TestPoint, b: TestPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orientationCross(a: TestPoint, b: TestPoint, c: TestPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function polygonArea(points: TestPoint[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function computePolygonCentroid(points: TestPoint[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  const area = polygonArea(points);
  if (Math.abs(area) < 1e-6) {
    return computeCenterOfPoints(points);
  }

  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * factor;
    y += (current.y + next.y) * factor;
  }

  return {
    x: x / (6 * area),
    y: y / (6 * area),
  };
}

function rotateToBestStart(points: TestPoint[]) {
  if (points.length === 0) return [];
  let bestIndex = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].id < points[bestIndex].id) bestIndex = i;
  }
  return points.map((_, index) => points[(bestIndex + index) % points.length]);
}

function computeCenterOfPoints(points: TestPoint[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function sortByCenterAngle(points: TestPoint[], centerX?: number, centerY?: number) {
  if (points.length <= 1) return [...points];

  const center = centerX == null || centerY == null
    ? computeCenterOfPoints(points)
    : { x: centerX, y: centerY };

  return [...points]
    .map((point) => ({
      point,
      angle: Math.atan2(point.y - center.y, point.x - center.x),
      radius: Math.hypot(point.x - center.x, point.y - center.y),
    }))
    .sort((a, b) => a.angle - b.angle || b.radius - a.radius || a.point.id - b.point.id)
    .map(({ point }) => point);
}

function normalizeLayerDirection(points: TestPoint[]) {
  if (points.length <= 2) return rotateToBestStart(sortByCenterAngle(points));

  const clockwise = polygonArea(points) < 0 ? [...points] : [...points].reverse();
  const counterClockwise = [...clockwise].reverse();
  const rotatedClockwise = rotateToBestStart(clockwise);
  const rotatedCounterClockwise = rotateToBestStart(counterClockwise);

  const clockwiseSignature = rotatedClockwise.map((point) => point.id).join(',');
  const counterClockwiseSignature = rotatedCounterClockwise.map((point) => point.id).join(',');
  return clockwiseSignature <= counterClockwiseSignature ? rotatedClockwise : rotatedCounterClockwise;
}

function buildConvexHull(points: TestPoint[]) {
  if (points.length <= 3) return normalizeLayerDirection(sortByCenterAngle(points));

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
  const lower: TestPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && orientationCross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: TestPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && orientationCross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return normalizeLayerDirection([...lower, ...upper]);
}

function computeRadialReferenceCenter(points: TestPoint[]) {
  if (points.length <= 2) return computeCenterOfPoints(points);
  const hull = buildConvexHull(points);
  return computePolygonCentroid(hull);
}

function buildRadialOrder(points: TestPoint[]) {
  const center = computeRadialReferenceCenter(points);
  return rotateToBestStart(sortByCenterAngle(points, center.x, center.y));
}

function refineOrderByProximity(orderedPoints: TestPoint[]) {
  if (orderedPoints.length <= 3) return orderedPoints;

  const remaining = [...orderedPoints];
  const refined: TestPoint[] = [];
  let current = remaining.shift()!;
  refined.push(current);

  const windowSize = Math.min(5, remaining.length);

  while (remaining.length > 0) {
    const candidateLimit = Math.min(windowSize, remaining.length);
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < candidateLimit; index++) {
      const candidate = remaining[index];
      const distanceScore = distance(current, candidate);
      const orderPenalty = index * 18;
      const score = distanceScore + orderPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    current = remaining.splice(bestIndex, 1)[0];
    refined.push(current);
  }

  return rotateToBestStart(refined);
}

function buildLayeredDisplayAngles(orderedPoints: Array<TestPoint & { theta: number }>) {
  if (orderedPoints.length === 0) return [] as Array<{ theta: number; radius: number }>;

  const orderedAngles = buildOrderedAngles(orderedPoints);
  const center = computeCenterOfPoints(orderedPoints);
  const densityBuckets = new Map<number, number>();

  return orderedPoints.map((point, index) => {
    const baseTheta = orderedAngles[index];
    const bucketKey = Math.round((baseTheta * 180) / Math.PI / 18);
    const bucketCount = densityBuckets.get(bucketKey) ?? 0;
    densityBuckets.set(bucketKey, bucketCount + 1);

    const layerIndex = Math.floor(bucketCount / 2);
    const side = bucketCount % 2 === 0 ? -1 : 1;
    const angleOffset = bucketCount === 0 ? 0 : side * Math.min((layerIndex + 1) * (Math.PI / 60), Math.PI / 10);
    const radialDistance = Math.hypot(point.x - center.x, point.y - center.y);
    const radiusWeight = radialDistance / Math.max(MAP_SIZE / 2, 1);
    const radius = LAYOUT_RADIUS + layerIndex * 32 + radiusWeight * 18;

    return {
      theta: normalizeRadians(baseTheta + angleOffset),
      radius,
    };
  });
}

function buildOrderedAngles(groups: Array<TestPoint & { theta: number }>) {
  if (groups.length <= 1) return groups.map((group) => group.theta);

  const rawAngles = groups.map((group) => group.theta);
  const unwrapped = unwrapAngles(rawAngles);
  const step = (Math.PI * 2) / groups.length;
  const ordered = [unwrapped[0]];

  for (let i = 1; i < groups.length; i++) {
    ordered.push(ordered[i - 1] + step);
  }

  return ordered.map((angle) => normalizeRadians(angle));
}

function buildAngleSlots(angles: number[]) {
  if (angles.length === 0) return [] as Array<{ min: number; max: number }>;
  if (angles.length === 1) {
    return [{ min: angles[0] - Math.PI, max: angles[0] + Math.PI }];
  }

  const unwrapped = unwrapAngles(angles);
  return unwrapped.map((current, index) => {
    const prev = index === 0 ? unwrapped[unwrapped.length - 1] - Math.PI * 2 : unwrapped[index - 1];
    const next = index === unwrapped.length - 1 ? unwrapped[0] + Math.PI * 2 : unwrapped[index + 1];
    return {
      min: (prev + current) / 2,
      max: (current + next) / 2,
    };
  });
}

function buildLayout(points: TestPoint[]) {
  if (points.length === 0) return [] as LayoutGroup[];

  const radialCenter = computeRadialReferenceCenter(points);

  const orderedRadialPath = refineOrderByProximity(buildRadialOrder(points));
  const orderedPoints = orderedRadialPath.map((point, index) => {
    const relativeX = point.x - radialCenter.x;
    const relativeY = point.y - radialCenter.y;
    const fallbackX = relativeX === 0 && relativeY === 0 ? point.x : relativeX;
    const fallbackY = relativeX === 0 && relativeY === 0 ? point.y : relativeY;
    return {
      ...point,
      order: index + 1,
      theta: Math.atan2(fallbackY, fallbackX),
    };
  });

  const layeredDisplay = buildLayeredDisplayAngles(orderedPoints);
  const slots = buildAngleSlots(layeredDisplay.map((item) => item.theta));

  return orderedPoints.map((point, index) => {
    const displayTheta = layeredDisplay[index]?.theta ?? point.theta;
    const displayRadius = layeredDisplay[index]?.radius ?? LAYOUT_RADIUS;
    const slot = slots[index];
    const clampedTheta = Math.min(Math.max(displayTheta, slot.min), slot.max);
    return {
      ...point,
      displayTheta,
      slotMin: slot.min,
      slotMax: slot.max,
      layoutX: Math.cos(clampedTheta) * displayRadius,
      layoutY: Math.sin(clampedTheta) * displayRadius,
    };
  });
}

function segmentsIntersect(first: Segment, second: Segment) {
  if (first.from.id === second.from.id) return false;

  const a = first.from;
  const b = { id: -1, x: first.to.layoutX, y: first.to.layoutY };
  const c = second.from;
  const d = { id: -1, x: second.to.layoutX, y: second.to.layoutY };

  const abC = orientationCross(a, b, c);
  const abD = orientationCross(a, b, d);
  const cdA = orientationCross(c, d, a);
  const cdB = orientationCross(c, d, b);

  return abC * abD < 0 && cdA * cdB < 0;
}

function countIntersections(segments: Segment[]) {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segmentsIntersect(segments[i], segments[j])) total++;
    }
  }
  return total;
}

export default function TestCssPage() {
  const [count, setCount] = useState(9);
  const [seed, setSeed] = useState(0);

  const points = useMemo(() => {
    void seed;
    return buildRandomPoints(count);
  }, [count, seed]);

  const layoutGroups = useMemo(() => buildLayout(points), [points]);

  const segments = useMemo(() => {
    const byId = new Map(layoutGroups.map((group) => [group.id, group]));
    return points
      .map((point) => {
        const target = byId.get(point.id);
        if (!target) return null;
        return { from: point, to: target };
      })
      .filter((item): item is Segment => item != null);
  }, [points, layoutGroups]);

  const intersectionCount = useMemo(() => countIntersections(segments), [segments]);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div>
            <p className={styles.eyebrow}>Order Test</p>
            <h1>随机点排序与连线验证</h1>
            <p className={styles.description}>
              使用凸包质心修正后的全量极角排序生成稳定顺序，再映射到圆周显示，检查顺序与相交情况。
            </p>
          </div>
          <div className={styles.controls}>
            <label className={styles.control}>
              <span>数量</span>
              <input
                type="range"
                min="3"
                max="50"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
              <strong>{count}</strong>
            </label>
            <button className={styles.button} onClick={() => setSeed((value) => value + 1)}>
              随机重排
            </button>
          </div>
        </div>

        <div className={styles.summary}>
          <div className={styles.metric}>
            <span>坐标点数量</span>
            <strong>{points.length}</strong>
          </div>
          <div className={styles.metric}>
            <span>图片组数量</span>
            <strong>{layoutGroups.length}</strong>
          </div>
          <div className={styles.metric}>
            <span>线段相交数</span>
            <strong className={intersectionCount === 0 ? styles.good : styles.bad}>{intersectionCount}</strong>
          </div>
        </div>

        <div className={styles.workspace}>
          <div className={styles.stage}>
            <svg viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`} className={styles.svg}>
              <rect
                x={(STAGE_SIZE - MAP_SIZE) / 2}
                y={(STAGE_SIZE - MAP_SIZE) / 2}
                width={MAP_SIZE}
                height={MAP_SIZE}
                rx="24"
                className={styles.mapRect}
              />

              {segments.map((segment) => (
                <line
                  key={`line-${segment.from.id}`}
                  x1={STAGE_SIZE / 2 + segment.from.x}
                  y1={STAGE_SIZE / 2 + segment.from.y}
                  x2={STAGE_SIZE / 2 + segment.to.layoutX}
                  y2={STAGE_SIZE / 2 + segment.to.layoutY}
                  className={styles.link}
                />
              ))}

              {points.map((point) => (
                <g key={`poi-${point.id}`}>
                  <circle
                    cx={STAGE_SIZE / 2 + point.x}
                    cy={STAGE_SIZE / 2 + point.y}
                    r="8"
                    className={styles.poi}
                  />
                  <text
                    x={STAGE_SIZE / 2 + point.x}
                    y={STAGE_SIZE / 2 + point.y - 16}
                    textAnchor="middle"
                    className={styles.poiLabel}
                  >
                    {point.id}
                  </text>
                </g>
              ))}

              {layoutGroups.map((group) => (
                <g key={`group-${group.id}`}>
                  <circle
                    cx={STAGE_SIZE / 2 + group.layoutX}
                    cy={STAGE_SIZE / 2 + group.layoutY}
                    r={GROUP_RADIUS}
                    className={styles.group}
                  />
                  <text
                    x={STAGE_SIZE / 2 + group.layoutX}
                    y={STAGE_SIZE / 2 + group.layoutY + 6}
                    textAnchor="middle"
                    className={styles.groupLabel}
                  >
                    {group.id}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>编号</th>
                  <th>坐标点</th>
                  <th>原始角度</th>
                  <th>展示角度</th>
                </tr>
              </thead>
              <tbody>
                {layoutGroups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.id} / {group.order}</td>
                    <td>{group.x.toFixed(1)}, {group.y.toFixed(1)}</td>
                    <td>{(group.theta * 180 / Math.PI).toFixed(1)}°</td>
                    <td>{(group.displayTheta * 180 / Math.PI).toFixed(1)}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
