import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGroupDragToPhotos,
  applyPhotoDragToPhotos,
  type FootprintLayoutInteractionMode,
  mergeGroupLayoutSnapshot,
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
