import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CreditOrder } from '../entities/credit-order.entity';
import { CreditPack } from '../entities/credit-pack.entity';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditOrder, CreditPack]),
    PointsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
