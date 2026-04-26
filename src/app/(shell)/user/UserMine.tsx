'use client';

import { useEffect, useState, useRef } from 'react';
import { useMemo } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { useUserPosts } from '@/hooks/useUserPosts';
import { useUserFavorites } from '@/hooks/useUserFavorites';
import { getUser } from '@/store/userStore';
import type { FeedPostDTO } from '@/types/post';
import type { FavoritePost } from '@/hooks/useUserFavorites';
import { PostCard } from '@/modules/post';
import '../explore/explore-feed.css';
import styles from './page.module.css';

interface RatingItem {
  id: number;
  targetType: string;
  targetId: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  itemTitle?: string;
}

export function UserMine() {
  const { profile, loading: profileLoading } = useUserProfile();
  const columnCount = useFeedColumnCount();
  const { posts, loading: postsLoading, fetchUserPosts } = useUserPosts();
  const { favorites, loading: favoritesLoading, fetchFavorites } = useUserFavorites();
  const [activeTab, setActiveTab] = useState<'posts' | 'favorites' | 'ratings'>('posts');
  const [ratingItems, setRatingItems] = useState<RatingItem[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const ratingsFetchedRef = useRef(false);

  const avatar = profile?.avatar || '/default-avatar.svg';
  const nickname = profile?.nickname || '旅行用户';

  const profileId = profile?.id || (typeof window !== 'undefined' ? Number(getUser()?.id) : undefined);

  const fetchedPostsForRef = useRef<number | undefined>(undefined);
  const fetchedFavoritesRef = useRef(false);
  const fetchedRatingsRef = useRef(false);

  useEffect(() => {
    if (profileId && activeTab === 'posts' && fetchedPostsForRef.current !== profileId) {
      fetchUserPosts(profileId);
      fetchedPostsForRef.current = profileId;
    }
  }, [profileId, fetchUserPosts, activeTab]);

  useEffect(() => {
    if (activeTab === 'favorites' && !fetchedFavoritesRef.current) {
      fetchFavorites(true);
      fetchedFavoritesRef.current = true;
    }
  }, [activeTab, fetchFavorites]);

  useEffect(() => {
    if (activeTab !== 'ratings' || fetchedRatingsRef.current) return;
    fetchedRatingsRef.current = true;
    setRatingsLoading(true);
    Promise.all([
      fetch('/api/ratings', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/lists').then(r => r.json()),
    ])
      .then(([ratingsData, listsData]) => {
        const allItems = (listsData.items || []) as any[];
        const itemMap = new Map<number, any>(allItems.map((i: any) => [i.id, i]));
        const items = (ratingsData.ratings || [])
          .filter((r: any) => r.targetType === 'list_item')
          .map((r: any) => ({
            ...r,
            itemTitle: itemMap.get(r.targetId)?.title || `Item #${r.targetId}`,
          }))
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRatingItems(items);
      })
      .catch(() => {})
      .finally(() => setRatingsLoading(false));
  }, [activeTab]);

  const currentPosts = activeTab === 'posts' ? posts : favorites;

  const columns = useMemo(() => {
    const cols: (FeedPostDTO | FavoritePost)[][] = Array.from({ length: columnCount }, () => []);
    currentPosts.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [currentPosts, columnCount]);

  const isLoading = activeTab === 'posts' ? postsLoading : activeTab === 'favorites' ? favoritesLoading : ratingsLoading;

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
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'ratings' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('ratings')}
        >
          我的评分
        </button>
      </div>

      {activeTab === 'ratings' ? (
        <>
          <h2 className={styles.sectionHeading}>我的评分</h2>
          {ratingItems.length === 0 ? (
            <div className={styles.emptyState}>还没有评分过任何地点</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ratingItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    background: '#fff',
                    borderRadius: 8,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <span style={{ fontSize: 14, color: '#111827' }}>{item.itemTitle}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: '#fbbf24' }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{ color: (i + 1) * 2 <= item.rating ? '#fbbf24' : '#d1d5db' }}>★</span>
                      ))}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{item.rating}.0</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className={styles.sectionHeading}>
            {activeTab === 'posts' ? '我的帖子' : '我的收藏'}
          </h2>
          <div className={`explore-feed explore-feed-masonry explore-feed-masonry--cols-${columnCount}`}>
            {currentPosts.length === 0 ? (
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
        </>
      )}
    </section>
  );
}
