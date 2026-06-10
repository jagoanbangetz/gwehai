import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSetting } from '../entities/admin-setting.entity';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { LlmService } from './llm.service';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';
import { CostManagerService } from './cost-manager.service';
import { ProviderRouterService } from './provider-router.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([AdminSetting]),
  ],
  providers: [
    OpenAICompatibleProvider,
    CostManagerService,
    AdminSettingsService,
    ProviderRouterService,
    {
      provide: 'LLM_PROVIDERS',
      useFactory: (provider: OpenAICompatibleProvider) => [provider],
      inject: [OpenAICompatibleProvider],
    },
    LlmService,
  ],
  exports: [LlmService, CostManagerService, ProviderRouterService, AdminSettingsService],
})
export class LlmModule {}
