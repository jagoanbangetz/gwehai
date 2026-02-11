import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription } from '../entities/subscription.entity';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription]),
    PointsModule,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
