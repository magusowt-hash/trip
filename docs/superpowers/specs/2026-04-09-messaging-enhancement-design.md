# Messaging System Enhancement Design

## Overview
This document outlines the design for enhancing the messaging system in the Trip application to provide reliable instant message delivery with sound notifications, similar to mainstream messaging apps like WeChat/WhatsApp.

## Current State Analysis
The existing messaging system in Trip has:
- Real-time messaging via WebSocket connection
- Basic message sending/receiving functionality
- Conversation list with unread badges
- Typing indicators
- Message status indicators (sending/sent/failed)

Issues identified:
- Messages may fail to send without proper retry mechanism
- No sound notifications for incoming messages
- Notification persistence could be improved
- No guaranteed message delivery confirmation

## Design Goals
1. Ensure reliable message delivery with retry mechanism
2. Implement sound notifications for new messages
3. Maintain instant message delivery (<1 second) when possible
4. Provide clear visual feedback for message status
5. Follow mainstream messaging app UX patterns

## Architecture Overview

### Components
1. **Message Service Layer** - Handles message sending/receiving with retry logic
2. **Notification Service** - Manages sound notifications and visual alerts
3. **Message Persistence Layer** - Local storage for queued messages
4. **WebSocket Enhancement** - Improved connection handling and heartbeat

### Data Flow
1. User sends message → Message Service validates and queues
2. Message Service attempts to send via WebSocket
3. On failure: Message queued locally with exponential backoff retry
4. On success: Message marked as sent, recipient notified via WebSocket
5. Notification Service plays sound and updates UI for incoming messages
6. Recipient acknowledges message → Read receipt sent back to sender

## Detailed Design

### Message Service Improvements
#### Queue Mechanism
- Local IndexedDB storage for outgoing messages when offline
- Each message queued with timestamp, retry count, and unique ID
- Exponential backoff retry strategy (1s, 2s, 4s, 8s, max 30s)
- Maximum retry attempts: 5 before showing permanent failure

#### Message Lifecycle
1. `SENDING` - Message queued, attempting to send
2. `SENT` - Message delivered to server successfully
3. `DELIVERED` - Message received by recipient's device
4. `READ` - Recipient has viewed the message
5. `FAILED` - Message failed after all retries

### Notification System
#### Sound Notifications
- Short, pleasant chime sound for incoming messages
- Configurable in settings (on/off, volume)
- Respects device mute/silent mode
- Uses Web Audio API for consistent cross-browser experience

#### Visual Notifications
- Enhanced unread badges with pulsation animation
- Banner notifications for new messages when app is in background
- Notification center integration (where supported)
- Message preview in notifications (configurable privacy)

### WebSocket Enhancements
#### Connection Management
- Automatic reconnection with exponential backoff
- Heartbeat/ping every 25 seconds to detect disconnections
- Offline detection using navigator.onLine and heartbeat failures
- Queue flushing when connection restored

#### Message Acknowledgment
- Server acknowledgment for each message received
- Client-side tracking of message delivery status
- Read receipts sent when message is viewed

### Error Handling
#### Network Errors
- Automatic switching to offline mode when network unavailable
- User notified of connection issues with retry option
- Local caching of messages sent while offline

#### Server Errors
- Distinguish between temporary (5xx) and permanent (4xx) errors
- Retry only for temporary errors with backoff
- Permanent errors shown to user immediately with actionable messages

## Component Specifications

### MessageService Class
```typescript
interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  status: 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  retryCount: number;
}

class MessageService {
  private queue: Message[] = [];
  private isOnline: boolean = true;
  private retryDelays: number[] = [1000, 2000, 4000, 8000, 16000, 30000];
  
  async sendMessage(content: string, receiverId: string): Promise<void> {
    // Implementation details...
  }
  
  private async processQueue(): Promise<void> {
    // Implementation details...
  }
  
  private async sendViaWebSocket(message: Message): Promise<boolean> {
    // Implementation details...
  }
  
  handleConnectionChange(isOnline: boolean): void {
    // Implementation details...
  }
}
```

### NotificationService Class
```typescript
class NotificationService {
  private audioContext: AudioContext | null = null;
  private soundEnabled: boolean = true;
  
  playNotificationSound(): void {
    // Implementation details...
  }
  
  showVisualNotification(message: Message): void {
    // Implementation details...
  }
  
  setSoundEnabled(enabled: boolean): void {
    // Implementation details...
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Implement MessageService with queuing mechanism
2. Add local persistence using IndexedDB
3. Enhance WebSocket connection handling
4. Create basic notification service

### Phase 2: Notification Enhancements
1. Implement sound notifications with Web Audio API
2. Add visual notification enhancements
3. Implement notification permissions handling
4. Add notification settings UI

### Phase 3: Reliability & UX Improvements
1. Implement message status tracking (SENDING/SENT/DELIVERED/READ)
2. Add read receipts functionality
3. Improve error handling and user feedback
4. Add offline indicators and manual retry options

### Phase 4: Testing & Optimization
1. Test under various network conditions
2. Optimize performance and memory usage
3. Add comprehensive unit and integration tests
4. Cross-browser compatibility testing

## Security Considerations
1. All messages encrypted in transit via WSS (WebSocket Secure)
2. Local message queue encrypted if containing sensitive data
3. Authentication tokens properly managed and refreshed
4. Input sanitization to prevent XSS in message content
5. Rate limiting to prevent abuse

## Performance Considerations
1. Message queue limits to prevent memory issues
2. Efficient IndexedDB usage with proper indexing
3. Debounced UI updates to prevent excessive re-renders
4. Audio context reuse to prevent memory leaks
5. Connection heartbeat optimized to minimize battery impact

## Testing Strategy
1. Unit tests for MessageService queue logic
2. Integration tests for WebSocket communication
3. Manual testing for notification systems
4. Network simulation testing (offline, slow, flaky)
5. User acceptance testing with real-world scenarios

## Open Questions
1. What sound should be used for notifications? (Need to select or create)
2. Should we implement message draft saving?
3. What is the maximum message size we should support?
4. Should we support message editing/deletion after sending?

## Approval
This design has been reviewed and approved for implementation.

---
*Design created: 2026-04-09*
*Based on requirements for reliable instant messaging with sound notifications*