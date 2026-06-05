import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisibleNatureTopics,
  createInitialNatureViewState,
  enterNatureTopicShell,
} from './chinaNatureTopicState';

test('buildVisibleNatureTopics keeps enabled topics in sort order', () => {
  const topics = buildVisibleNatureTopics([
    { topicSlug: 'karst', title: '喀斯特', icon: '岩', sortOrder: 2, isEnabled: true },
    { topicSlug: 'island', title: '海岛', icon: '岛', sortOrder: 1, isEnabled: true },
    { topicSlug: 'yadan', title: '雅丹', icon: '风', sortOrder: 3, isEnabled: false },
  ]);

  assert.deepEqual(topics.map((item) => item.topicSlug), ['island', 'karst']);
});

test('createInitialNatureViewState starts in list mode when topics exist', () => {
  const state = createInitialNatureViewState([
    { topicSlug: 'island', title: '海岛', icon: '岛', sortOrder: 1, isEnabled: true },
  ]);

  assert.equal(state.mode, 'list');
  assert.equal(state.activeTopicSlug, null);
});

test('enterNatureTopicShell moves from list mode to topic shell mode', () => {
  const state = enterNatureTopicShell(
    { mode: 'list', activeTopicSlug: null },
    'karst',
  );

  assert.deepEqual(state, {
    mode: 'topic',
    activeTopicSlug: 'karst',
  });
});

test('buildVisibleNatureTopics drops disabled admin-managed topics', () => {
  const topics = buildVisibleNatureTopics([
    { topicSlug: 'island', title: '海岛', icon: '岛', sortOrder: 1, isEnabled: false },
    { topicSlug: 'karst', title: '喀斯特', icon: '岩', sortOrder: 2, isEnabled: true },
  ]);

  assert.deepEqual(topics.map((item) => item.topicSlug), ['karst']);
});
