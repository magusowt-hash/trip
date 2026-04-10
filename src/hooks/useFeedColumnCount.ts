'use client';

import { useEffect, useState } from 'react';

/** 与发现页一致的瀑布流列数（用于个人帖展示） */
export function useFeedColumnCount() {
  const [n, setN] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w <= 520) setN(1);
      else if (w <= 1023) setN(2);
      else setN(4);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return n;
}
