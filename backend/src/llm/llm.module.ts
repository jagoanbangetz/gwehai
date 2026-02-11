import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';

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
    {
      provide: 'LLM_PROVIDERS',
      useFactory: (provider: OpenAICompatibleProvider) => [provider],
      inject: [OpenAICompatibleProvider],
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
