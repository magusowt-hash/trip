export type NatureTopicItem = {
  topicSlug: string;
  title: string;
  coverImageUrl: string;
  sortOrder: number;
  isEnabled: boolean;
};

export const chinaNatureTopics: NatureTopicItem[] = [
  {
    topicSlug: 'island',
    title: '海岛',
    coverImageUrl: 'https://example.com/china-nature/island.jpg',
    sortOrder: 1,
    isEnabled: true,
  },
  {
    topicSlug: 'karst',
    title: '喀斯特',
    coverImageUrl: 'https://example.com/china-nature/karst.jpg',
    sortOrder: 2,
    isEnabled: true,
  },
  {
    topicSlug: 'yadan',
    title: '雅丹',
    coverImageUrl: 'https://example.com/china-nature/yadan.jpg',
    sortOrder: 3,
    isEnabled: true,
  },
];
