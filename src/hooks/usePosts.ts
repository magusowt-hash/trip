'use client';

import { useCallback, useState } from 'react';
import type { FeedPostDTO, FeedResponse } from '@/types/post';

export function usePosts() {
  const [posts, setPosts] = useState<FeedPostDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPosts = useCallback(async (topic?: string, reset = false) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      if (topic && topic !== '推荐') params.set('topic', topic);

      const response = await fetch(`/api/posts?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch posts');

      const data: FeedResponse = await response.json();

      setPosts((prev) => reset ? data.posts : [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) fetchPosts();
  }, [hasMore, loading, fetchPosts]);

  const refresh = useCallback(() => {
    setNextCursor(null);
    fetchPosts(undefined, true);
  }, [fetchPosts]);

  return { posts, loading, error, hasMore, fetchPosts, loadMore, refresh };
}
