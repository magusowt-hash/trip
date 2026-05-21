'use client';

import { useRouter } from 'next/navigation';
import styles from './album.module.css';

export default function AlbumPage() {
  const router = useRouter();

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← 返回</button>
        <h1 className={styles.topTitle}>相册</h1>
      </div>

      <div className={styles.empty}>网盘相册能力已移除</div>
    </div>
  );
}
