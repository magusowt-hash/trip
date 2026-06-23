import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPassportVisaHoverCardMaxWidth,
  getPassportVisaHoverCardPosition,
  getPassportVisaHoverCardTitle,
} from './passportVisaHoverCard.ts';

test('builds hover card title from chinese name only', () => {
  assert.equal(
    getPassportVisaHoverCardTitle({
      chineseName: '日本',
      englishName: 'Japan',
    }),
    '日本',
  );
});

test('clamps hover card horizontally inside viewport', () => {
  assert.deepEqual(
    getPassportVisaHoverCardPosition({
      pointerX: 1210,
      pointerY: 120,
      viewportWidth: 1280,
      viewportHeight: 800,
      cardWidth: 220,
      cardHeight: 52,
      offsetX: 18,
      offsetY: 18,
      edgePadding: 16,
    }),
    {
      left: 1044,
      top: 138,
    },
  );
});

test('flips hover card above pointer when bottom space is insufficient', () => {
  assert.deepEqual(
    getPassportVisaHoverCardPosition({
      pointerX: 420,
      pointerY: 770,
      viewportWidth: 1280,
      viewportHeight: 800,
      cardWidth: 220,
      cardHeight: 52,
      offsetX: 18,
      offsetY: 18,
      edgePadding: 16,
    }),
    {
      left: 438,
      top: 700,
    },
  );
});

test('caps hover card max width to available viewport space', () => {
  assert.equal(
    getPassportVisaHoverCardMaxWidth({
      viewportWidth: 1280,
      edgePadding: 16,
      preferredMaxWidth: 320,
    }),
    320,
  );

  assert.equal(
    getPassportVisaHoverCardMaxWidth({
      viewportWidth: 280,
      edgePadding: 16,
      preferredMaxWidth: 320,
    }),
    248,
  );
});
