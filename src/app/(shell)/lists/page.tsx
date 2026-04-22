'use client';

import { useState, useEffect } from 'react';
import PlanMap from '@/components/PlanMap';
import styles from './lists-page.module.css';

interface ListItem {
  id: number;
  list_id: number;
  title: string;
  cover_image: string | null;
  description: string | null;
  lng: string | null;
  lat: string | null;
  address: string | null;
}

interface List {
  id: number;
  name: string;
  cover_image: string | null;
  lng: string | null;
  lat: string | null;
}

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [mapMarkers, setMapMarkers] = useState<{ position: [number, number]; title: string; address?: string; description?: string }[]>([]);

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
        position: [parseFloat(item.lng!), parseFloat(item.lat!)] as [number, number],
        title: item.title,
        address: item.address || undefined,
        description: item.description || undefined,
      }));
    setMapMarkers(markers);
  }, [items]);

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.mapCol}>
          <PlanMap markers={mapMarkers} autoLoadMarkers={false} />
        </div>
        <div className={styles.listCol}>
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>榜单推荐</h2>
          </div>
          <div className={styles.listTabs}>
            {lists.map(list => (
              <div 
                key={list.id}
                className={`${styles.listTab} ${selectedListId === list.id ? styles.active : ''}`}
                onClick={() => setSelectedListId(list.id)}
              >
                {list.cover_image && (
                  <div className={styles.listCover} style={{ backgroundImage: `url(${list.cover_image})` }} />
                )}
                <span className={styles.listName}>{list.name}</span>
              </div>
            ))}
          </div>
          <div className={styles.itemCount}>共 {items.length} 项</div>
          <div className={styles.itemList}>
            {items.map(item => (
              <div key={item.id} className={styles.itemCard}>
                {item.cover_image && (
                  <div className={styles.itemCover} style={{ backgroundImage: `url(${item.cover_image})` }} />
                )}
                <div className={styles.itemInfo}>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  {item.description && <p className={styles.itemDesc}>{item.description}</p>}
                  {item.address && <p className={styles.itemAddress}>{item.address}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}