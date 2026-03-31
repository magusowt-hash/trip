'use client';

import type { ReactNode } from 'react';
import { PublishFlowProvider } from '@/components/layout/PublishFlowProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return <PublishFlowProvider>{children}</PublishFlowProvider>;
}
