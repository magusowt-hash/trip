export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  status: 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  retryCount: number;
}

export interface MessageQueueItem {
  id: number | string;
  message: Message;
  timestamp: number;
  retryCount: number;
}

export interface NotificationOptions {
  soundEnabled: boolean;
  volume: number;
}