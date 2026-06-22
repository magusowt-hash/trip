import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChinaNatureTopicDataset } from './chinaNatureTopics.ts';

test('buildChinaNatureTopicDataset returns ranked island entries for island topic', () => {
  const dataset = buildChinaNatureTopicDataset('island');

  assert.equal(dataset.topicSlug, 'island');
  assert.equal(dataset.items.length, 30);
  assert.equal(dataset.items[0]?.rank, 1);
  assert.equal(dataset.items[0]?.name, '西沙群岛');
  assert.equal(dataset.items[0]?.lat, 16.836667);
  assert.equal(dataset.items[0]?.lng, 112.333333);
  assert.equal(dataset.items[29]?.rank, 30);
  assert.equal(dataset.items[29]?.name, '獐子岛');
});

test('buildChinaNatureTopicDataset falls back to an empty dataset for unsupported topics', () => {
  const dataset = buildChinaNatureTopicDataset('karst');

  assert.equal(dataset.topicSlug, 'karst');
  assert.deepEqual(dataset.items, []);
});
