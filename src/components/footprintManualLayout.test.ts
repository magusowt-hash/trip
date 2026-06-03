import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGroupDragToPhotos,
  applyGroupPhotoPositions,
  applyPhotoDragToPhotos,
  clampRectOutsideMap,
  type FootprintLayoutInteractionMode,
  mergeGroupLayoutSnapshot,
  translatePlaceRect,
} from './footprintManualLayout.ts';

type PhotoItem = {
  id: number | string;
  url: string;
  frameX: number | undefined;
  frameY: number | undefined;
  placeKey: string;
  placeTitle: string;
  filename: string;
  sourceType?: 'uploaded' | 'local-mapped';
};

type GroupLayoutSnapshot = {
  placeKey: string;
  labelSide: 'top' | 'bottom';
  labelOffset: number;
};

function buildPhoto(id: string, placeKey: string, frameX: number, frameY: number): PhotoItem {
  return {
    id,
    url: '',
    frameX,
    frameY,
    placeKey,
    placeTitle: placeKey,
    filename: `${id}.jpg`,
    sourceType: 'local-mapped',
  };
}

test('applyPhotoDragToPhotos only updates the dragged photo', () => {
  const photos = [
    buildPhoto('a', 'alpha', 10, 20),
    buildPhoto('b', 'alpha', 30, 40),
    buildPhoto('c', 'beta', 50, 60),
  ];

  const next = applyPhotoDragToPhotos(photos, 'b', 130, 140);

  assert.equal(next[0].frameX, 10);
  assert.equal(next[0].frameY, 20);
  assert.equal(next[1].frameX, 130);
  assert.equal(next[1].frameY, 140);
  assert.equal(next[2].frameX, 50);
  assert.equal(next[2].frameY, 60);
  assert.notStrictEqual(next, photos);
});

test('applyGroupDragToPhotos moves only the target place group', () => {
  const photos = [
    buildPhoto('a', 'alpha', 10, 20),
    buildPhoto('b', 'alpha', 30, 40),
    buildPhoto('c', 'beta', 50, 60),
  ];

  const next = applyGroupDragToPhotos(photos, 'alpha', 12, -8);

  assert.deepEqual(
    next.map((photo) => ({ id: photo.id, x: photo.frameX, y: photo.frameY })),
    [
      { id: 'a', x: 22, y: 12 },
      { id: 'b', x: 42, y: 32 },
      { id: 'c', x: 50, y: 60 },
    ],
  );
});

test('applyGroupPhotoPositions commits final group positions without adding extra offset', () => {
  const photos = [
    buildPhoto('a', 'alpha', 10, 20),
    buildPhoto('b', 'alpha', 30, 40),
    buildPhoto('c', 'beta', 50, 60),
  ];

  const next = applyGroupPhotoPositions(photos, 'alpha', [
    { id: 'a', frameX: 18, frameY: 11 },
    { id: 'b', frameX: 38, frameY: 31 },
  ]);

  assert.deepEqual(
    next.map((photo) => ({ id: photo.id, x: photo.frameX, y: photo.frameY })),
    [
      { id: 'a', x: 18, y: 11 },
      { id: 'b', x: 38, y: 31 },
      { id: 'c', x: 50, y: 60 },
    ],
  );
});

test('mergeGroupLayoutSnapshot replaces only the changed place snapshot', () => {
  const layouts: GroupLayoutSnapshot[] = [
    { placeKey: 'alpha', labelSide: 'top', labelOffset: 24 },
    { placeKey: 'beta', labelSide: 'bottom', labelOffset: 36 },
  ];

  const next = mergeGroupLayoutSnapshot(layouts, {
    placeKey: 'alpha',
    labelSide: 'bottom',
    labelOffset: 18,
  });

  assert.deepEqual(next, [
    { placeKey: 'alpha', labelSide: 'bottom', labelOffset: 18 },
    { placeKey: 'beta', labelSide: 'bottom', labelOffset: 36 },
  ]);
});

test('manual mode is the terminal state after preset mode', () => {
  const modeFlow: FootprintLayoutInteractionMode[] = ['preset', 'manual'];
  assert.equal(modeFlow.at(-1), 'manual');
});

test('manual group drag should not require a new layout snapshot', () => {
  const current = { placeKey: 'alpha', labelSide: 'top' as const, labelOffset: 24 };
  const moved = applyGroupPhotoPositions(
    [buildPhoto('a', 'alpha', 10, 20)],
    'alpha',
    [{ id: 'a', frameX: 18, frameY: 28 }],
  );

  assert.equal(moved[0].frameX, 18);
  assert.equal(moved[0].frameY, 28);
  assert.deepEqual(current, { placeKey: 'alpha', labelSide: 'top', labelOffset: 24 });
});

test('translatePlaceRect keeps photo, label, and line anchors rigid during manual drag', () => {
  const rect = {
    placeKey: 'alpha',
    placeTitle: 'alpha',
    photoLeft: 10,
    photoTop: 20,
    photoRight: 70,
    photoBottom: 80,
    overallLeft: 0,
    overallTop: 8,
    overallRight: 90,
    overallBottom: 96,
    labelLeft: 4,
    labelTop: 8,
    labelRight: 84,
    labelBottom: 24,
    labelSide: 'top' as const,
    labelAnchorX: 40,
    labelAnchorY: 16,
    lineAnchorX: 42,
    lineAnchorY: 32,
  };

  const shifted = translatePlaceRect(rect, 18, -6);

  assert.deepEqual(shifted, {
    ...rect,
    photoLeft: 28,
    photoTop: 14,
    photoRight: 88,
    photoBottom: 74,
    overallLeft: 18,
    overallTop: 2,
    overallRight: 108,
    overallBottom: 90,
    labelLeft: 22,
    labelTop: 2,
    labelRight: 102,
    labelBottom: 18,
    labelAnchorX: 58,
    labelAnchorY: 10,
    lineAnchorX: 60,
    lineAnchorY: 26,
  });
});

test('clampRectOutsideMap applies one stable corrective shift without cumulative drift', () => {
  const rect = {
    placeKey: 'alpha',
    placeTitle: 'alpha',
    photoLeft: -36,
    photoTop: -22,
    photoRight: 24,
    photoBottom: 38,
    overallLeft: -44,
    overallTop: -30,
    overallRight: 32,
    overallBottom: 52,
    labelLeft: -44,
    labelTop: -30,
    labelRight: 24,
    labelBottom: -10,
    labelSide: 'top' as const,
    labelAnchorX: -10,
    labelAnchorY: -20,
    lineAnchorX: -8,
    lineAnchorY: -2,
  };

  const clampedOnce = clampRectOutsideMap(rect, {
    left: -30,
    right: 30,
    top: -40,
    bottom: 40,
  });
  const clampedTwice = clampRectOutsideMap(clampedOnce, {
    left: -30,
    right: 30,
    top: -40,
    bottom: 40,
  });

  assert.equal(clampedOnce.overallLeft, -106);
  assert.equal(clampedOnce.overallRight, -30);
  assert.deepEqual(clampedTwice, clampedOnce);
});
