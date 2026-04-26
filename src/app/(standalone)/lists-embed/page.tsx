'use client';

import { useState, useEffect, useRef } from 'react';
import PlanMap from '@/components/PlanMap';
import styles from './lists-embed.module.css';

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

interface List {
  id: number;
  name: string;
  cover_image: string | null;
  lng: string | null;
  lat: string | null;
}

export default function ListsEmbedPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [mapMarkers, setMapMarkers] = useState<{ id: number; position: [number, number]; title: string; address?: string; description?: string }[]>([]);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
  const itemListRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const handleMapReady = (map: any) => {
    mapInstanceRef.current = map;
  };

  const logAction = (action: string, listId?: number, itemId?: number) => {
    fetch('/api/admin/embed-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, list_id: listId, item_id: itemId }),
    }).catch(() => {});
  };

  useEffect(() => {
    logAction('page_view');
  }, []);

  useEffect(() => {
    fetch('/api/lists')
      .then(res => res.json())
      .then(data => {
        if (data.lists) {
          setLists(data.lists);
          if (data.lists.length > 0) {
            setSelectedListId(data.lists[0].id);
          }
        }
      });
  }, []);

  useEffect(() => {
    if (selectedListId) {
      fetch(`/api/lists?list_id=${selectedListId}`)
        .then(res => res.json())
        .then(data => {
          if (data.items) {
            setItems(data.items);
          }
        });
    }
  }, [selectedListId]);

  useEffect(() => {
    const markers = items
      .filter(item => item.lng && item.lat)
      .map(item => ({
        id: item.id,
        position: [parseFloat(item.lng!), parseFloat(item.lat!)] as [number, number],
        title: item.title,
        address: item.address || undefined,
        description: item.description || undefined,
      }));
    setMapMarkers(markers);
  }, [items]);

  const handleMapMarkerClick = (marker: { id?: number; position: [number, number] }) => {
    if (marker.id) {
      setFocusPosition(null);
      const el = document.querySelector(`[data-item-id="${marker.id}"]`);
      if (el && itemListRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleListItemClick = (item: ListItem) => {
    logAction('item_click', item.list_id, item.id);
    if (item.lng && item.lat) {
      const lng = parseFloat(item.lng);
      const lat = parseFloat(item.lat);
      setFocusPosition([lng, lat]);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setZoomAndCenter(8, [lng, lat], true);
      }
    }
  };

  const selectedList = lists.find(l => l.id === selectedListId);

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
                onClick={() => { setSelectedListId(list.id); logAction('list_click', list.id); }}
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}