import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroupGeometryCandidatesFromGeometry,
  buildGroupGeometryFromPhotoRect,
  resolveGroupGeometryAsWhole,
} from './localMapGroupGeometry.ts';

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom };
}

test('geometry candidates include both label sides so whole-layout resolution can avoid label conflicts', () => {
  const mapRect = rect(-120, -120, 120, 120);
  const left = buildGroupGeometryFromPhotoRect(
    rect(-420, -40, -300, 40),
    'left',
    4,
    1,
    'bottom',
    0,
    mapRect,
  );
  const right = buildGroupGeometryFromPhotoRect(
    rect(-220, -40, -100, 40),
    'right',
    4,
    1,
    'bottom',
    0,
    mapRect,
  );

  const leftCandidates = buildGroupGeometryCandidatesFromGeometry(left);
  const rightCandidates = buildGroupGeometryCandidatesFromGeometry(right);

  assert.ok(leftCandidates.some((candidate) => candidate.labelSide === 'top'));
  assert.ok(leftCandidates.some((candidate) => candidate.labelSide === 'bottom'));
  assert.ok(rightCandidates.some((candidate) => candidate.labelSide === 'top'));
  assert.ok(rightCandidates.some((candidate) => candidate.labelSide === 'bottom'));

  const resolved = resolveGroupGeometryAsWhole(
    [
      { id: 'left', geometry: left, candidates: leftCandidates },
      { id: 'right', geometry: right, candidates: rightCandidates },
    ],
    { gap: 24, mapRect, mapGap: 128 },
  );

  const resolvedLeft = resolved.get('left');
  const resolvedRight = resolved.get('right');

  assert.ok(resolvedLeft);
  assert.ok(resolvedRight);
  assert.notEqual(resolvedLeft!.labelSide, resolvedRight!.labelSide);
});
