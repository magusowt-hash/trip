'use client';

import { useCallback, useState } from 'react';
import type { FeedPostDTO, UserPostsResponse } from '@/types/post';

export function useUserPosts() {
  const [posts, setPosts] = useState<FeedPostDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserPosts = useCallback(async (userId: string | number) => {
    if (!userId || loading) return;

    setLoading(true);
    setError(null);

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${apiBaseUrl}/api/users/${String(userId)}/posts`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch user posts');

      const data: UserPostsResponse = await response.json();
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const refresh = useCallback(() => {
    // Will be implemented with userId from context
  }, []);

  return { posts, loading, error, fetchUserPosts, refresh };
}
