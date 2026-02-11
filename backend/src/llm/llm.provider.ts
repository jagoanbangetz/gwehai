import { Model } from '../entities/model.entity';
import { LlmMessage, LlmResponse, LlmToolDef } from './llm.types';

export interface LlmProvider {
  canHandle(model: Model): boolean;
  generate(model: Model, messages: LlmMessage[]): Promise<LlmResponse>;
  generateWithTools?(
    model: Model,
    messages: LlmMessage[],
    tools: LlmToolDef[],
    options?: { tool_choice?: 'auto' | 'required' | 'none' },
  ): Promise<LlmResponse>;
}
