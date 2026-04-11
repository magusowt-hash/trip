'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAuthTokenFromCookies } from '@/services/auth-cookies';
import { getQueue, removeFromQueue, initDB } from '@/services/messaging/storage';
import type { MessageQueueItem } from '@/services/messaging/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export interface ChatMessage {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  isRead: number;
  createdAt: string;
}

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onNewMessage: (callback: (message: ChatMessage) => void) => () => void;
  sendMessage: (receiverId: number, content: string, onSent?: (success: boolean, message?: ChatMessage) => void) => void;
  emitTyping: (receiverId: number) => void;
  onTyping: (callback: (data: { userId: number; isTyping: boolean }) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  isConnected: false,
  onNewMessage: () => () => {},
  sendMessage: () => {},
  emitTyping: () => {},
  onTyping: () => () => {},
});

type SocketAckResponse = {
  id?: number;
  error?: unknown;
};

function isChatMessage(response: ChatMessage | SocketAckResponse | undefined): response is ChatMessage {
  return Boolean(response && response.id);
}

async function loadMessageQueue(): Promise<MessageQueueItem[]> {
  await initDB();
  return await getQueue();
}

async function flushQueuedMessages(socket: Socket, queue: MessageQueueItem[]): Promise<void> {
  if (queue.length === 0) {
    return;
  }

  queue.forEach((item) => {
    socket.emit(
      'send_message',
      {
        receiverId: parseInt(item.message.receiverId, 10),
        content: item.message.content,
      },
      async (response: { id?: number } | undefined) => {
        if (response?.id) {
          await removeFromQueue(item.id);
        }
      }
    );
  });
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messageQueueRef = useRef<MessageQueueItem[]>([]);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const resetConnectionState = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setSocket(null);
    setIsConnected(false);
  }, []);

  useEffect(() => {
    loadMessageQueue()
      .then((queue) => {
        messageQueueRef.current = queue;
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (isConnected && socket) {
      heartbeatIntervalRef.current = setInterval(() => {
        socketRef.current?.emit('ping', {}, (response: SocketAckResponse | undefined) => {
          if (!response || response.error) {
            console.log('[WS] Heartbeat failed, triggering reconnect');
          }
        });
      }, 25000);
    }
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [isConnected, socket]);

  useEffect(() => {
    tokenRef.current = getAuthTokenFromCookies();
    if (tokenRef.current && WS_URL) {
      setTokenAndConnect(tokenRef.current);
    }

    const interval = setInterval(() => {
      const newToken = getAuthTokenFromCookies();
      if (newToken !== tokenRef.current) {
        tokenRef.current = newToken;
        if (newToken && WS_URL) {
          setTokenAndConnect(newToken);
        } else {
          resetConnectionState();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [resetConnectionState, setTokenAndConnect]);

  const setTokenAndConnect = useCallback((token: string) => {
    if (socketRef.current?.connected) {
      return;
    }

    console.log('[WS] Connecting to:', WS_URL);

    const newSocket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('[WS] Connected, socket id:', newSocket.id);

      void flushQueuedMessages(newSocket, messageQueueRef.current);
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('[WS] Disconnected:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[WS] Connection error:', error.message);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
  }, []);

  useEffect(() => {
    return () => {
      resetConnectionState();
    };
  }, [resetConnectionState]);

  const onNewMessage = useCallback((callback: (message: ChatMessage) => void) => {
    socket?.on('new_message', callback);
    return () => {
      socket?.off('new_message', callback);
    };
  }, [socket]);

  const sendMessage = useCallback((receiverId: number, content: string, onSent?: (success: boolean, message?: ChatMessage) => void) => {
    if (!socket?.connected) {
      onSent?.(false);
      return;
    }
    
    socket.emit('send_message', { receiverId, content }, (response: ChatMessage | SocketAckResponse | undefined) => {
      if (isChatMessage(response)) {
        onSent?.(true, response);
      } else {
        onSent?.(false);
      }
    });
  }, [socket]);

  const emitTyping = useCallback((receiverId: number) => {
    socket?.emit('typing', { receiverId });
  }, [socket]);

  const onTyping = useCallback((callback: (data: { userId: number; isTyping: boolean }) => void) => {
    socket?.on('user_typing', callback);
    return () => {
      socket?.off('user_typing', callback);
    };
  }, [socket]);

  return (
    <WebSocketContext.Provider value={{ socket, isConnected, onNewMessage, sendMessage, emitTyping, onTyping }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
