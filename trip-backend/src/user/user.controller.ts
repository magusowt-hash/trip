import { Controller, Get, Patch, Body, Req, Query, HttpException, HttpStatus } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface AuthRequest {
  user: {
    sub: string;
    phone: string;
  };
}

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  async getProfile(@Req() req: AuthRequest) {
    const userId = Number(req.user?.sub);
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const profile = await this.userService.getProfile(userId);
    if (!profile) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return { user: profile };
  }

  @Patch('profile')
  async updateProfile(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    const userId = Number(req.user?.sub);
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const profile = await this.userService.updateProfile(userId, dto);
    return { user: profile };
  }

  @Get('search')
  async searchUsers(@Req() req: AuthRequest, @Query('keyword') keyword: string) {
    const userId = Number(req.user?.sub);
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    if (!keyword || keyword.trim().length === 0) {
      return { users: [] };
    }
    const users = await this.userService.searchUsers(keyword.trim(), userId);
    return { users };
  }
}
