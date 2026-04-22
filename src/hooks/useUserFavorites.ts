'use client';

import { useState, useCallback } from 'react';

export type FavoritePost = {
  id: number;
  postId: number;
  title: string;
  coverImageUrl: string | null;
  topic: string;
  createdAt: string;
};

export function useUserFavorites() {
  const [favorites, setFavorites] = useState<FavoritePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchFavorites = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const url = reset 
        ? '/api/favorites'
        : `/api/favorites?cursor=${cursor}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.error) return;
      
      if (reset) {
        setFavorites(data.favorites || []);
      } else {
        setFavorites(prev => [...prev, ...(data.favorites || [])]);
      }
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  return { favorites, loading, hasMore, fetchFavorites };
}
