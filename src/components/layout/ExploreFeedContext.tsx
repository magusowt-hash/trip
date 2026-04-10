'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export const EXPLORE_CATEGORIES = ['推荐', '城市漫游', '海边假期', '避坑指南', '摄影灵感'] as const;

type Ctx = {
  activeCategory: string;
  setActiveCategory: (v: string) => void;
};

const ExploreFeedContext = createContext<Ctx | null>(null);

export function ExploreFeedProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<string>('推荐');
  const value = useMemo(() => ({ activeCategory, setActiveCategory }), [activeCategory]);
  return <ExploreFeedContext.Provider value={value}>{children}</ExploreFeedContext.Provider>;
}

export function useExploreFeed() {
  const ctx = useContext(ExploreFeedContext);
  if (!ctx) throw new Error('useExploreFeed must be used within ExploreFeedProvider');
  return ctx;
}
