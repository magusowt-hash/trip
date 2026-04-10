import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';
import { User } from '../user/user.entity';

export interface ChatWithUser {
  userId: number;
  nickname: string | null;
  avatar: string | null;
  lastMessage: Message;
  unreadCount: number;
}

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async sendMessage(senderId: number, receiverId: number, content: string): Promise<Message> {
    const message = this.messages.create({
      senderId,
      receiverId,
      content,
    });
    return this.messages.save(message);
  }

  async getConversation(userId1: number, userId2: number, limit = 50): Promise<Message[]> {
    return this.messages.find({
      where: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async getRecentChats(userId: number, limit = 20): Promise<ChatWithUser[]> {
    const start = Date.now();
    const rawResults = await this.messages.query(`
      SELECT 
        latest.other_user_id,
        u.nickname,
        u.avatar,
        m.content,
        m.sender_id,
        m.receiver_id,
        m.is_read,
        m.created_at,
        m.id,
        COALESCE(unread.unread_count, 0) as unread_count
      FROM (
        SELECT 
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_user_id,
          MAX(id) as last_msg_id
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
      ) latest
      JOIN messages m ON m.id = latest.last_msg_id
      LEFT JOIN users u ON u.id = latest.other_user_id
      LEFT JOIN (
        SELECT sender_id, COUNT(*) as unread_count
        FROM messages 
        WHERE receiver_id = ? AND is_read = 0
        GROUP BY sender_id
      ) unread ON unread.sender_id = latest.other_user_id
      ORDER BY m.created_at DESC
      LIMIT ?
    `, [userId, userId, userId, userId, userId, limit]);
    console.log(`[PERF] getRecentChats: ${Date.now() - start}ms`);

    return rawResults.map((r: any) => ({
      userId: Number(r.other_user_id),
      nickname: r.nickname,
      avatar: r.avatar,
      lastMessage: {
        id: Number(r.id),
        senderId: Number(r.sender_id),
        receiverId: Number(r.receiver_id),
        content: r.content,
        isRead: r.is_read,
        createdAt: r.created_at,
      },
      unreadCount: Number(r.unread_count),
    }));
  }

  async markAsRead(messageId: number, userId: number): Promise<void> {
    await this.messages.update(
      { id: messageId, receiverId: userId },
      { isRead: 1 },
    );
  }

  async findById(id: number): Promise<Message | null> {
    return this.messages.findOne({ where: { id } });
  }

  async getNotices(userId: number, limit = 20): Promise<any[]> {
    const notices = await this.messages.find({
      where: { senderId: 0 },
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['id', 'content', 'senderId', 'receiverId', 'isRead', 'createdAt'],
    });

    return notices.map(n => ({
      ...n,
      type: 'system',
    }));
  }
}