import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOuterShellPlaceKeys,
  computeOuterShellEnvelope,
  isOuterShellEnvelopeImproved,
} from './footprintPresetOuterShell.ts';

test('buildOuterShellPlaceKeys picks extreme envelope groups and nearby boundary neighbors', () => {
  const placementById = new Map([
    ['left', { centerX: -1200, centerY: 40 }],
    ['left-near', { centerX: -1080, centerY: 120 }],
    ['right', { centerX: 1280, centerY: -30 }],
    ['top', { centerX: -40, centerY: -980 }],
    ['bottom', { centerX: 20, centerY: 1020 }],
    ['inner', { centerX: 40, centerY: 120 }],
  ]);

  const shell = buildOuterShellPlaceKeys(placementById, 140);

  assert.deepEqual(
    shell,
    new Set(['left', 'left-near', 'right', 'top', 'bottom']),
  );
});

test('computeOuterShellEnvelope tracks axis extremes from shell members only', () => {
  const placementById = new Map([
    ['left', { centerX: -1200, centerY: 40 }],
    ['right', { centerX: 1280, centerY: -30 }],
    ['top', { centerX: -40, centerY: -980 }],
    ['bottom', { centerX: 20, centerY: 1020 }],
    ['inner', { centerX: 4000, centerY: 4000 }],
  ]);

  const envelope = computeOuterShellEnvelope(
    placementById,
    new Set(['left', 'right', 'top', 'bottom']),
  );

  assert.deepEqual(envelope, {
    left: -1200,
    right: 1280,
    top: -980,
    bottom: 1020,
    spanX: 2480,
    spanY: 2000,
  });
});

test('isOuterShellEnvelopeImproved accepts coordinated inward shrink without outward drift on other extremes', () => {
  const current = {
    left: -1200,
    right: 1280,
    top: -980,
    bottom: 1020,
    spanX: 2480,
    spanY: 2000,
  };
  const tightened = {
    left: -1120,
    right: 1190,
    top: -930,
    bottom: 980,
    spanX: 2310,
    spanY: 1910,
  };
  const drifted = {
    left: -1100,
    right: 1380,
    top: -930,
    bottom: 980,
    spanX: 2480,
    spanY: 1910,
  };

  assert.equal(isOuterShellEnvelopeImproved(current, tightened), true);
  assert.equal(isOuterShellEnvelopeImproved(current, drifted), false);
});
