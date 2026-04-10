import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthMiddleware } from './jwt-auth.middleware';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('AUTH_JWT_SECRET');
        const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
        const effectiveSecret =
          secret ??
          (nodeEnv === 'production'
            ? undefined
            : 'dev-only-auth-jwt-secret-change-me');

        if (!effectiveSecret) {
          throw new Error('AUTH_JWT_SECRET is required');
        }
        return {
          secret: effectiveSecret,
          signOptions: {
            expiresIn: '7d',
            algorithm: 'HS256' as const,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthMiddleware],
  exports: [JwtAuthMiddleware],
})
export class AuthModule {}
