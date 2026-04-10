'use client';

import type { ReactNode } from 'react';
import { PublishFlowProvider } from '@/components/layout/PublishFlowProvider';
import { UserProfileProvider } from '@/store/UserProfileContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { ChatProvider } from '@/context/ChatContext';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UserProfileProvider>
      <WebSocketProvider>
        <PublishFlowProvider>
          <ChatProvider>{children}</ChatProvider>
        </PublishFlowProvider>
      </WebSocketProvider>
    </UserProfileProvider>
  );
}
