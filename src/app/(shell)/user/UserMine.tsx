'use client';

import { useMemo } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { PostCard } from '@/modules/post';
import '../explore/explore-feed.css';
import styles from './page.module.css';

export function UserMine() {
  const { profile, loading: profileLoading } = useUserProfile();
  const columnCount = useFeedColumnCount();

  const avatar = profile?.avatar || '/default-avatar.svg';
  const nickname = profile?.nickname || '旅行用户';

  type MyPost = {
    cover: string;
    topic: string;
    title: string;
    content: string;
    author: string;
    avatar: string;
    gallery: string[];
  };

  const MY_POSTS: MyPost[] = [];

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof MY_POSTS);
    MY_POSTS.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [columnCount, MY_POSTS]);

  if (profileLoading) {
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
          <img className={styles.profileAvatar} src={avatar} alt="" width={72} height={72} />
          <div className={styles.profileMeta}>
            <h1 className={styles.userName}>{nickname}</h1>
            <p className={styles.userId}>ID · {profile?.id || ''}</p>
            <p className={styles.bio}>记录每一次出发，收藏路上的风景与故事。</p>
          </div>
        </div>
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