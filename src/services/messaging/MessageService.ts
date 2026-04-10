import { Message, MessageQueueItem, NotificationOptions } from './types';
import { initDB, addToQueue, getQueue, removeFromQueue, clearQueue } from './storage';

class NotificationServiceImpl {
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.5;

  constructor(options: Partial<NotificationOptions> = {}) {
    this.soundEnabled = options.soundEnabled ?? true;
    this.volume = options.volume ?? 0.5;
    
    if (this.soundEnabled) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported in this browser:', e);
        this.audioContext = null;
      }
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
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported in this browser:', e);
        this.audioContext = null;
      }
    } else if (!enabled && this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
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
      
      // Listen for online/offline events
      window.addEventListener('online', () => this.handleConnectionChange(true));
      window.addEventListener('offline', () => this.handleConnectionChange(false));
      
      // Check initial connection status
      this.isOnline = navigator.onLine;
    } catch (error) {
      console.error('Failed to initialize MessageService:', error);
    }
  }

  private async loadQueue() {
    try {
      this.queue = await getQueue();
      this.processQueue();
    } catch (error) {
      console.error('Failed to load message queue:', error);
    }
  }

  setNotificationService(notificationService: NotificationServiceImpl) {
    this.notificationService = notificationService;
  }

  async sendMessage(content: string, receiverId: string): Promise<void> {
    const message: Message = {
      id: Math.random().toString(36).substr(2, 9),
      content,
      senderId: '', // Will be filled by the service using current user ID
      receiverId,
      timestamp: Date.now(),
      status: 'SENDING',
      retryCount: 0
    };

    // If we're online and have a WebSocket connection, try to send immediately
    if (this.isOnline) {
      const sent = await this.sendViaWebSocket(message);
      if (sent) {
        message.status = 'SENT';
        // Notify UI of successful send
        return;
      }
    }

    // If we failed to send or are offline, queue the message
    await this.queueMessage(message);
  }

  private async queueMessage(message: Message): Promise<void> {
    const queueItem: MessageQueueItem = {
      id: 0, // Will be set by IndexedDB
      message,
      timestamp: Date.now(),
      retryCount: 0
    };

    try {
      const id = await addToQueue(queueItem);
      queueItem.id = id as string | number;
      this.queue.push(queueItem);
      
      // Process the queue if not already processing
      if (!this.processingQueue) {
        this.processQueue();
      }
    } catch (error) {
      console.error('Failed to queue message:', error);
      // Update message status to failed
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
      // Process messages in order
      while (this.queue.length > 0 && this.isOnline) {
        const queueItem = this.queue[0];
        const message = queueItem.message;

        // Skip if message has exceeded max retries
        if (message.retryCount >= this.retryDelays.length) {
          console.warn(`Message ${message.id} has exceeded max retries`);
          message.status = 'FAILED';
          await removeFromQueue(queueItem.id);
          this.queue.shift();
          continue;
        }

        // Try to send the message
        const sent = await this.sendViaWebSocket(message);
        
        if (sent) {
          // Success - remove from queue and update status
          message.status = 'SENT';
          await removeFromQueue(queueItem.id);
          this.queue.shift();
          
          // Notify UI of successful send
          // In a real implementation, we would use a callback or event system
          continue;
        } else {
          // Failed - increment retry count and schedule retry
          message.retryCount++;
          queueItem.retryCount = message.retryCount;
          
          // Update in IndexedDB
          await addToQueue(queueItem); // This will update since we're using the same ID
          
          // If we've exhausted retries, mark as failed
          if (message.retryCount >= this.retryDelays.length) {
            message.status = 'FAILED';
            await removeFromQueue(queueItem.id);
            this.queue.shift();
          }
          
          // Wait before next retry
          await new Promise(resolve => 
            setTimeout(resolve, this.retryDelays[Math.min(message.retryCount - 1, this.retryDelays.length - 1)])
          );
        }
      }
    } catch (error) {
      console.error('Error processing message queue:', error);
    } finally {
      this.processingQueue = false;
      
      // Continue processing if there are still items in queue
      if (this.queue.length > 0 && this.isOnline) {
        this.processQueue();
      }
    }
  }

  private async sendViaWebSocket(message: Message): Promise<boolean> {
    // This would be implemented using the WebSocket context
    // For now, we'll simulate success/failure
    // In a real implementation, this would use the WebSocket service
    
    // Simulate network conditions for demonstration
    // In reality, this would attempt to send via actual WebSocket
    return Math.random() > 0.3; // 70% success rate for demo
  }

  handleConnectionChange(isOnline: boolean): void {
    this.isOnline = isOnline;
    
    if (isOnline) {
      // Connection restored, try to process queue
      this.processQueue();
    }
  }

  // Method to update message status (e.g., when read receipt is received)
  updateMessageStatus(messageId: string, status: 'DELIVERED' | 'READ'): void {
    // Find message in queue and update status
    const queueItem = this.queue.find(item => item.message.id === messageId);
    if (queueItem) {
      queueItem.message.status = status;
      // Update in IndexedDB
      addToQueue(queueItem);
    }
  }

  getQueueStatus(): MessageQueueItem[] {
    return [...this.queue];
  }
}

export default MessageService;