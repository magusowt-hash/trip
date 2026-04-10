import { Controller, Post, Get, Body, Param, Req, HttpException, HttpStatus } from '@nestjs/common';
import { FriendService } from './friend.service';

interface AuthRequest {
  user: {
    sub: string;
    phone: string;
  };
}

interface AddFriendDto {
  userId: number;
}

@Controller('friend')
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @Post('add')
  async addFriend(@Req() req: AuthRequest, @Body() dto: AddFriendDto) {
    const currentUserId = Number(req.user?.sub);
    if (!currentUserId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const success = await this.friendService.addFriend(currentUserId, dto.userId);
    return { success };
  }

  @Get('list')
  async getFriends(@Req() req: AuthRequest) {
    const userId = Number(req.user?.sub);
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const friends = await this.friendService.getFriendList(userId);
    return { friends };
  }
}
