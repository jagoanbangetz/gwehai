import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BrowserAgentService } from './browser-agent.service';

@Module({
  imports: [ConfigModule],
  providers: [BrowserAgentService],
  exports: [BrowserAgentService],
})
export class BrowserAgentModule {}
