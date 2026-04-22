'use client';

import { useEffect, useState, useRef } from 'react';
import { useMemo } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { useUserPosts } from '@/hooks/useUserPosts';
import { useUserFavorites } from '@/hooks/useUserFavorites';
import { PostCard } from '@/modules/post';
import '../explore/explore-feed.css';
import styles from './page.module.css';

export function UserMine() {
  const { profile, loading: profileLoading } = useUserProfile();
  const columnCount = useFeedColumnCount();
  const { posts, loading: postsLoading, fetchUserPosts } = useUserPosts();
  const { favorites, loading: favoritesLoading, fetchFavorites } = useUserFavorites();
  const [activeTab, setActiveTab] = useState<'posts' | 'favorites'>('posts');

  const avatar = profile?.avatar || '/default-avatar.svg';
  const nickname = profile?.nickname || '旅行用户';

  const profileId = profile?.id;

  const profileIdRef = useRef(profileId);

  useEffect(() => {
    if (profileId && activeTab === 'posts' && profileIdRef.current !== profileId) {
      fetchUserPosts(profileId);
      profileIdRef.current = profileId;
    }
  }, [profileId, fetchUserPosts, activeTab]);

  const activeTabRef = useRef(activeTab);
  const prevActiveTab = useRef<'posts' | 'favorites'>('posts');

  useEffect(() => {
    if (activeTab === 'favorites' && prevActiveTab.current !== 'favorites') {
      fetchFavorites(true);
      prevActiveTab.current = 'favorites';
    } else if (activeTab === 'posts') {
      prevActiveTab.current = 'posts';
    }
  }, [activeTab, fetchFavorites]);

  const currentPosts = activeTab === 'posts' ? posts : favorites;

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof currentPosts);
    currentPosts.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [currentPosts, columnCount]);

  const isLoading = activeTab === 'posts' ? postsLoading : favoritesLoading;

  if (profileLoading || isLoading) {
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

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'posts' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          我的帖子
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'favorites' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          我的收藏
        </button>
      </div>

      <h2 className={styles.sectionHeading}>
        {activeTab === 'posts' ? '我的帖子' : '我的收藏'}
      </h2>
      <div className={`explore-feed explore-feed-masonry explore-feed-masonry--cols-${columnCount}`}>
        {columns.length === 0 ? (
          <div className={styles.emptyState}>
            {activeTab === 'posts' ? '还没有帖子，快去发布第一篇吧！' : '还没有收藏，快去发现喜欢的帖子吧！'}
          </div>
) : (
          columns.map((colItems, colIndex) => (
            <div key={colIndex} className="explore-feed-column">
              {colItems.map((item: any) => (
                <PostCard
                  key={item.id}
                  postId={String(item.postId || item.id)}
                  cover={item.coverImageUrl || ''}
                  topic={item.topic || '推荐'}
                  title={item.title}
                  author={item.author || '未知作者'}
                  avatar={item.avatar || ''}
                  gallery={item.gallery || []}
                  comments={item.commentsCnt || 0}
                  favorites={item.favoritesCnt || 0}
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
