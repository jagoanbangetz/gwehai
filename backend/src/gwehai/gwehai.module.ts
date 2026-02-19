import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GwehAIController } from './gwehai.controller';
import { GwehAIService } from './gwehai.service';
import { GwehAISSEGuard } from './gwehai-sse.guard';
import { JobsGateway } from './jobs.gateway';
import { JobsEventsService } from './jobs-events.service';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { PlansModule } from '../plans/plans.module';
import { PentestJobsModule } from '../pentest-jobs/pentest-jobs.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    ChatModule,
    PlansModule,
    PentestJobsModule,
  ],
  controllers: [GwehAIController],
  providers: [GwehAIService, GwehAISSEGuard, JobsEventsService, JobsGateway],
  exports: [GwehAIService, JobsEventsService, GwehAISSEGuard],
})
export class GwehAIModule {}
