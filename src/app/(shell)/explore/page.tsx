'use client';

import { useEffect, useMemo } from 'react';
import { useExploreFeed } from '@/components/layout/ExploreFeedContext';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { usePosts } from '@/hooks/usePosts';
import { PostCard } from '@/modules/post';
import './explore-feed.css';

export default function ExplorePage() {
  const { activeCategory } = useExploreFeed();
  const columnCount = useFeedColumnCount();
  const { posts, loading, fetchPosts, loadMore, hasMore } = usePosts();

  useEffect(() => {
    fetchPosts(activeCategory, true);
  }, [activeCategory]);

  const filteredPosts = useMemo(
    () => (activeCategory === '推荐' ? posts : posts.filter((item) => item.topic === activeCategory)),
    [posts, activeCategory],
  );

  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => [] as typeof filteredPosts);
    filteredPosts.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [filteredPosts, columnCount]);

  return (
    <div className={`explore-feed explore-feed-masonry explore-feed-masonry--cols-${columnCount}`}>
      {columns.map((colItems, colIndex) => (
        <div key={colIndex} className="explore-feed-column">
          {colItems.map((item) => (
            <PostCard
              key={item.id}
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
      ))}
    </div>
  );
}
