import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { User } from '../entities/user.entity';
import { Model } from '../entities/model.entity';
import { CreditOrder } from '../entities/credit-order.entity';
import { Report } from '../entities/report.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Message } from '../entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Model, CreditOrder, Report, UsageEvent, Message])],
  controllers: [AdminController],
})
export class AdminModule {}

