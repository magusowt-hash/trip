import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectConflictingSavedPlaceKeys } from './footprintSavedGroupRecovery.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ReplayFixture = {
  pageState: {
    photos: Array<{
      id: number | string;
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

test('collectConflictingSavedPlaceKeys finds the repeated bad saved groups in the real fixture', () => {
  const groups = new Map<string, ReplayFixture['pageState']['photos']>();
  for (const photo of fixture.pageState.photos) {
    const current = groups.get(photo.placeKey) ?? [];
    current.push(photo);
    groups.set(photo.placeKey, current);
  }

  const conflicting = collectConflictingSavedPlaceKeys(
    groups as Map<string, any>,
    1,
    fixture.pageState.groupLayouts,
    getPhotoLogicalSize,
  );

  assert.deepEqual(
    Array.from(conflicting).sort(),
    ['mfpi_17', 'mfpi_20', 'mfpi_21', 'mfpi_24', 'mfpi_25', 'mfpi_30', 'mfpi_31', 'mfpi_39'],
  );
});
