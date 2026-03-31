'use client';

import { useEffect, useMemo, useState } from 'react';
import { SIDEBAR_PROFILE } from '@/components/layout/navTabs';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { PostCard } from '@/modules/post';
import '../explore/explore-feed.css';
import styles from './page.module.css';

const STATS = [
  { value: 128, label: '收藏' },
  { value: 56, label: '足迹' },
  { value: 12, label: '订单' },
] as const;

const AUTHOR = SIDEBAR_PROFILE.nickname;
const AVATAR = SIDEBAR_PROFILE.avatar;

const buildDemoImage = (label: string, variant: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${variant % 2 === 0 ? '#a5b4fc' : '#7dd3fc'}"/>
          <stop offset="100%" stop-color="${variant % 2 === 0 ? '#fbcfe8' : '#fef08a'}"/>
        </linearGradient>
      </defs>
      <rect width="900" height="1200" fill="url(#bg)"/>
      <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#111827" font-size="48" font-family="Arial, sans-serif">${label}</text>
    </svg>`
  )}`;

const makeGallery = (seed: string) =>
  Array.from({ length: 12 }, (_, idx) => buildDemoImage(seed.toUpperCase(), idx));

/** Demo：当前账号发布的帖子 */
const MY_POSTS = [
  {
    cover: buildDemoImage('KYOTO', 0),
    topic: '城市漫游',
    title: '京都红叶季散步地图',
    content: '自备路线：哲学之道 → 南禅寺，避开人潮的时间段笔记。',
    author: AUTHOR,
    avatar: AVATAR,
    gallery: makeGallery('kyoto'),
  },
  {
    cover: buildDemoImage('HANGZHOU', 1),
    topic: '摄影灵感',
    title: '西湖边晨拍记录',
    content: '长焦压缩断桥与保俶塔的经典机位，附日出前后黄金半小时。',
    author: AUTHOR,
    avatar: AVATAR,
    gallery: makeGallery('hangzhou'),
  },
  {
    cover: buildDemoImage('QINGDAO', 2),
    topic: '海边假期',
    title: '青岛两日轻量化攻略',
    content: '老城区步行 + 海边看海，适合不想赶路的周末。',
    author: AUTHOR,
    avatar: AVATAR,
    gallery: makeGallery('qingdao'),
  },
  {
    cover: '/picture/picture-001.jpg',
    topic: '推荐',
    title: '我的第一篇本地图集',
    content: '用项目里的 picture 素材测试发帖与多图浏览。',
    author: AUTHOR,
    avatar: AVATAR,
    gallery: ['/picture/picture-001.jpg', '/picture/picture-002.jpg', '/picture/picture-003.jpeg'],
  },
];

export function UserMine() {
  const [loading, setLoading] = useState(true);
  const columnCount = useFeedColumnCount();

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(t);
  }, []);

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof MY_POSTS);
    MY_POSTS.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [columnCount]);

  if (loading) {
    return (
      <section className={styles.page} aria-busy="true" aria-label="加载中">
        <div className={`${styles.profileBar} ${styles.profileBarSkeleton}`}>
          <div className={styles.profileLeft}>
            <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
            <div className={styles.profileMeta}>
              <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: 120 }} />
              <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: 72, height: 12 }} />
            </div>
          </div>
        </div>
        <div className={`${styles.skeleton} ${styles.skeletonFeed}`} />
      </section>
    );
  }

  return (
    <section className={`${styles.page} ${styles.contentReveal}`}>
      <header className={styles.profileBar}>
        <div className={styles.profileLeft}>
          <img className={styles.profileAvatar} src={AVATAR} alt="" width={72} height={72} />
          <div className={styles.profileMeta}>
            <h1 className={styles.userName}>{AUTHOR}</h1>
            <p className={styles.userId}>ID · 883901</p>
            <p className={styles.bio}>记录每一次出发，收藏路上的风景与故事。</p>
          </div>
        </div>
        <ul className={styles.statsInline} aria-label="数据统计">
          {STATS.map((s) => (
            <li key={s.label} className={styles.statItem}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </li>
          ))}
        </ul>
      </header>

      <h2 className={styles.sectionHeading}>我的帖子</h2>
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
                avatar={item.avatar}
                gallery={item.gallery}
                feedEnlarged
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
