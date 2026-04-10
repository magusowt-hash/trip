import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { FriendModule } from './friend/friend.module';
import { MessageModule } from './message/message.module';
import { ChatModule } from './chat/chat.module';
import { User } from './user/user.entity';
import { Friend } from './friend/friend.entity';
import { Message } from './message/message.entity';
import { parseWantsSsl } from './database-url.util';
import { TestModule } from './test/test.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL is required');
        }

        // 支持 `postgresql://` 与 `mysql://` 两种 DATABASE_URL
        const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
        const synchronize = nodeEnv !== 'production';

        const parsed = new URL(url);
        const protocol = parsed.protocol.replace(':', '').toLowerCase(); // postgresql | mysql | ...

        const sslWanted = parseWantsSsl(url);
        const ssl =
          sslWanted ? { rejectUnauthorized: false } : undefined;

        if (protocol === 'postgresql' || protocol === 'postgres') {
          return {
            type: 'postgres' as const,
            host: parsed.hostname,
            port: Number(parsed.port || 5432),
            username: parsed.username,
            password: parsed.password,
            database: parsed.pathname.replace(/^\//, ''),
            ssl,
            entities: [User, Friend, Message],
            synchronize,
            extra: {
              min: 2,
              max: 10,
              idleTimeoutMillis: 30000,
            },
          };
        }

        if (protocol === 'mysql' || protocol === 'mysql2') {
          return {
            type: 'mysql' as const,
            host: parsed.hostname,
            port: Number(parsed.port || 3306),
            username: parsed.username,
            password: parsed.password,
            database: parsed.pathname.replace(/^\//, ''),
            ssl,
            entities: [User, Friend, Message],
            synchronize,
            poolSize: 10,
          };
        }

        throw new Error(`Unsupported DATABASE_URL protocol: ${protocol}`);
      },
    }),
    AuthModule,
    UserModule,
    FriendModule,
    MessageModule,
    ChatModule,
    TestModule,
  ],
})
export class AppModule {}
