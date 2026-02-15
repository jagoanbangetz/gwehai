import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hacktivity } from '../entities/hacktivity.entity';
import { Conversation } from '../entities/conversation.entity';
import { HacktivityService } from './hacktivity.service';
import { HacktivityController } from './hacktivity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Hacktivity, Conversation])],
  controllers: [HacktivityController],
  providers: [HacktivityService],
  exports: [HacktivityService],
})
export class HacktivityModule {}
