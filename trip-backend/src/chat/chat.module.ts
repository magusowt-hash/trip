import { Module, Global } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessageModule } from '../message/message.module';

@Global()
@Module({
  imports: [MessageModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}