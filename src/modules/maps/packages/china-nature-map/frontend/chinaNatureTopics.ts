export type NatureTopicItem = {
  topicSlug: string;
  title: string;
  icon: string;
  sortOrder: number;
  isEnabled: boolean;
};

export type NatureTopicDatasetItem = {
  id: string;
  rank: number;
  name: string;
  lat: number;
  lng: number;
  locationLabel: string;
};

export type NatureTopicDataset = {
  topicSlug: string;
  items: NatureTopicDatasetItem[];
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

const chinaNatureIslandEntries: NatureTopicDatasetItem[] = [
  { id: 'island-1', rank: 1, name: '西沙群岛', lat: 16.836667, lng: 112.333333, locationLabel: '海南省三沙市' },
  { id: 'island-2', rank: 2, name: '涠洲岛', lat: 21.026667, lng: 109.115, locationLabel: '广西壮族自治区北海市' },
  { id: 'island-3', rank: 3, name: '南麂列岛', lat: 27.466667, lng: 121.083333, locationLabel: '浙江省温州市' },
  { id: 'island-4', rank: 4, name: '分界洲岛', lat: 18.583333, lng: 110.183333, locationLabel: '海南省陵水黎族自治县' },
  { id: 'island-5', rank: 5, name: '蜈支洲岛', lat: 18.316667, lng: 109.766667, locationLabel: '海南省三亚市' },
  { id: 'island-6', rank: 6, name: '大嵛山岛', lat: 26.983333, lng: 120.333333, locationLabel: '福建省宁德市' },
  { id: 'island-7', rank: 7, name: '庙岛列岛（长岛）', lat: 37.933333, lng: 120.733333, locationLabel: '山东省烟台市' },
  { id: 'island-8', rank: 8, name: '东极岛（中街山列岛）', lat: 30.133333, lng: 122.416667, locationLabel: '浙江省舟山市' },
  { id: 'island-9', rank: 9, name: '渔山列岛', lat: 28.883333, lng: 122.266667, locationLabel: '浙江省宁波市' },
  { id: 'island-10', rank: 10, name: '平潭岛（海坛岛）', lat: 25.516667, lng: 119.783333, locationLabel: '福建省福州市' },
  { id: 'island-11', rank: 11, name: '海陵岛', lat: 21.583333, lng: 111.933333, locationLabel: '广东省阳江市' },
  { id: 'island-12', rank: 12, name: '林进屿・南碇岛', lat: 24.116667, lng: 118.083333, locationLabel: '福建省漳州市' },
  { id: 'island-13', rank: 13, name: '东山岛', lat: 23.733333, lng: 117.5, locationLabel: '福建省漳州市' },
  { id: 'island-14', rank: 14, name: '大洲岛', lat: 18.65, lng: 110.466667, locationLabel: '海南省万宁市' },
  { id: 'island-15', rank: 15, name: '嵊泗列岛', lat: 30.716667, lng: 122.466667, locationLabel: '浙江省舟山市' },
  { id: 'island-16', rank: 16, name: '西岛', lat: 18.25, lng: 109.433333, locationLabel: '海南省三亚市' },
  { id: 'island-17', rank: 17, name: '加井岛', lat: 18.533333, lng: 110.333333, locationLabel: '海南省万宁市' },
  { id: 'island-18', rank: 18, name: '七洲列岛', lat: 19.9, lng: 111.233333, locationLabel: '海南省文昌市' },
  { id: 'island-19', rank: 19, name: '斜阳岛', lat: 20.9, lng: 109.216667, locationLabel: '广西壮族自治区北海市' },
  { id: 'island-20', rank: 20, name: '外伶仃岛', lat: 22.116667, lng: 114.083333, locationLabel: '广东省珠海市' },
  { id: 'island-21', rank: 21, name: '南澳岛', lat: 23.416667, lng: 117.016667, locationLabel: '广东省汕头市' },
  { id: 'island-22', rank: 22, name: '东澳岛', lat: 22.016667, lng: 113.666667, locationLabel: '广东省珠海市' },
  { id: 'island-23', rank: 23, name: '上下川岛', lat: 21.616667, lng: 112.733333, locationLabel: '广东省江门市' },
  { id: 'island-24', rank: 24, name: '灵山岛', lat: 35.883333, lng: 120.25, locationLabel: '山东省青岛市' },
  { id: 'island-25', rank: 25, name: '洞头列岛', lat: 27.833333, lng: 121.166667, locationLabel: '浙江省温州市' },
  { id: 'island-26', rank: 26, name: '花岙岛', lat: 29.166667, lng: 121.933333, locationLabel: '浙江省宁波市' },
  { id: 'island-27', rank: 27, name: '海王九岛', lat: 39.566667, lng: 123.083333, locationLabel: '辽宁省大连市' },
  { id: 'island-28', rank: 28, name: '三角洲岛', lat: 22.6, lng: 114.933333, locationLabel: '广东省惠州市' },
  { id: 'island-29', rank: 29, name: '放鸡岛', lat: 21.483333, lng: 111.333333, locationLabel: '广东省茂名市' },
  { id: 'island-30', rank: 30, name: '獐子岛', lat: 39.033333, lng: 122.716667, locationLabel: '辽宁省大连市' },
];

export function buildChinaNatureTopicDataset(topicSlug: string): NatureTopicDataset {
  if (topicSlug !== 'island') {
    return {
      topicSlug,
      items: [],
    };
  }

  return {
    topicSlug,
    items: chinaNatureIslandEntries.slice().sort((a, b) => a.rank - b.rank),
  };
}
