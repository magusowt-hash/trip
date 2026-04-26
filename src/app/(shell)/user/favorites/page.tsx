'use client';

import { useEffect } from 'react';
import { useMemo } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { useUserFavorites } from '@/hooks/useUserFavorites';
import { PostCard } from '@/modules/post';
import '../../explore/explore-feed.css';
import styles from '../page.module.css';

export default function UserFavoritesPage() {
  const { profile, loading: profileLoading } = useUserProfile();
  const columnCount = useFeedColumnCount();
  const { favorites, loading: favoritesLoading, fetchFavorites } = useUserFavorites();

  const avatar = profile?.avatar || '/default-avatar.svg';
  const nickname = profile?.nickname || '旅行用户';

  useEffect(() => {
    fetchFavorites(true);
  }, [fetchFavorites]);

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof favorites);
    favorites.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [favorites, columnCount]);

  if (profileLoading || favoritesLoading) {
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

      <h2 className={styles.sectionHeading}>我的收藏</h2>
      <div className={`explore-feed explore-feed-masonry explore-feed-masonry--cols-${columnCount}`}>
        {favorites.length === 0 ? (
          <div className={styles.emptyState}>还没有收藏，快去发现喜欢的帖子吧！</div>
        ) : (
          columns.map((colItems, colIndex) => (
            <div key={colIndex} className="explore-feed-column">
              {colItems.map((item) => (
                <PostCard
                  key={item.id}
                  postId={String(item.postId)}
                  cover={item.coverImageUrl || ''}
                  topic={item.topic}
                  title={item.title}
                  author="未知作者"
                  avatar=""
                  feedEnlarged
                />
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
