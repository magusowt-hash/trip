import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const token = this.extractTokenFromCookie(req);
    
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }
    
    try {
      const payload = await this.jwt.verifyAsync(token);
      (req as any).user = { sub: String(payload.sub), phone: payload.phone };
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
    
    next();
  }

  private extractTokenFromCookie(req: Request): string | null {
    const name = process.env.AUTH_COOKIE_NAME ?? 'trip_auth';
    return req.cookies?.[name] ?? null;
  }
}
