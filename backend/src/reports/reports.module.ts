import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { User } from '../entities/user.entity';
import { Conversation } from '../entities/conversation.entity';
import { PentestJob } from '../entities/pentest-job.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReVerifyService } from './re-verify.service';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, User, Conversation, PentestJob]),
    ToolsModule,
  ],
  providers: [ReportsService, ReVerifyService],
  controllers: [ReportsController],
  exports: [ReportsService, ReVerifyService],
})
export class ReportsModule {}
