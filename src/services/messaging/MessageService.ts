import { Message, MessageQueueItem, NotificationOptions } from './types';
import { initDB, addToQueue, getQueue, removeFromQueue } from './storage';

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function createAudioContext(): AudioContext | null {
  const audioWindow = window as WindowWithWebkitAudioContext;
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    return new AudioContextConstructor();
  } catch (error) {
    console.warn('Web Audio API not supported in this browser:', error);
    return null;
  }
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function createMessage(content: string, receiverId: string): Message {
  return {
    id: crypto.randomUUID(),
    content,
    senderId: '',
    receiverId,
    timestamp: Date.now(),
    status: 'SENDING',
    retryCount: 0,
  };
}

class NotificationServiceImpl {
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.5;

  constructor(options: Partial<NotificationOptions> = {}) {
    this.soundEnabled = options.soundEnabled ?? true;
    this.volume = options.volume ?? 0.5;
    
    if (this.soundEnabled) {
      this.audioContext = createAudioContext();
    }
  }

  playNotificationSound(): void {
    if (!this.soundEnabled || !this.audioContext) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (enabled && !this.audioContext) {
      this.audioContext = createAudioContext();
    } else if (!enabled && this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
  }
}

class MessageService {
  private queue: MessageQueueItem[] = [];
  private isOnline: boolean = true;
  private retryDelays: number[] = [1000, 2000, 4000, 8000, 16000, 30000];
  private processingQueue: boolean = false;
  private notificationService: NotificationServiceImpl | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      await initDB();
      await this.loadQueue();
      
      window.addEventListener('online', () => this.handleConnectionChange(true));
      window.addEventListener('offline', () => this.handleConnectionChange(false));
      
      this.isOnline = navigator.onLine;
    } catch (error) {
      console.error('Failed to initialize MessageService:', error);
    }
  }

  private async loadQueue() {
    try {
      this.queue = await getQueue();
      void this.processQueue();
    } catch (error) {
      console.error('Failed to load message queue:', error);
    }
  }

  setNotificationService(notificationService: NotificationServiceImpl) {
    this.notificationService = notificationService;
  }

  async sendMessage(content: string, receiverId: string): Promise<void> {
    const message = createMessage(content, receiverId);

    if (this.isOnline) {
      const sent = await this.sendViaWebSocket(message);
      if (sent) {
        message.status = 'SENT';
        return;
      }
    }

    await this.queueMessage(message);
  }

  private async queueMessage(message: Message): Promise<void> {
    const queueItem: MessageQueueItem = {
      id: 0,
      message,
      timestamp: Date.now(),
      retryCount: 0,
    };

    try {
      const id = await addToQueue(queueItem);
      queueItem.id = id as string | number;
      this.queue.push(queueItem);
      
      if (!this.processingQueue) {
        void this.processQueue();
      }
    } catch (error) {
      console.error('Failed to queue message:', error);
      message.status = 'FAILED';
      throw error;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.queue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.queue.length > 0 && this.isOnline) {
        const queueItem = this.queue[0];
        const message = queueItem.message;

        if (message.retryCount >= this.retryDelays.length) {
          console.warn(`Message ${message.id} has exceeded max retries`);
          message.status = 'FAILED';
          await removeFromQueue(queueItem.id);
          this.queue.shift();
          continue;
        }

        const sent = await this.sendViaWebSocket(message);
        
        if (sent) {
          message.status = 'SENT';
          await removeFromQueue(queueItem.id);
          this.queue.shift();
          continue;
        }

        message.retryCount++;
        queueItem.retryCount = message.retryCount;
        await addToQueue(queueItem);

        if (message.retryCount >= this.retryDelays.length) {
          message.status = 'FAILED';
          await removeFromQueue(queueItem.id);
          this.queue.shift();
        }

        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelays[Math.min(message.retryCount - 1, this.retryDelays.length - 1)])
        );
      }
    } catch (error) {
      console.error('Error processing message queue:', error);
    } finally {
      this.processingQueue = false;
      
      if (this.queue.length > 0 && this.isOnline) {
        void this.processQueue();
      }
    }
  }

  private async sendViaWebSocket(message: Message): Promise<boolean> {
    void message;
    return Math.random() > 0.3; // 70% success rate for demo
  }

  handleConnectionChange(isOnline: boolean): void {
    this.isOnline = isOnline;
    
    if (isOnline) {
      void this.processQueue();
    }
  }

  updateMessageStatus(messageId: string, status: 'DELIVERED' | 'READ'): void {
    const queueItem = this.queue.find((item) => item.message.id === messageId);
    if (queueItem) {
      queueItem.message.status = status;
      void addToQueue(queueItem);
    }
  }

  getQueueStatus(): MessageQueueItem[] {
    return [...this.queue];
  }
}

export default MessageService;
