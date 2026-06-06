import test from 'node:test';
import assert from 'node:assert/strict';

import { buildViewportFromRects } from './OuterFrame.tsx';

test('buildViewportFromRects keeps map-adjacent group bounds in fitted max view', () => {
  const viewport = buildViewportFromRects([
    { left: -420, right: -280, top: -180, bottom: -40 },
    { left: -120, right: 160, top: -60, bottom: 220 },
    { left: 240, right: 620, top: -140, bottom: 40 },
  ], 24);

  assert.ok(viewport, 'expected viewport for non-empty rects');
  assert.equal(viewport!.left, -444);
  assert.equal(viewport!.right, 644);
  assert.equal(viewport!.top, -204);
  assert.equal(viewport!.bottom, 244);
});

test('buildViewportFromRects returns null for empty input', () => {
  assert.equal(buildViewportFromRects([], 24), null);
});
