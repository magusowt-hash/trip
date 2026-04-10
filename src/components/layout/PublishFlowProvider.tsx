'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PostComposeModal } from '@/components/post-compose/PostComposeModal';

type Ctx = {
  openPublish: () => void;
  closePublish: () => void;
};

const PublishFlowContext = createContext<Ctx | null>(null);

export function usePublishFlow() {
  const ctx = useContext(PublishFlowContext);
  if (!ctx) throw new Error('usePublishFlow must be used within PublishFlowProvider');
  return ctx;
}

export function PublishFlowProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openPublish = useCallback(() => setOpen(true), []);
  const closePublish = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openPublish, closePublish }), [openPublish, closePublish]);

  return (
    <PublishFlowContext.Provider value={value}>
      {children}
      <PostComposeModal open={open} onClose={() => setOpen(false)} />
    </PublishFlowContext.Provider>
  );
}
