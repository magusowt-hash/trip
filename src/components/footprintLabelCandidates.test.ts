import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroupGeometryCandidatesFromGeometry,
  buildGroupGeometryFromPhotoRect,
  buildSingleSideGroupGeometryFromGeometry,
  rectsOverlap,
  resolveGroupLabelLayouts,
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
  assert.equal(buildSingleSideGroupGeometryFromGeometry(left).labelSide, 'bottom');
  assert.equal(buildSingleSideGroupGeometryFromGeometry(right).labelSide, 'bottom');

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
  assert.equal(
    !(
      resolvedLeft!.labelRect.right > resolvedRight!.labelRect.left &&
      resolvedRight!.labelRect.right > resolvedLeft!.labelRect.left &&
      resolvedLeft!.labelRect.bottom > resolvedRight!.labelRect.top &&
      resolvedRight!.labelRect.bottom > resolvedLeft!.labelRect.top
    ),
    true,
  );
});

test('whole-layout label resolution rejects candidates that overlap another label or the map', () => {
  const mapRect = rect(-120, -120, 120, 120);
  const left = buildGroupGeometryFromPhotoRect(
    rect(-260, -40, -140, 40),
    'left',
    4,
    1,
    'bottom',
    0,
    mapRect,
  );
  const right = buildGroupGeometryFromPhotoRect(
    rect(140, -40, 260, 40),
    'right',
    4,
    1,
    'bottom',
    0,
    mapRect,
  );

  const resolved = resolveGroupGeometryAsWhole(
    [
      { id: 'left', geometry: left, candidates: buildGroupGeometryCandidatesFromGeometry(left) },
      { id: 'right', geometry: right, candidates: buildGroupGeometryCandidatesFromGeometry(right) },
    ],
    { gap: 24, mapRect, mapGap: 128 },
  );

  const resolvedLeft = resolved.get('left');
  const resolvedRight = resolved.get('right');

  assert.ok(resolvedLeft);
  assert.ok(resolvedRight);
  assert.ok(resolvedLeft!.labelRect.right <= mapRect.left || resolvedLeft!.labelRect.left >= mapRect.right);
  assert.ok(resolvedRight!.labelRect.right <= mapRect.left || resolvedRight!.labelRect.left >= mapRect.right);
  assert.equal(
    !(
      resolvedLeft!.labelRect.right > resolvedRight!.labelRect.left &&
      resolvedRight!.labelRect.right > resolvedLeft!.labelRect.left &&
      resolvedLeft!.labelRect.bottom > resolvedRight!.labelRect.top &&
      resolvedRight!.labelRect.bottom > resolvedLeft!.labelRect.top
    ),
    true,
  );
});

test('final label layout resolution avoids another group photo and label', () => {
  const left = buildGroupGeometryFromPhotoRect(
    rect(-280, -40, -160, 40),
    'left',
    4,
    1,
    'bottom',
    0,
  );
  const right = buildGroupGeometryFromPhotoRect(
    rect(-110, -40, 10, 40),
    'right',
    4,
    1,
    'bottom',
    0,
  );

  const layouts = resolveGroupLabelLayouts([
    {
      placeKey: 'left',
      geometry: left,
      title: 'left',
      photoCount: 4,
      scale: 1,
    },
    {
      placeKey: 'right',
      geometry: right,
      title: 'right',
      photoCount: 4,
      scale: 1,
    },
  ], {
    gap: 24,
    step: 12,
    maxOffset: 120,
  });

  const leftLayout = layouts.get('left');
  const rightLayout = layouts.get('right');
  assert.ok(leftLayout);
  assert.ok(rightLayout);

  const resolvedLeft = buildGroupGeometryFromPhotoRect(
    left.photoRect,
    'left',
    4,
    1,
    leftLayout!.labelSide,
    leftLayout!.labelOffset,
  );
  const resolvedRight = buildGroupGeometryFromPhotoRect(
    right.photoRect,
    'right',
    4,
    1,
    rightLayout!.labelSide,
    rightLayout!.labelOffset,
  );

  assert.equal(rectsOverlap(resolvedLeft.labelRect, resolvedRight.photoRect, 24), false);
  assert.equal(rectsOverlap(resolvedRight.labelRect, resolvedLeft.photoRect, 24), false);
  assert.equal(rectsOverlap(resolvedLeft.labelRect, resolvedRight.labelRect, 24), false);
});

test('final label layout resolution rejects map-overlapping labels by increasing offset or switching side', () => {
  const mapRect = rect(-120, -120, 120, 120);
  const bottomCenter = buildGroupGeometryFromPhotoRect(
    rect(-60, 100, 60, 180),
    'center',
    4,
    1,
    'top',
    0,
    mapRect,
  );

  const layouts = resolveGroupLabelLayouts([
    {
      placeKey: 'center',
      geometry: bottomCenter,
      title: 'center',
      photoCount: 4,
      scale: 1,
    },
  ], {
    gap: 24,
    mapRect,
    mapGap: 24,
    step: 12,
    maxOffset: 160,
  });

  const centerLayout = layouts.get('center');
  assert.ok(centerLayout);

  const resolvedCenter = buildGroupGeometryFromPhotoRect(
    bottomCenter.photoRect,
    'center',
    4,
    1,
    centerLayout!.labelSide,
    centerLayout!.labelOffset,
  );

  assert.equal(rectsOverlap(resolvedCenter.labelRect, mapRect, 24), false);
});
