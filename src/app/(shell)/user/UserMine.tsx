'use client';

import { useEffect } from 'react';
import { useMemo } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { useUserPosts } from '@/hooks/useUserPosts';
import { PostCard } from '@/modules/post';
import '../explore/explore-feed.css';
import styles from './page.module.css';

export function UserMine() {
  const { profile, loading: profileLoading } = useUserProfile();
  const columnCount = useFeedColumnCount();
  const { posts, loading: postsLoading, fetchUserPosts } = useUserPosts();

  const avatar = profile?.avatar || '/default-avatar.svg';
  const nickname = profile?.nickname || '旅行用户';

  const profileId = profile?.id;

  useEffect(() => {
    if (profileId) {
      fetchUserPosts(profileId);
    }
  }, [profileId, fetchUserPosts]);

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof posts);
    posts.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [posts, columnCount]);

  if (profileLoading || postsLoading) {
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
        {columns.length === 0 ? (
          <div className={styles.emptyState}>还没有帖子，快去发布第一篇吧！</div>
        ) : (
          columns.map((colItems, colIndex) => (
            <div key={colIndex} className="explore-feed-column">
              {colItems.map((item) => (
                <PostCard
                  key={item.id}
                  postId={item.id}
                  cover={item.coverImageUrl}
                  topic={item.topic}
                  title={item.title}
                  author={item.author}
                  avatar={item.avatar}
                  gallery={item.gallery}
                  comments={item.commentsCnt}
                  favorites={item.favoritesCnt}
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
