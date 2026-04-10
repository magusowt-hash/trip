import { Controller, Get, Req } from '@nestjs/common';

@Controller()
export class TestController {
  @Get('test')
  test() {
    return { status: 'ok' };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('debug-cookies')
  debugCookies(@Req() req: any) {
    return { cookies: req.cookies, path: req.path };
  }
}

