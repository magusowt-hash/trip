export type NatureTopicItem = {
  topicSlug: string;
  title: string;
  icon: string;
  sortOrder: number;
  isEnabled: boolean;
};

export const chinaNatureTopics: NatureTopicItem[] = [
  {
    topicSlug: 'island',
    title: '海岛',
    icon: '岛',
    sortOrder: 1,
    isEnabled: true,
  },
  {
    topicSlug: 'karst',
    title: '喀斯特',
    icon: '岩',
    sortOrder: 2,
    isEnabled: true,
  },
  {
    topicSlug: 'yadan',
    title: '雅丹',
    icon: '风',
    sortOrder: 3,
    isEnabled: true,
  },
];
