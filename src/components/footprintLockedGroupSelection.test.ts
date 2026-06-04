import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildGroupGeometryFromLayout,
  rectsOverlap,
} from './localMapGroupGeometry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ReplayFixture = {
  pageState: {
    photos: Array<{
      frameX?: number;
      frameY?: number;
      pixelWidth?: number;
      pixelHeight?: number;
      placeKey: string;
      placeTitle: string;
    }>;
    groupLayouts: Array<{
      placeKey: string;
      labelSide: 'top' | 'bottom';
      labelOffset: number;
    }>;
  };
};

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/3-mapped-layout.json'), 'utf8'),
) as ReplayFixture;

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;

function getPhotoLogicalSize(photo: { pixelWidth?: number; pixelHeight?: number }) {
  const sourceWidth = photo.pixelWidth ?? 0;
  const sourceHeight = photo.pixelHeight ?? 0;
  if (sourceWidth > 0 && sourceHeight > 0) {
    if (sourceWidth >= sourceHeight) {
      return {
        width: PHOTO_MAX_EDGE,
        height: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * sourceHeight) / sourceWidth),
      };
    }
    return {
      width: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * sourceWidth) / sourceHeight),
      height: PHOTO_MAX_EDGE,
    };
  }
  return { width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE };
}

function collectLockedPlaceKeys(placeKeys: string[]) {
  const photosByPlaceKey = new Map<string, ReplayFixture['pageState']['photos']>();
  for (const photo of fixture.pageState.photos) {
    const current = photosByPlaceKey.get(photo.placeKey) ?? [];
    current.push(photo);
    photosByPlaceKey.set(photo.placeKey, current);
  }

  const locked: Array<{ placeKey: string; geometry: NonNullable<ReturnType<typeof buildGroupGeometryFromLayout>> }> = [];
  const pending: string[] = [];

  for (const placeKey of placeKeys) {
    const photos = photosByPlaceKey.get(placeKey);
    assert.ok(photos, `missing photos for ${placeKey}`);
    const geometry = buildGroupGeometryFromLayout(
      placeKey,
      photos!,
      getPhotoLogicalSize,
      1,
      fixture.pageState.groupLayouts,
    );
    assert.ok(geometry, `missing geometry for ${placeKey}`);

    const collides = locked.some((entry) => (
      rectsOverlap(geometry!.photoRect, entry.geometry.photoRect, 48) ||
      rectsOverlap(geometry!.labelRect, entry.geometry.photoRect, 96) ||
      rectsOverlap(entry.geometry.labelRect, geometry!.photoRect, 96) ||
      rectsOverlap(geometry!.labelRect, entry.geometry.labelRect, 96)
    ));

    if (collides) {
      pending.push(placeKey);
      continue;
    }

    locked.push({ placeKey, geometry: geometry! });
  }

  return { locked: locked.map((entry) => entry.placeKey), pending };
}

test('overlapping saved groups should not all remain eligible as locked groups', () => {
  const result = collectLockedPlaceKeys(['mfpi_24', 'mfpi_17']);

  assert.equal(result.locked.length, 1);
  assert.equal(result.pending.length, 1);
});
