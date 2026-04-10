import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { setAuthCookie, clearAuthCookie } from './auth-cookie.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * 使用 @Res() 自行结束响应，避免 passthrough + return 对象时部分环境下 Set-Cookie 未随响应发出。
   */
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const { user, token } = await this.auth.register(dto);
    setAuthCookie(res, token);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(201).json({ user, token });
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const { user, token } = await this.auth.login(dto);
    setAuthCookie(res, token);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ user, token });
  }

  @Post('logout')
  logout(@Res() res: Response) {
    clearAuthCookie(res);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(204).send();
  }
}
