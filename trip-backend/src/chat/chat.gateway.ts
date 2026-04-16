import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { MessageService } from '../message/message.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, number>();

  constructor(private readonly messageService: MessageService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const secret = process.env.AUTH_JWT_SECRET || 'dev-only-auth-jwt-secret-change-me';
      const payload = jwt.verify(token, secret) as { sub: string };
      const userId = Number(payload.sub);
      this.connectedUsers.set(client.id, userId);
      client.join(`user_${userId}`);
      this.logger.log(`User ${userId} connected`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: number; content: string },
  ) {
    const senderId = this.connectedUsers.get(client.id);
    if (!senderId) return;

    const message = await this.messageService.sendMessage(senderId, data.receiverId, data.content);

    const response = {
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      isRead: message.isRead,
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
    };

    this.server.to(`user_${data.receiverId}`).emit('new_message', response);
    client.emit('message_sent', response);

    const receiverSocket = Array.from(this.server.sockets.sockets.values())
      .find(s => this.connectedUsers.get(s.id) === data.receiverId);
    if (receiverSocket) {
      client.emit('message_delivered', { id: message.id });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: number },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await this.messageService.markAsRead(data.messageId, userId);

    const message = await this.messageService.findById(data.messageId);
    if (message) {
      const senderSocket = Array.from(this.server.sockets.sockets.values())
        .find(s => this.connectedUsers.get(s.id) === message.senderId);
      if (senderSocket) {
        senderSocket.emit('message_read', { id: message.id });
      }
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { status: 'ok' });
  }

  sendToUser(userId: number, event: string, data: unknown) {
    this.server.to(`user_${userId}`).emit(event, data);
  }
}