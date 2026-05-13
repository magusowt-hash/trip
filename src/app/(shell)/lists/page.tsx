'use client';

import { useState, useEffect, useRef } from 'react';
import PlanMap from '@/components/PlanMap';
import { ListDetailModal } from '@/modules/lists/ListDetailModal';
import styles from './lists-page.module.css';

interface ListItem {
  id: number;
  list_id: number;
  title: string;
  cover_image: string | null;
  description: string | null;
  intro: string | null;
  image_url: string | null;
  image_urls?: string[];
  lng: string | null;
  lat: string | null;
  address: string | null;
  transport_plane?: string | null;
  transport_train?: string | null;
  transport_bus?: string | null;
  rating_type?: string | null;
  custom_rating?: string | null;
  order_num: number;
}

interface List {
  id: number;
  name: string;
  cover_image: string | null;
  lng: string | null;
  lat: string | null;
  position: number | null;
  intro: string | null;
}

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [mapMarkers, setMapMarkers] = useState<{ id: number; position: [number, number]; title: string; address?: string; description?: string }[]>([]);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
  const [modalItem, setModalItem] = useState<ListItem | null>(null);
  const [favoriteItemIds, setFavoriteItemIds] = useState<Set<number>>(new Set());
  const [visitedItemIds, setVisitedItemIds] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Map<number, { rating: number; comment: string }>>(new Map());
  const [averageRatings, setAverageRatings] = useState<Map<number, { average: number; count: number }>>(new Map());
  const itemListRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const handleMapReady = (map: any) => {
    mapInstanceRef.current = map;
  };

  useEffect(() => {
    fetch('/api/user/lists', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!data || data.error) return;
        if (data.favoriteLists) {
          const ids = new Set<number>(data.favoriteLists.map((l: { listItemId: number }) => l.listItemId));
          setFavoriteItemIds(ids);
        }
      })
      .catch(() => {});
    fetch('/api/ratings', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data && data.ratings) {
          const map = new Map<number, { rating: number; comment: string }>(
            data.ratings
              .filter((r: any) => r.targetType === 'list_item')
              .map((r: any) => [r.targetId, { rating: r.rating, comment: r.comment || '' }] as [number, { rating: number; comment: string }])
          );
          setRatings(map);
        }
      })
      .catch(() => {});
    fetch('/api/footprints/groups', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const defaultGroup = (data.groups || []).find((g: any) => g.isDefault === 1);
        if (defaultGroup) {
          fetch(`/api/footprints/groups/${defaultGroup.id}/items`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
              const ids = new Set<number>((data.items || []).map((i: any) => i.listItemId));
              setVisitedItemIds(ids);
            });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/lists')
      .then(res => {
        if (!res.ok) {
          console.log('Failed to load lists');
          return res.json();
        }
        return res.json();
      })
      .then(data => {
        if (data && data.lists) {
          setLists(data.lists);
          if (data.lists.length > 0) {
            setSelectedListId(data.lists[0].id);
          }
        }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (selectedListId) {
      fetch(`/api/lists?list_id=${selectedListId}`)
        .then(res => res.json())
        .then(data => {
          if (data.items) {
            const transformed = data.items.map((item: ListItem) => ({
              ...item,
              image_urls: item.image_url ? item.image_url.split(',').filter(Boolean).map((s: string) => s.trim()) : [],
            }));
            setItems(transformed);
          }
        });
    }
  }, [selectedListId]);

  useEffect(() => {
    if (items.length === 0) return;
    const itemIds = items.map(i => i.id).join(',');
    fetch(`/api/ratings?averageOnly=true&targetType=list_item&targetId=${itemIds}`)
      .then(res => res.json())
      .then(data => {
        const newAverages = new Map<number, { average: number; count: number }>();
        if (data.averages && Object.keys(data.averages).length > 0) {
          items.forEach(item => {
            const avgData = data.averages[String(item.id)];
            newAverages.set(item.id, { 
              average: avgData?.average || 0, 
              count: avgData?.count || 0 
            });
          });
        } else if (data.average !== undefined) {
          items.forEach(item => {
            newAverages.set(item.id, { average: data.average || 0, count: data.count || 0 });
          });
        }
        if (newAverages.size > 0) {
          setAverageRatings(newAverages);
        }
      })
      .catch(() => {});
  }, [items]);

  useEffect(() => {
    const markers = items
      .filter(item => item.lng && item.lat)
      .map(item => ({
        id: item.id,
        position: [parseFloat(item.lng!), parseFloat(item.lat!)] as [number, number],
        title: item.title,
        address: item.address || undefined,
        description: item.description || undefined,
        intro: item.intro || undefined,
        image_url: item.image_url || undefined,
        transport_plane: item.transport_plane || undefined,
        transport_train: item.transport_train || undefined,
        transport_bus: item.transport_bus || undefined,
      }));
    setMapMarkers(markers);
  }, [items]);

  const handleListItemClick = (item: ListItem) => {
    if (item.lng && item.lat) {
      const lng = parseFloat(item.lng);
      const lat = parseFloat(item.lat);
      setFocusPosition([lng, lat]);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setZoomAndCenter(8, [lng, lat], true);
      }
    }
  };

  const handleItemDetailClick = (item: ListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalItem(item);
    fetch(`/api/ratings?averageOnly=true&targetType=list_item&targetId=${item.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.average !== undefined) {
          setAverageRatings(prev => {
            const newMap = new Map(prev);
            newMap.set(item.id, { average: data.average || 0, count: data.count || 0 });
            return newMap;
          });
        }
      })
      .catch(() => {});
  };

  const handleMapMarkerClick = (marker: { id?: number; position: [number, number] }) => {
    if (marker.id) {
      setFocusPosition(null);
      const item = items.find(i => i.id === marker.id);
      if (item) {
        setModalItem(item);
        fetch(`/api/ratings?averageOnly=true&targetType=list_item&targetId=${item.id}`)
          .then(res => res.json())
          .then(data => {
            if (data.average !== undefined) {
              setAverageRatings(prev => {
                const newMap = new Map(prev);
                newMap.set(item.id, { average: data.average || 0, count: data.count || 0 });
                return newMap;
              });
            }
          })
          .catch(() => {});
        return;
      }
      const el = document.querySelector(`[data-item-id="${marker.id}"]`);
      if (el && itemListRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const selectedList = lists.find(l => l.id === selectedListId);

  const handleFavorite = async (itemId: number) => {
    const wasFavorite = favoriteItemIds.has(itemId);
    const newFavorites = new Set(favoriteItemIds);
    if (wasFavorite) {
      newFavorites.delete(itemId);
    } else {
      newFavorites.add(itemId);
    }
    setFavoriteItemIds(newFavorites);

    try {
      const res = await fetch('/api/user/lists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ favoriteLists: Array.from(newFavorites).map(id => ({ listItemId: id, addedAt: new Date().toISOString() })) }),
      });
      if (res.status === 401 || res.status === 403) {
        setFavoriteItemIds(prev => {
          const rollback = new Set(prev);
          if (wasFavorite) rollback.add(itemId);
          else rollback.delete(itemId);
          return rollback;
        });
        alert('请先登录后再收藏');
        return;
      }
      if (!res.ok) {
        setFavoriteItemIds(prev => {
          const rollback = new Set(prev);
          if (wasFavorite) rollback.add(itemId);
          else rollback.delete(itemId);
          return rollback;
        });
      }
    } catch {
      setFavoriteItemIds(prev => {
        const rollback = new Set(prev);
        if (wasFavorite) rollback.add(itemId);
        else rollback.delete(itemId);
        return rollback;
      });
    }
  };

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

  const handleVisited = async (itemId: number) => {
    const wasVisited = visitedItemIds.has(itemId);
    const newVisited = new Set(visitedItemIds);
    if (wasVisited) {
      newVisited.delete(itemId);
    } else {
      newVisited.add(itemId);
    }
    setVisitedItemIds(newVisited);

    // If canceling visited, also delete rating from database
    if (wasVisited) {
      const newRatings = new Map(ratings);
      newRatings.delete(itemId);
      setRatings(newRatings);

      try {
        await fetch('/api/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetType: 'list_item', targetId: itemId, rating: 0 }),
        });
      } catch (e) {
        console.error('Failed to delete rating:', e);
      }
    }

    // Sync to footprint default group
    try {
      if (!wasVisited) {
        await fetch('/api/footprints/default/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ list_item_id: itemId }),
        });
      } else {
        await fetch(`/api/footprints/default/items?list_item_id=${itemId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
    } catch {}

    // Delete rating when canceling visited
    if (wasVisited) {
      try {
        await fetch('/api/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetType: 'list_item', targetId: itemId, rating: 0, comment: '' }),
        });
      } catch {}
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.mapCol}>
          <PlanMap markers={mapMarkers} focusPosition={focusPosition} onMarkerClick={handleMapMarkerClick} onMapLoad={handleMapReady} autoLoadMarkers={false} />
        </div>
   <div className={styles.listCol}>
     <div className={styles.listScroll}>
       {lists.map(list => (
         <div 
           key={list.id}
           className={`${styles.listCard} ${selectedListId === list.id ? styles.active : ''}`}
           onClick={() => setSelectedListId(list.id)}
         >
           <div 
             className={styles.listCover}
             style={{ backgroundImage: list.cover_image ? `url(${list.cover_image})` : undefined }}
           >
             {!list.cover_image && <span>无图</span>}
           </div>
           <div className={styles.listName}>{list.name}</div>
         </div>
       ))}
     </div>

     {selectedList && (
       <div className={styles.listDetail}>
         {selectedList.position !== null && (
           <span className={styles.listPosition}>第{selectedList.position}名</span>
         )}
         {selectedList.intro && (
           <p className={styles.listIntro}>{selectedList.intro}</p>
         )}
       </div>
     )}

     <div className={styles.itemCount}>共 {items.length} 项</div>
<div className={styles.itemList} ref={itemListRef}>
        {items.map(item => (
          <div key={item.id} className={styles.itemCard} data-item-id={item.id} onClick={() => handleListItemClick(item)}>
            {item.cover_image && (
              <div className={styles.itemCover} style={{ backgroundImage: `url(${item.cover_image})` }} />
            )}
            <div className={styles.itemInfo}>
              <h3 className={styles.itemTitle}>{item.title}</h3>
              {item.description && <p className={styles.itemDesc}>{item.description}</p>}
            </div>
            <div className={styles.itemArrow} onClick={(e) => handleItemDetailClick(item, e)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="3" cy="8" r="1.5" fill="#9ca3af"/>
                <circle cx="8" cy="8" r="1.5" fill="#9ca3af"/>
                <circle cx="13" cy="8" r="1.5" fill="#9ca3af"/>
              </svg>
            </div>
          </div>
        ))}
      </div>
   </div>
      </div>

      {modalItem && (
        <ListDetailModal
          open={!!modalItem}
          onClose={() => setModalItem(null)}
          item={{
            id: modalItem.id,
            title: modalItem.title,
            coverImage: modalItem.cover_image,
            description: modalItem.description,
            intro: modalItem.intro,
            image_url: modalItem.image_url,
            image_urls: modalItem.image_urls,
            lng: modalItem.lng,
            lat: modalItem.lat,
            address: modalItem.address,
            transport_plane: modalItem.transport_plane,
            transport_train: modalItem.transport_train,
            transport_bus: modalItem.transport_bus,
            rating_type: modalItem.rating_type,
            custom_rating: modalItem.custom_rating,
          }}
          favorited={favoriteItemIds.has(modalItem.id)}
          visited={visitedItemIds.has(modalItem.id)}
          rating={ratings.get(modalItem.id)?.rating || 0}
          comment={ratings.get(modalItem.id)?.comment || ''}
          averageRating={averageRatings.get(modalItem.id)?.average || 0}
          ratingCount={averageRatings.get(modalItem.id)?.count || 0}
          onFavoriteClick={() => handleFavorite(modalItem.id)}
          onVisitedClick={() => handleVisited(modalItem.id)}
          onRatingChange={(rating, comment) => handleRatingChange(modalItem.id, rating, comment)}
        />
      )}
    </div>
  );
}