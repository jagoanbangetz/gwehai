import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GwehAIController } from './gwehai.controller';
import { GwehAIService } from './gwehai.service';
import { GwehAISSEGuard } from './gwehai-sse.guard';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key',
      }),
      inject: [ConfigService],
    }),
    AuthModule, // Import AuthModule to use AuthService for user validation
    ChatModule,
    PlansModule,
  ],
  controllers: [GwehAIController],
  providers: [GwehAIService, GwehAISSEGuard],
  exports: [GwehAIService],
})
export class GwehAIModule {}
