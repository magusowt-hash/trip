'use client';

import { useEffect, useState } from 'react';
import { ListDetailModal } from '@/modules/lists/ListDetailModal';

interface ListItem {
  id: number;
  list_id: number;
  title: string;
  cover_image: string | null;
  description: string | null;
  lng: string | null;
  lat: string | null;
  address: string | null;
  order_num: number;
}

export default function UserFavoritesPlacesPage() {
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [placeItems, setPlaceItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<ListItem | null>(null);
  const [ratings, setRatings] = useState<Map<number, { rating: number; comment: string }>>(new Map());

  const handleRatingChange = async (itemId: number, rating: number, comment: string) => {
    const prev = ratings.get(itemId);
    const newRatings = new Map(ratings);
    newRatings.set(itemId, { rating, comment });
    setRatings(newRatings);
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetType: 'list_item', targetId: itemId, rating, comment }),
      });
      if (!res.ok) {
        if (prev) newRatings.set(itemId, prev);
        else newRatings.delete(itemId);
        setRatings(newRatings);
      }
    } catch {
      if (prev) newRatings.set(itemId, prev);
      else newRatings.delete(itemId);
      setRatings(newRatings);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [listsRes, userRes, ratingsRes] = await Promise.all([
          fetch('/api/lists'),
          fetch('/api/user/lists', { credentials: 'include' }),
          fetch('/api/ratings', { credentials: 'include' }),
        ]);
        
        if (!listsRes.ok) {
          setError('榜单加载失败');
          setLoading(false);
          return;
        }
        
        const listsData = await listsRes.json();
        const allItems = listsData.items || [];
        const userData = await userRes.json();
        const ratingsData = await ratingsRes.json();
        
        const ids = (userData.favoriteLists || []).map((l: { listItemId: number }) => l.listItemId);
        setFavoriteIds(ids);
        setPlaceItems(allItems.filter((item: ListItem) => ids.includes(item.id)));

        if (ratingsData && ratingsData.ratings) {
          const map = new Map<number, { rating: number; comment: string }>(
            ratingsData.ratings
              .filter((r: any) => r.targetType === 'list_item')
              .map((r: any) => [r.targetId, { rating: r.rating, comment: r.comment || '' }] as [number, { rating: number; comment: string }])
          );
          setRatings(map);
        }
      } catch (err) {
        console.error('loadData error:', err);
        setError('加载失败，请刷新页面重试');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleRemoveFavorite = async (itemId: number) => {
    const wasFavorite = favoriteIds.includes(itemId);
    const newFavorites = favoriteIds.filter(id => id !== itemId);
    setFavoriteIds(newFavorites);

    try {
      const res = await fetch('/api/user/lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          favoriteLists: newFavorites.map(id => ({ listItemId: id, addedAt: new Date().toISOString() }))
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setFavoriteIds([...favoriteIds]);
        alert('请先登录后再取消收藏');
        return;
      }
      if (!res.ok) {
        setFavoriteIds([...favoriteIds]);
      }
    } catch (err) {
      console.error(err);
      setFavoriteIds([...favoriteIds]);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 600 }}>地点收藏</h1>
      
      {placeItems.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          还没有收藏过任何地点
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {placeItems.map(item => (
            <div
              key={item.id}
              onClick={() => setModalItem(item)}
              style={{
                display: 'flex',
                gap: 12,
                padding: 12,
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                cursor: 'pointer',
              }}
            >
              {item.cover_image && (
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 8,
                    background: `url(${item.cover_image}) center/cover`,
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </h3>
                {item.address && (
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.address}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', color: '#ef4444', fontSize: 12 }}>
                ♥ 已收藏
              </div>
            </div>
          ))}
        </div>
      )}

      {modalItem && (
        <ListDetailModal
          open={!!modalItem}
          onClose={() => setModalItem(null)}
          item={{
            id: modalItem.id,
            title: modalItem.title,
            coverImage: modalItem.cover_image,
            description: modalItem.description,
            address: modalItem.address,
          }}
          favorited={favoriteIds.includes(modalItem.id)}
          visited={false}
          rating={ratings.get(modalItem.id)?.rating || 0}
          comment={ratings.get(modalItem.id)?.comment || ''}
          onFavoriteClick={() => handleRemoveFavorite(modalItem.id)}
          onVisitedClick={() => {}}
          onRatingChange={(rating, comment) => handleRatingChange(modalItem.id, rating, comment)}
        />
      )}
    </div>
  );
}