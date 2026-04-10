import { HttpException, HttpStatus, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import { AppModule } from './app.module';

function firstValidationMessage(errors: ValidationError[]): string | undefined {
  for (const e of errors) {
    if (e.constraints) {
      const first = Object.values(e.constraints)[0];
      return typeof first === 'string' ? first : undefined;
    }
    if (e.children?.length) {
      const nested = firstValidationMessage(e.children);
      if (nested) return nested;
    }
  }
  return undefined;
}

function jwtAuthMiddleware(req: any, res: any, next: () => void) {
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  const path = req.path.replace(/^\/api/, '') || req.path;
  if (!path.startsWith('/user/') && !path.startsWith('/friend/') && !path.startsWith('/message/')) {
    return next();
  }
  
  let token = req.cookies?.trip_auth;
  const authHeader = req.headers?.authorization ?? req.headers?.Authorization;
  if (!token && authHeader) {
    const parts = authHeader.split(' ');
    token = parts.length > 1 ? parts[1] : authHeader;
  }
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const secret = process.env.AUTH_JWT_SECRET || 'dev-only-auth-jwt-secret-change-me';
    const payload = jwt.verify(token, secret) as any;
    req.user = { sub: String(payload.sub), phone: payload.phone };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'test', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });
  app.use(cookieParser());
  app.use(jwtAuthMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const msg = firstValidationMessage(errors) ?? 'Invalid request';
        return new HttpException({ error: msg }, HttpStatus.BAD_REQUEST);
      },
    }),
  );

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((s: string) => s.trim()).filter(Boolean);
  app.enableCors({
    origin:
      corsOrigins?.length
        ? corsOrigins
        : true,
    credentials: true,
    exposedHeaders: ['Set-Cookie'],
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST || '0.0.0.0';
  console.log(`Listening on ${host}:${port}`);
  await app.listen(port, host);
  console.log(`Server ready at http://${host}:${port}`);
}

bootstrap();
