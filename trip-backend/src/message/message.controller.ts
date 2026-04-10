import { Controller, Get, Post, Body, Param, Query, Req, HttpException, HttpStatus } from '@nestjs/common';
import { MessageService } from './message.service';

interface AuthRequest {
  user: {
    sub: string;
    phone: string;
  };
}

interface SendMessageDto {
  receiverId: number;
  content: string;
}

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('send')
  async sendMessage(@Req() req: AuthRequest, @Body() dto: SendMessageDto) {
    const senderId = Number(req.user?.sub);
    if (!senderId || isNaN(senderId)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const message = await this.messageService.sendMessage(senderId, dto.receiverId, dto.content);
    return { message };
  }

  @Get('conversation/:userId')
  async getConversation(@Req() req: AuthRequest, @Param('userId') userId: string, @Query('limit') limit?: string) {
    const currentUserId = Number(req.user?.sub);
    const targetUserId = Number(userId);
    if (!currentUserId || isNaN(currentUserId) || isNaN(targetUserId)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const messages = await this.messageService.getConversation(
      currentUserId,
      targetUserId,
      limit ? Number(limit) : 50,
    );
    return { messages };
  }

  @Get('chats')
  async getRecentChats(@Req() req: AuthRequest, @Query('limit') limit?: string) {
    const userId = Number(req.user?.sub);
    if (!userId || isNaN(userId)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const chats = await this.messageService.getRecentChats(userId, limit ? Number(limit) : 20);
    return { chats };
  }

  @Get('notices')
  async getNotices(@Req() req: AuthRequest, @Query('limit') limit?: string) {
    const userId = Number(req.user?.sub);
    if (!userId || isNaN(userId)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const notices = await this.messageService.getNotices(userId, limit ? Number(limit) : 20);
    return { notices };
  }

  @Post('read/:messageId')
  async markAsRead(@Req() req: AuthRequest, @Param('messageId') messageId: string) {
    const userId = Number(req.user?.sub);
    if (!userId || isNaN(userId)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    await this.messageService.markAsRead(Number(messageId), userId);
    return { success: true };
  }
}