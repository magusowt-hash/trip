'use client';

import { useMemo } from 'react';
import { useExploreFeed } from '@/components/layout/ExploreFeedContext';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { PostCard } from '@/modules/post';
import './explore-feed.css';

const buildDemoImage = (label: string, variant: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${variant % 2 === 0 ? '#c7d2fe' : '#bfdbfe'}"/>
          <stop offset="100%" stop-color="${variant % 2 === 0 ? '#e9d5ff' : '#fde68a'}"/>
        </linearGradient>
      </defs>
      <rect width="900" height="1200" fill="url(#bg)"/>
      <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#111827" font-size="56" font-family="Arial, sans-serif">${label}</text>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#374151" font-size="28" font-family="Arial, sans-serif">Demo ${variant + 1}</text>
    </svg>`
  )}`;

const makeGallery = (seed: string) =>
  Array.from({ length: 20 }, (_, idx) => buildDemoImage(seed.toUpperCase(), idx));

const feed = [
  {
    cover: buildDemoImage('TOKYO', 0),
    topic: '城市漫游',
    title: '东京 5 日预算版',
    content: '3K 预算覆盖交通、住宿与核心打卡，附地铁换乘建议。',
    author: '北方旅人',
    gallery: makeGallery('tokyo'),
  },
  {
    cover: buildDemoImage('XIAMEN', 1),
    topic: '海边假期',
    title: '厦门慢旅行路线',
    content: '鼓浪屿+沙坡尾+日落机位，适合周末轻松出行。',
    author: '海风笔记',
    gallery: makeGallery('xiamen'),
  },
  {
    cover: buildDemoImage('DALI', 2),
    topic: '避坑指南',
    title: '大理雨季避坑指南',
    content: '天气变化大时的路线与装备建议，减少行程临时变更。',
    author: '山川计划',
    gallery: makeGallery('dali'),
  },
  {
    cover: buildDemoImage('CHONGQING', 3),
    topic: '摄影灵感',
    title: '重庆夜景机位合集',
    content: '两江夜景高效拍摄点位整理，附时间段和焦段建议。',
    author: '城市观察者',
    gallery: makeGallery('chongqing'),
  },
  {
    cover: '/picture/picture-001.jpg',
    topic: '城市漫游',
    title: '示例帖子（本地 picture/ 图片）',
    content: '图片来源引用项目根目录 `picture/` 并已重命名后复制到 `public/picture/`，用于测试主图切换与全屏查看。',
    author: '本地测试员',
    gallery: [
      '/picture/picture-001.jpg',
      '/picture/picture-002.jpg',
      '/picture/picture-003.jpeg',
      '/picture/picture-004.jpg',
      '/picture/picture-005.jpg',
      '/picture/picture-006.jpg',
      '/picture/picture-007.jpg',
      '/picture/picture-008.webp',
      '/picture/picture-009.webp',
      '/picture/picture-010.jpeg',
      '/picture/picture-011.jpeg',
      '/picture/picture-012.jpeg',
      '/picture/picture-013.jpeg',
      '/picture/picture-014.jpeg',
      '/picture/picture-015.jpeg',
      '/picture/picture-016.jpeg',
      '/picture/picture-017.jpeg',
      '/picture/picture-018.jpeg',
      '/picture/picture-019.jpeg',
      '/picture/picture-020.jpg',
    ],
  },
];

export default function ExplorePage() {
  const { activeCategory } = useExploreFeed();
  const columnCount = useFeedColumnCount();
  const filteredFeed = useMemo(
    () => (activeCategory === '推荐' ? feed : feed.filter((item) => item.topic === activeCategory)),
    [activeCategory],
  );

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof filteredFeed);
    filteredFeed.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [filteredFeed, columnCount]);

  return (
    <div className={`explore-feed explore-feed-masonry explore-feed-masonry--cols-${columnCount}`}>
      {columns.map((colItems, colIndex) => (
        <div key={colIndex} className="explore-feed-column">
          {colItems.map((item) => (
            <PostCard
              key={item.title}
              cover={item.cover}
              topic={item.topic}
              title={item.title}
              content={item.content}
              author={item.author}
              gallery={item.gallery}
              feedEnlarged
            />
          ))}
        </div>
      ))}
    </div>
  );
}
