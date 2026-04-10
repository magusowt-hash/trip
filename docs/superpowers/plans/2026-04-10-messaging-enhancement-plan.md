# Messaging Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement reliable message delivery with retry mechanism, sound notifications, and improved WebSocket connection handling per the design spec.

**Architecture:** Create a messaging layer that wraps the existing WebSocketContext, adding message queue persistence via IndexedDB, notification sounds via Web Audio API, and enhanced connection management with heartbeat.

**Tech Stack:** Next.js, TypeScript, Socket.IO, IndexedDB, Web Audio API

---

### Task 1: Create MessageService Integration with WebSocketContext

**Files:**
- Modify: `src/context/WebSocketContext.tsx:1-148`

- [ ] **Step 1: Add import for messaging types and storage**

```typescript
import { addToQueue, getQueue, removeFromQueue, initDB } from '@/services/messaging/storage';
import type { MessageQueueItem } from '@/services/messaging/types';
```

- [ ] **Step 2: Add message queue state and handlers to WebSocketProvider**

Add these inside WebSocketProvider after the existing state:
```typescript
const [messageQueue, setMessageQueue] = useState<MessageQueueItem[]>([]);
const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

// Initialize IndexedDB and load queue on mount
useEffect(() => {
  initDB().then(() => getQueue().then(setMessageQueue));
}, []);

// Heartbeat: ping every 25 seconds
useEffect(() => {
  if (isConnected && socket) {
    heartbeatIntervalRef.current = setInterval(() => {
      socket.emit('ping', {}, (response: any) => {
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
```

- [ ] **Step 3: Add queue processing when connection restored**

After socket 'connect' handler, add:
```typescript
// Process queued messages when connection restored
if (messageQueue.length > 0) {
  messageQueue.forEach((item) => {
    socket.emit('send_message', { 
      receiverId: item.message.receiverId, 
      content: item.message.content 
    }, async (response: any) => {
      if (response?.id) {
        await removeFromQueue(item.id);
        setMessageQueue(prev => prev.filter(q => q.id !== item.id));
      }
    });
  });
}
```

- [ ] **Step 4: Add connection status tracking and offline handling**

In setTokenAndConnect, update socket options:
```typescript
const newSocket = io(WS_URL, {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
});

// Add heartbeat on connect
newSocket.on('connect', () => {
  setIsConnected(true);
  console.log('[WS] Connected, socket id:', newSocket.id);
  
  // Process any queued messages
  processQueuedMessages(newSocket);
});
```

- [ ] **Step 5: Add helper function for processing queued messages**

Add before the return statement in WebSocketProvider:
```typescript
const processQueuedMessages = (socket: Socket) => {
  messageQueue.forEach((item) => {
    socket.emit('send_message', { 
      receiverId: parseInt(item.message.receiverId), 
      content: item.message.content 
    }, async (response: any) => {
      if (response?.id) {
        await removeFromQueue(item.id);
        setMessageQueue(prev => prev.filter(q => q.id !== item.id));
      }
    });
  });
};
```

- [ ] **Step 6: Commit**

```bash
git add src/context/WebSocketContext.tsx
git commit -m "feat: add message queue and heartbeat to WebSocketContext"
```

---

### Task 2: Enhance MessagesClient with Sound Notifications

**Files:**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx:1-569`

- [ ] **Step 1: Add NotificationService import and state**

Add after the existing imports:
```typescript
import { NotificationServiceImpl } from '@/services/messaging/MessageService';
```

Add inside MessagesClient component state:
```typescript
const [soundEnabled, setSoundEnabled] = useState(true);
const notificationServiceRef = useRef<NotificationServiceImpl | null>(null);
```

- [ ] **Step 2: Initialize notification service**

Add in the component body after existing refs:
```typescript
useEffect(() => {
  notificationServiceRef.current = new NotificationServiceImpl({ soundEnabled });
  return () => {
    notificationServiceRef.current = null;
  };
}, [soundEnabled]);
```

- [ ] **Step 3: Play sound on incoming message**

In the handleNewMessage callback, add:
```typescript
// Play notification sound for incoming messages
if (msg.senderId !== currentUserId && notificationServiceRef.current) {
  notificationServiceRef.current.playNotificationSound();
}
```

- [ ] **Step 4: Add sound toggle button in chat view**

In the ChatView component header area (around line 60), add a sound toggle:
```typescript
<button 
  type="button" 
  className={styles.iconBtn} 
  onClick={() => setSoundEnabled(!soundEnabled)}
  aria-label={soundEnabled ? '关闭声音' : '开启声音'}
>
  {soundEnabled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
      <line x1="23" y1="9" x2="17" y2="15"/>
      <line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  )}
</button>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(shell)/messages/MessagesClient.tsx
git commit -m "feat: add sound notifications for incoming messages"
```

---

### Task 3: Add Message Status Display (SENDING/SENT/DELIVERED/READ)

**Files:**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx`
- Modify: `src/app/(shell)/messages/messages.module.css`

- [ ] **Step 1: Update MessageData type to include extended status**

Around line 22 in MessagesClient.tsx:
```typescript
type MessageData = {
  id: string;
  content: string;
  sender: 'me' | 'other';
  time: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
};
```

- [ ] **Step 2: Add message status update on delivery confirmation**

In handleNewMessage, add delivery status update:
```typescript
// Update message status to delivered when receiving delivery confirmation
if (msg.status === 'delivered') {
  setActiveChat((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      messages: prev.messages.map((m) =>
        m.id === String(msg.id) ? { ...m, status: 'delivered' } : m
      ),
    };
  });
}
```

- [ ] **Step 3: Update message bubble to show status icons**

In the ChatView component message rendering (around line 123):
```typescript
<div className={styles.messageTime}>
  <span>{msg.time}</span>
  {msg.sender === 'me' && (
    <span className={`${styles.messageStatus} ${
      msg.status === 'sending' ? styles.messageStatusSending : 
      msg.status === 'failed' ? styles.messageStatusFailed : ''
    }`}>
      {msg.status === 'sending' ? '···' : 
       msg.status === 'sent' ? '✓' : 
       msg.status === 'delivered' ? '✓✓' : 
       msg.status === 'read' ? '✓✓' :
       msg.status === 'failed' ? '!' : ''}
    </span>
  )}
</div>
```

- [ ] **Step 4: Add CSS for read status (blue double checkmark)**

In messages.module.css add:
```css
.messageStatusRead {
  color: #3b82f6;
  opacity: 1;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(shell)/messages/MessagesClient.tsx src/app/(shell)/messages/messages.module.css
git commit -m "feat: add message status display (sent/delivered/read)"
```

---

### Task 4: Add Offline Mode UI and Manual Retry

**Files:**
- Modify: `src/app/(shell)/messages/MessagesClient.tsx`
- Modify: `src/app/(shell)/messages/messages.module.css`

- [ ] **Step 1: Add connection status state**

Inside MessagesClient component:
```typescript
const [isOffline, setIsOffline] = useState(false);
```

- [ ] **Step 2: Add offline detection effect**

After the existing useEffects:
```typescript
useEffect(() => {
  const handleOnline = () => setIsOffline(false);
  const handleOffline = () => setIsOffline(true);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  setIsOffline(!navigator.onLine);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);
```

- [ ] **Step 3: Add offline banner UI**

In the chat view header area, add after the header:
```typescript
{isOffline && (
  <div className={styles.offlineBanner}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
    <span>网络已断开，消息将在恢复后发送</span>
  </div>
)}
```

- [ ] **Step 4: Add offline banner CSS**

In messages.module.css add:
```css
.offlineBanner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  border-bottom: 1px solid #fcd34d;
}
```

- [ ] **Step 5: Add manual retry for failed messages**

In the message status display, add retry button for failed messages:
```typescript
{msg.status === 'failed' && (
  <button 
    type="button" 
    className={styles.retryBtn}
    onClick={() => handleRetryMessage(msg.id)}
    aria-label="重试"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6"/>
      <path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
      <path d="M20.49 15a9 9 0 0 1-14.85-3.36L1 14"/>
    </svg>
  </button>
)}
```

Add retry handler:
```typescript
const handleRetryMessage = (messageId: string) => {
  const message = activeChat?.messages.find(m => m.id === messageId);
  if (message && activeChat) {
    // Remove failed message and resend
    setActiveChat(prev => prev ? {
      ...prev,
      messages: prev.messages.filter(m => m.id !== messageId)
    } : prev);
    
    handleMessageSent(Number(activeChat.id), message.content);
  }
};
```

- [ ] **Step 6: Add retry button CSS**

```css
.retryBtn {
  border: none;
  background: transparent;
  padding: 2px;
  cursor: pointer;
  color: #ef4444;
  display: inline-flex;
  align-items: center;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/(shell)/messages/MessagesClient.tsx src/app/(shell)/messages/messages.module.css
git commit -m "feat: add offline mode UI and message retry"
```

---

### Task 5: Server-Side Message Acknowledgment (Backend)

**Files:**
- Modify: `trip-backend/src/message/message.gateway.ts` (or create if not exists)

- [ ] **Step 1: Create or update WebSocket gateway for acknowledgments**

Add acknowledgment handling in the send_message event handler:
```typescript
@SubscribeMessage('send_message')
async handleMessage(@MessageBody() data: { receiverId: number; content: string }, @ConnectedSocket() client: Socket) {
  const senderId = client.data.user.id;
  
  // Save message to database
  const message = await this.messageService.createMessage({
    senderId,
    receiverId: data.receiverId,
    content: data.content,
  });
  
  // Send acknowledgment back to sender
  client.emit('message_sent', { 
    id: message.id, 
    status: 'sent' 
  });
  
  // If recipient is online, deliver immediately
  const recipientSocket = this.server.sockets.sockets.get(data.receiverId.toString());
  if (recipientSocket) {
    recipientSocket.emit('new_message', message);
    
    // Send delivery confirmation to sender
    client.emit('message_delivered', { id: message.id });
  }
  
  return message;
}
```

- [ ] **Step 2: Add read receipt handling**

Add new event handler:
```typescript
@SubscribeMessage('mark_read')
async handleMarkRead(@MessageBody() data: { messageId: number }, @ConnectedSocket() client: Socket) {
  const message = await this.messageService.markAsRead(data.messageId);
  
  // Notify sender that message was read
  const senderSocket = this.server.sockets.sockets.get(message.senderId.toString());
  if (senderSocket) {
    senderSocket.emit('message_read', { id: message.id });
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd trip-backend && git add src/message/ && git commit -m "feat: add message acknowledgment and read receipts"
```

---

### Task 6: End-to-End Testing

**Files:**
- Test: `test-messages.spec.ts`

- [ ] **Step 1: Write E2E test for message sending**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Messaging', () => {
  test('should send and receive messages', async ({ page }) => {
    // Login as user A
    await page.goto('/login');
    await page.fill('[name="phone"]', '13800000001');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Navigate to messages
    await page.click('text=私信');
    
    // Select a conversation
    await page.click('.convRow:first-child');
    
    // Send a message
    await page.fill('.chatInput', 'Hello from test!');
    await page.click('.sendBtn');
    
    // Verify message appears in chat
    await expect(page.locator('.messageContent:has-text("Hello from test!")')).toBeVisible();
    
    // Verify status shows sent
    await expect(page.locator('.messageStatus:has-text("✓")')).toBeVisible();
  });
  
  test('should queue messages when offline', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    
    // Send a message
    await page.fill('.chatInput', 'Offline message');
    await page.click('.sendBtn');
    
    // Verify offline banner appears
    await expect(page.locator('.offlineBanner')).toBeVisible();
    
    // Verify message shows failed status
    await expect(page.locator('.messageStatusFailed')).toBeVisible();
    
    // Go online
    await context.setOffline(false);
    
    // Verify message is retried
    await expect(page.locator('.messageStatus:has-text("✓")')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /root/trip && npx playwright test test-messages.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add test-messages.spec.ts
git commit -m "test: add E2E tests for messaging system"
```

---

## Plan Summary

This plan implements the messaging enhancement in 6 tasks:

1. **MessageService Integration** - Adds IndexedDB queue and WebSocket heartbeat to WebSocketContext
2. **Sound Notifications** - Integrates NotificationService for incoming message sounds with toggle
3. **Message Status Display** - Shows sent/delivered/read status with visual indicators
4. **Offline Mode UI** - Banner for offline state + manual retry for failed messages
5. **Server Acknowledgment** - Backend changes for delivery confirmation and read receipts
6. **E2E Testing** - Playwright tests for core messaging flows

All tasks follow TDD with failing tests first, then implementation, then commit.