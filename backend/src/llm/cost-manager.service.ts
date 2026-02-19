import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getOptionByKey, type ModelOptionKey } from '../config/model-options.config';

export type CostMode = 'decision' | 'long';

/** Hard caps for cost management */
export interface TokenCaps {
  maxOutputTokens: number;
  maxInputTokens: number;
}

/** Rough price per 1M tokens (optional, for costEstimate). */
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.14, output: 0.28 },
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
};

@Injectable()
export class CostManagerService {
  private readonly maxOutputDefault: number;
  private readonly maxOutputLong: number;
  private readonly maxOutputTools: number | null;
  private readonly maxInputAuto: number;
  private readonly maxInputPaid: number;
  private readonly costDebug: boolean;

  constructor(private readonly config: ConfigService) {
    this.maxOutputDefault = Number(this.config.get('MAX_OUTPUT_TOKENS_DEFAULT')) || 300;
    this.maxOutputLong = Number(this.config.get('MAX_OUTPUT_TOKENS_LONG')) || 800;
    const toolsCap = this.config.get('MAX_OUTPUT_TOKENS_TOOLS');
    this.maxOutputTools = toolsCap != null && toolsCap !== '' ? Number(toolsCap) || null : null;
    this.maxInputAuto = Number(this.config.get('MAX_INPUT_TOKENS_AUTO')) || 6000;
    this.maxInputPaid = Number(this.config.get('MAX_INPUT_TOKENS_PAID')) || 8000;
    this.costDebug = this.config.get('COST_DEBUG') === 'true';
  }

  /**
   * Get token caps for a request.
   * - decision: max_output_tokens_default (300), input budget by provider (8000 for DeepSeek/OpenAI/Anthropic).
   * - long: max_output_tokens_long (800), same input budget.
   */
  getCaps(modelKey: ModelOptionKey, mode: CostMode): TokenCaps {
    const option = getOptionByKey(modelKey);
    const maxInput = this.maxInputPaid;
    const maxOutput = mode === 'long' ? this.maxOutputLong : this.maxOutputDefault;
    return { maxOutputTokens: maxOutput, maxInputTokens: maxInput };
  }

  /**
   * When set (MAX_OUTPUT_TOKENS_TOOLS), use this for tool-call requests so the model has room to
   * return tool_calls (e.g. 15000 for Groq pentest flow). Otherwise returns null and caller uses getCaps().
   */
  getToolsOutputCap(): number | null {
    return this.maxOutputTools;
  }

  /** Input token budget for the given model key (8000 for all providers). */
  getInputBudget(modelKey: ModelOptionKey): number {
    return this.maxInputPaid;
  }

  /** Rough cost estimate (tokens * price per 1M). Does not throw if price unknown. */
  estimateCost(provider: string, inputTokens: number, outputTokens: number): number | null {
    const prices = PRICE_PER_1M[provider];
    if (!prices) return null;
    const inputCost = (inputTokens / 1_000_000) * prices.input;
    const outputCost = (outputTokens / 1_000_000) * prices.output;
    return Math.round((inputCost + outputCost) * 1e6) / 1e6;
  }

  isCostDebug(): boolean {
    return this.costDebug;
  }
}
