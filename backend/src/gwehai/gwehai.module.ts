import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GwehAIController } from './gwehai.controller';
import { GwehAIService } from './gwehai.service';
import { GwehAISSEGuard } from './gwehai-sse.guard';
import { JobsGateway } from './jobs.gateway';
import { JobsEventsService } from './jobs-events.service';
import { ChatEventsService } from './chat-events.service';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { PlansModule } from '../plans/plans.module';
import { PentestJobsModule } from '../pentest-jobs/pentest-jobs.module';
import { Model } from '../entities/model.entity';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    forwardRef(() => ChatModule),
    PlansModule,
    forwardRef(() => PentestJobsModule),
    TypeOrmModule.forFeature([Model]),
  ],
  controllers: [GwehAIController],
  providers: [GwehAIService, GwehAISSEGuard, JobsEventsService, ChatEventsService, JobsGateway],
  exports: [GwehAIService, JobsEventsService, ChatEventsService, GwehAISSEGuard],
})
export class GwehAIModule {}
