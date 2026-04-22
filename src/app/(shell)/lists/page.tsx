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
  const [currentCoverIndex, setCurrentCoverIndex] = useState(0);
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
            setCurrentCoverIndex(0);
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

  const coverImages = items.filter(item => item.cover_image).map(item => item.cover_image as string);
  const currentCover = coverImages[currentCoverIndex] || lists.find(l => l.id === selectedListId)?.cover_image;
  const hasMultiple = coverImages.length > 1;

  const goPrev = () => {
    if (currentCoverIndex > 0) {
      setCurrentCoverIndex(currentCoverIndex - 1);
    } else {
      setCurrentCoverIndex(coverImages.length - 1);
    }
  };

  const goNext = () => {
    if (currentCoverIndex < coverImages.length - 1) {
      setCurrentCoverIndex(currentCoverIndex + 1);
    } else {
      setCurrentCoverIndex(0);
    }
  };

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
                <span className={styles.listName}>{list.name}</span>
              </div>
            ))}
          </div>
          
          {coverImages.length > 0 && (
            <div className={styles.cover}>
              <div 
                className={styles.coverInner}
                style={{ backgroundImage: `url(${currentCover})` }}
              >
                {hasMultiple && (
                  <>
                    <button className={styles.coverPrev} onClick={goPrev}>‹</button>
                    <button className={styles.coverNext} onClick={goNext}>›</button>
                    <div className={styles.coverCount}>{currentCoverIndex + 1}/{coverImages.length}</div>
                  </>
                )}
              </div>
            </div>
          )}

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