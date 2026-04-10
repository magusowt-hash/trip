'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface ActiveChatInfo {
  id: string;
  name: string;
  avatar: string;
}

interface ChatContextType {
  activeChat: ActiveChatInfo | null;
  setActiveChat: (chat: ActiveChatInfo | null) => void;
}

const ChatContext = createContext<ChatContextType>({
  activeChat: null,
  setActiveChat: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [activeChat, setActiveChat] = useState<ActiveChatInfo | null>(null);

  return (
    <ChatContext.Provider value={{ activeChat, setActiveChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}