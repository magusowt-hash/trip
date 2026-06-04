import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReplaySnapshot } from './replayData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mappedLayoutFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/1-mapped-layout.json'), 'utf8'),
);

test('buildReplaySnapshot preserves the mapped page state and solver snapshot from fixture', () => {
  const snapshot = buildReplaySnapshot(mappedLayoutFixture);

  assert.equal(snapshot.selectedGroupId, 33);
  assert.equal(snapshot.selectedGroupName, '1');
  assert.equal(snapshot.pageState.items.length, 40);
  assert.equal(snapshot.pageState.poiPoints.length, 40);
  assert.equal(snapshot.pageState.groupLayouts.length, 40);
  assert.equal(snapshot.pageState.photos.length, 426);
  assert.equal(snapshot.solverInputSnapshot.lockedGroups.length, 40);
  assert.equal(snapshot.solverInputSnapshot.pendingGroups.length, 40);
  assert.ok(snapshot.pageState.photos.every((photo) => photo.placeKey && photo.placeTitle));
  assert.ok(snapshot.solverInputSnapshot.mapRect.left < snapshot.solverInputSnapshot.mapRect.right);
});
