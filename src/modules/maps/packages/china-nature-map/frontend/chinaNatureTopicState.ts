import type { NatureTopicItem } from './chinaNatureTopics';

export type NatureViewState =
  | { mode: 'list'; activeTopicSlug: null }
  | { mode: 'topic'; activeTopicSlug: string };

export function buildVisibleNatureTopics(topics: NatureTopicItem[]) {
  return topics
    .filter((item) => item.isEnabled)
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return a.topicSlug.localeCompare(b.topicSlug, 'zh-CN');
    });
}

export function createInitialNatureViewState(topics: NatureTopicItem[]): NatureViewState {
  void topics;
  return { mode: 'list', activeTopicSlug: null };
}

export function enterNatureTopicShell(
  current: NatureViewState,
  topicSlug: string,
): NatureViewState {
  void current;
  return { mode: 'topic', activeTopicSlug: topicSlug };
}
