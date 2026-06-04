import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGroupGeometryFromLayout } from './localMapGroupGeometry.ts';
import { lockedGroupHasConflicts } from './footprintLockedGroupGuard.ts';

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

test('lockedGroupHasConflicts detects the real overlapping saved groups from the fixture', () => {
  const photosByPlaceKey = new Map<string, ReplayFixture['pageState']['photos']>();
  for (const photo of fixture.pageState.photos) {
    const current = photosByPlaceKey.get(photo.placeKey) ?? [];
    current.push(photo);
    photosByPlaceKey.set(photo.placeKey, current);
  }

  const zhanjiangPhotos = photosByPlaceKey.get('mfpi_24');
  const haikouPhotos = photosByPlaceKey.get('mfpi_17');
  assert.ok(zhanjiangPhotos);
  assert.ok(haikouPhotos);

  const zhanjiangGeometry = buildGroupGeometryFromLayout(
    'mfpi_24',
    zhanjiangPhotos!,
    getPhotoLogicalSize,
    1,
    fixture.pageState.groupLayouts,
  );
  const haikouGeometry = buildGroupGeometryFromLayout(
    'mfpi_17',
    haikouPhotos!,
    getPhotoLogicalSize,
    1,
    fixture.pageState.groupLayouts,
  );

  assert.ok(zhanjiangGeometry);
  assert.ok(haikouGeometry);
  assert.equal(
    lockedGroupHasConflicts(
      zhanjiangGeometry!,
      [{ placeKey: 'mfpi_17', logicalX: 0, logicalY: 0, geometry: haikouGeometry! }],
      48,
    ),
    true,
  );
});
