'use client';

import { useRef } from 'react';
import PlanMap from '@/components/PlanMap';
import styles from './footprints-page.module.css';

export default function FootprintsPage() {
  const mapInstanceRef = useRef<any>(null);

  const handleMapReady = (map: any) => {
    mapInstanceRef.current = map;
  };

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.mapCol}>
          <PlanMap onMapLoad={handleMapReady} autoLoadMarkers={false} />
        </div>
        <div className={styles.rightCol}>
        </div>
      </div>
    </div>
  );
}
