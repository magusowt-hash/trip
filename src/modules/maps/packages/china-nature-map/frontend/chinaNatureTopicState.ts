import type { NatureTopicDatasetItem, NatureTopicItem } from './chinaNatureTopics';

export type NatureMapMarker = {
  id?: number;
  position: [number, number];
  title?: string;
  address?: string;
  description?: string;
  groupColor?: string;
};

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

export function buildNatureTopicMarkers(items: NatureTopicDatasetItem[]): NatureMapMarker[] {
  return items.map((item) => ({
    id: Number(item.id.replace('island-', '')),
    position: [item.lng, item.lat],
    title: item.name,
    address: item.locationLabel,
    description: '中国自然地图·海岛',
    groupColor: '#0f766e',
  }));
}
