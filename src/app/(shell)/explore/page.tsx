'use client';

import { useMemo } from 'react';
import { useExploreFeed } from '@/components/layout/ExploreFeedContext';
import { useFeedColumnCount } from '@/hooks/useFeedColumnCount';
import { PostCard } from '@/modules/post';
import './explore-feed.css';

type FeedItem = {
  cover: string;
  topic: string;
  title: string;
  content: string;
  author: string;
  gallery: string[];
};

const feed: FeedItem[] = [];

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
