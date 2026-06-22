import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSPORT_VISA_MAX_ZOOM_SCALE,
  PASSPORT_VISA_MIN_ZOOM_SCALE,
  clampPassportVisaZoomViewBoxAtPoint,
  panPassportVisaViewBox,
  parsePassportVisaViewBox,
  zoomPassportVisaViewBoxAtPoint,
} from './passportVisaViewport.ts';

function assertViewBoxAlmostEqual(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `expected x=${expected.x}, got ${actual.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `expected y=${expected.y}, got ${actual.y}`);
  assert.ok(Math.abs(actual.width - expected.width) < 1e-9, `expected width=${expected.width}, got ${actual.width}`);
  assert.ok(Math.abs(actual.height - expected.height) < 1e-9, `expected height=${expected.height}, got ${actual.height}`);
}

test('parses explicit svg viewBox', () => {
  assert.deepEqual(
    parsePassportVisaViewBox('0 0 1000 500', null, null),
    { x: 0, y: 0, width: 1000, height: 500 },
  );
});

test('parses viewBox from an svg element-like object', () => {
  const svg = {
    getAttribute(name) {
      if (name === 'viewBox') return '0 0 1000 500';
      if (name === 'width') return '1000';
      if (name === 'height') return '500';
      return null;
    },
  };

  assert.deepEqual(
    parsePassportVisaViewBox(svg),
    { x: 0, y: 0, width: 1000, height: 500 },
  );
});

test('falls back to width and height when viewBox is missing', () => {
  assert.deepEqual(
    parsePassportVisaViewBox(null, '1009.6727', '665.96301'),
    { x: 0, y: 0, width: 1009.6727, height: 665.96301 },
  );
});

test('zooms around the pointer without raster-style scaling', () => {
  assert.deepEqual(
    zoomPassportVisaViewBoxAtPoint(
      { x: 0, y: 0, width: 1000, height: 500 },
      500,
      250,
      1000,
      500,
      2,
    ),
    { x: 250, y: 125, width: 500, height: 250 },
  );
});

test('pans by translating the viewBox instead of the dom layer', () => {
  assert.deepEqual(
    panPassportVisaViewBox(
      { x: 250, y: 125, width: 500, height: 250 },
      100,
      -40,
      1000,
      500,
    ),
    { x: 200, y: 145, width: 500, height: 250 },
  );
});

test('supports a higher maximum zoom scale', () => {
  assert.equal(PASSPORT_VISA_MAX_ZOOM_SCALE, 12);
  assert.equal(PASSPORT_VISA_MIN_ZOOM_SCALE, 0.8);
});

test('clamped zoom keeps the pointer anchor instead of sliding at the max zoom limit', () => {
  const nextViewBox = zoomPassportVisaViewBoxAtPoint(
    { x: 400, y: 200, width: 200, height: 100 },
    500,
    250,
    1000,
    500,
    1.12,
  );

  assertViewBoxAlmostEqual(
    clampPassportVisaZoomViewBoxAtPoint(
      { x: 0, y: 0, width: 1000, height: 500 },
      nextViewBox,
      500,
      250,
      1000,
      500,
      PASSPORT_VISA_MIN_ZOOM_SCALE,
      5,
    ),
    { x: 400, y: 200, width: 200, height: 100 },
  );
});

test('clamped zoom does not jump when hitting max zoom after the map has already moved', () => {
  const nextViewBox = zoomPassportVisaViewBoxAtPoint(
    { x: 474, y: 221.2, width: 83.33333333333333, height: 41.666666666666664 },
    720,
    180,
    1000,
    500,
    1.12,
  );

  assertViewBoxAlmostEqual(
    clampPassportVisaZoomViewBoxAtPoint(
      { x: 0, y: 0, width: 1000, height: 500 },
      nextViewBox,
      720,
      180,
      1000,
      500,
      PASSPORT_VISA_MIN_ZOOM_SCALE,
      PASSPORT_VISA_MAX_ZOOM_SCALE,
    ),
    {
      x: 474,
      y: 221.2,
      width: 83.33333333333333,
      height: 41.666666666666664,
    },
  );
});
