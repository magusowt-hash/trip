'use client';

import type { ReactNode } from 'react';
import styles from './standalone.module.css';

export default function StandaloneLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.standaloneRoot}>
      {children}
    </div>
  );
}