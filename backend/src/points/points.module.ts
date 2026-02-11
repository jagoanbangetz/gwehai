import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsService } from './points.service';
import { PointsController } from './points.controller';
import { UserPointBalance } from '../entities/user-point-balance.entity';
import { PointLedger } from '../entities/point-ledger.entity';
import { Subscription } from '../entities/subscription.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPointBalance, PointLedger, Subscription]),
  ],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
