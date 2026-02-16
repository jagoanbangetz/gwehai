import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
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
  ],
  providers: [
    OpenAICompatibleProvider,
    CostManagerService,
    ProviderRouterService,
    {
      provide: 'LLM_PROVIDERS',
      useFactory: (provider: OpenAICompatibleProvider) => [provider],
      inject: [OpenAICompatibleProvider],
    },
    LlmService,
  ],
  exports: [LlmService, CostManagerService, ProviderRouterService],
})
export class LlmModule {}
