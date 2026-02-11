import { Inject, Injectable } from '@nestjs/common';
import { Model } from '../entities/model.entity';
import { LlmMessage, LlmResponse, LlmToolDef } from './llm.types';
import { LlmProvider } from './llm.provider';

@Injectable()
export class LlmService {
  constructor(
    @Inject('LLM_PROVIDERS')
    private readonly providers: LlmProvider[],
  ) {}

  async generate(model: Model, messages: LlmMessage[]): Promise<LlmResponse | null> {
    const provider = this.providers.find((candidate) => candidate.canHandle(model));
    if (!provider) {
      return null;
    }
    return provider.generate(model, messages);
  }

  async generateWithTools(
    model: Model,
    messages: LlmMessage[],
    tools: LlmToolDef[],
    options?: { tool_choice?: 'auto' | 'required' | 'none' },
  ): Promise<LlmResponse | null> {
    const provider = this.providers.find((candidate) => candidate.canHandle(model));
    if (!provider) {
      return null;
    }
    if (provider.generateWithTools) {
      return provider.generateWithTools(model, messages, tools, options);
    }
    return provider.generate(model, messages);
  }
}
