'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';

type TestPoint = {
  id: number;
  x: number;
  y: number;
};

type LayoutGroup = TestPoint & {
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

  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;

  const orderedPoints = [...points]
    .map((point) => {
      const relativeX = point.x - centerX;
      const relativeY = point.y - centerY;
      const fallbackX = relativeX === 0 && relativeY === 0 ? point.x : relativeX;
      const fallbackY = relativeX === 0 && relativeY === 0 ? point.y : relativeY;
      return {
        ...point,
        theta: Math.atan2(fallbackY, fallbackX),
      };
    })
    .sort((a, b) => a.theta - b.theta);

  const orderedAngles = buildOrderedAngles(orderedPoints);
  const slots = buildAngleSlots(orderedAngles);

  return orderedPoints.map((point, index) => {
    const displayTheta = orderedAngles[index];
    const slot = slots[index];
    const clampedTheta = Math.min(Math.max(displayTheta, slot.min), slot.max);
    return {
      ...point,
      displayTheta,
      slotMin: slot.min,
      slotMax: slot.max,
      layoutX: Math.cos(clampedTheta) * LAYOUT_RADIUS,
      layoutY: Math.sin(clampedTheta) * LAYOUT_RADIUS,
    };
  });
}

function cross(a: TestPoint, b: TestPoint, c: TestPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(first: Segment, second: Segment) {
  if (first.from.id === second.from.id) return false;

  const a = first.from;
  const b = { id: -1, x: first.to.layoutX, y: first.to.layoutY };
  const c = second.from;
  const d = { id: -1, x: second.to.layoutX, y: second.to.layoutY };

  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

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
              目标是让坐标点顺序与图片组顺序完全一致，满足 `1-2-3-...-n-1` 的圆周映射，并检查是否存在相交。
            </p>
          </div>
          <div className={styles.controls}>
            <label className={styles.control}>
              <span>数量</span>
              <input
                type="range"
                min="3"
                max="18"
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
                    <td>{group.id}</td>
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
