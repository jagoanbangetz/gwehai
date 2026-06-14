import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText } from 'ai';
import { getOptionByKey, getModelOptions, type ModelOptionKey } from '../config/model-options.config';
import { CostManagerService, type CostMode } from './cost-manager.service';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { normalizeToolMessageOrder } from '../chat/context-manager';
import type { LlmMessage, LlmResponse, LlmToolDef } from './llm.types';

export interface ChatCompletionMeta {
  provider: string;
  model: string;
  tokens?: { input?: number; output?: number };
  latencyMs: number;
  costEstimate?: number | null;
}

export interface RunChatCompletionOptions {
  userId?: string;
  selectedModelKey: ModelOptionKey;
  /** When set, use this API model id instead of the option's defaultModel. */
  selectedModelIdOverride?: string;
  messages: LlmMessage[];
  mode: CostMode;
}

export interface RunChatCompletionResult {
  text: string;
  meta: ChatCompletionMeta;
}

export interface GenerateWithToolsOptions {
  selectedModelKey: ModelOptionKey;
  /** When set, use this API model id (e.g. gpt-5.4, gemini-2.5-flash) instead of the option's defaultModel. */
  selectedModelIdOverride?: string;
  messages: LlmMessage[];
  tools: LlmToolDef[];
  mode: CostMode;
  tool_choice?: 'auto' | 'required' | 'none';
}

export interface GenerateWithToolsResult {
  content: string;
  tool_calls?: LlmResponse['tool_calls'];
  meta: ChatCompletionMeta;
}

/** User-friendly message when Groq/LLM returns tool_use_failed or malformed tool call. */
export const TOOL_USE_FAILED_MESSAGE =
  'The model returned an invalid response. Try again or use a different model (e.g. DeepSeek or Claude) for this task.';

/** Friendly message for tool_calls protocol errors (unpaired tool_calls in conversation history). */
export const TOOL_CALLS_PROTOCOL_MESSAGE =
  'AI processing error — automatically retrying. If this persists, start a new chat.';

/** Parse API error response body and return a user-friendly message. */
function parseApiErrorResponse(body: string, provider: string, fallback: string): string {
  try {
    const json = JSON.parse(body);
    const msg = json?.error?.message ?? json?.message ?? json?.error;
    if (typeof msg === 'string' && msg.trim()) {
      if (/tool_calls must be followed|insufficient tool messages/i.test(msg)) {
        return TOOL_CALLS_PROTOCOL_MESSAGE;
      }
      if (/failed to call a function|invalid.*function|malformed.*tool|tool_use_failed/i.test(msg)) {
        return `The ${provider} model returned an invalid response. Try again or use a different model (e.g. DeepSeek or Claude) for this task.`;
      }
      return msg.length > 500 ? msg.slice(0, 500) + '...' : msg;
    }
  } catch {
    // ignore parse errors
  }
  // Also check raw body string for the pattern (non-JSON errors)
  if (/tool_calls must be followed|insufficient tool messages/i.test(body)) {
    return TOOL_CALLS_PROTOCOL_MESSAGE;
  }
  return fallback;
}

/** Normalize any LLM/API error string before sending to client (SSE). Handles raw JSON, tool_use_failed, and tool_calls protocol errors. */
export function normalizeLlmErrorMessage(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'An error occurred. Please try again.';
  // tool_calls protocol error — unpaired tool_calls in conversation history
  if (/tool_calls must be followed|insufficient tool messages/i.test(s)) {
    return TOOL_CALLS_PROTOCOL_MESSAGE;
  }
  if (/failed to call a function|tool_use_failed|failed_generation/i.test(s)) {
    return TOOL_USE_FAILED_MESSAGE;
  }
  try {
    const json = JSON.parse(s);
    const msg = json?.error?.message ?? json?.message;
    if (typeof msg === 'string' && msg.trim()) {
      if (/tool_calls must be followed|insufficient tool messages/i.test(msg)) return TOOL_CALLS_PROTOCOL_MESSAGE;
      if (/failed to call a function|tool_use_failed/i.test(msg)) return TOOL_USE_FAILED_MESSAGE;
      return msg.length > 500 ? msg.slice(0, 500) + '...' : msg;
    }
  } catch {
    // not JSON
  }
  return s.length > 500 ? s.slice(0, 500) + '...' : s;
}

/** Sanitize OpenAI-style tool_calls: filter by name, ensure valid JSON arguments. */
function sanitizeToolCalls(raw: any[]): Array<{ id: string; name: string; arguments: string }> {
  return raw
    .filter((tc: any) => tc?.function?.name)
    .map((tc: any) => {
      let argsStr =
        typeof tc.function?.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function?.arguments ?? {});
      try {
        JSON.parse(argsStr);
      } catch {
        argsStr = '{}';
      }
      return {
        id: tc.id || tc.function?.name || `call_${Date.now()}`,
        name: String(tc.function?.name ?? '').trim(),
        arguments: argsStr,
      };
    });
}

@Injectable()
export class ProviderRouterService {
  constructor(
    private readonly config: ConfigService,
    private readonly costManager: CostManagerService,
    private readonly adminSettings: AdminSettingsService,
  ) {}

  /**
   * Single entry: run chat completion with the selected model key.
   * Routes to DeepSeek (Auto), OpenAI, or Anthropic.
   */
  async runChatCompletion(opts: RunChatCompletionOptions): Promise<RunChatCompletionResult> {
    const { selectedModelKey, selectedModelIdOverride, messages, mode } = opts;
    const option = getOptionByKey(selectedModelKey);
    if (!option) {
      throw new HttpException(`Unknown model key: ${selectedModelKey}`, HttpStatus.BAD_REQUEST);
    }
    const effectiveOption = selectedModelIdOverride
      ? { ...option, defaultModel: selectedModelIdOverride }
      : option;
    const caps = this.costManager.getCaps(selectedModelKey, mode);
    const start = Date.now();

    let text: string;
    let provider: string;
    let model: string;
    let inputTokens = 0;
    let outputTokens = 0;

    switch (effectiveOption.provider) {
      case 'deepseek':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callDeepSeek(effectiveOption, messages, caps));
        break;
      case 'openai':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callOpenAI(effectiveOption, messages, caps));
        break;
      case 'anthropic':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callAnthropic(effectiveOption, messages, caps));
        break;
      case 'gemini':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callGemini(effectiveOption, messages, caps));
        break;
      case 'xai':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callXAI(effectiveOption, messages, caps));
        break;
      case 'meta':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callMeta(effectiveOption, messages, caps));
        break;
      default:
        throw new HttpException(`Unsupported provider: ${option.provider}`, HttpStatus.BAD_REQUEST);
    }

    const latencyMs = Date.now() - start;
    const costEstimate = this.costManager.estimateCost(provider, inputTokens, outputTokens);
    if (this.costManager.isCostDebug()) {
      console.log('[ProviderRouter]', { provider, model, inputTokens, outputTokens, latencyMs, costEstimate });
    }

    return {
      text,
      meta: {
        provider,
        model,
        tokens: { input: inputTokens, output: outputTokens },
        latencyMs,
        costEstimate: costEstimate ?? undefined,
      },
    };
  }

  /**
   * Generate with tool support (for pentest agent loop).
   */
  async generateWithTools(opts: GenerateWithToolsOptions): Promise<GenerateWithToolsResult> {
    const { selectedModelKey, selectedModelIdOverride, messages, tools, mode, tool_choice } = opts;
    const option = getOptionByKey(selectedModelKey);
    if (!option) {
      throw new HttpException(`Unknown model key: ${selectedModelKey}`, HttpStatus.BAD_REQUEST);
    }
    const effectiveOption = selectedModelIdOverride
      ? { ...option, defaultModel: selectedModelIdOverride }
      : option;
    let caps = this.costManager.getCaps(selectedModelKey, mode);
    const toolsCap = this.costManager.getToolsOutputCap();
    if (toolsCap != null && toolsCap > 0) {
      caps = { ...caps, maxOutputTokens: toolsCap };
    }
    const start = Date.now();

    let content: string;
    let tool_calls: LlmResponse['tool_calls'];
    let provider: string;
    let model: string;
    let inputTokens = 0;
    let outputTokens = 0;

    switch (effectiveOption.provider) {
      case 'deepseek':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callDeepSeekWithTools(
          effectiveOption,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'openai':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callOpenAIWithTools(
          effectiveOption,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'anthropic':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callAnthropicWithTools(
          effectiveOption,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'gemini':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callGeminiWithTools(
          effectiveOption,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'xai':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callXAIWithTools(
          effectiveOption,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'meta':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callMetaWithTools(
          effectiveOption,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      default:
        throw new HttpException(`Unsupported provider: ${option.provider}`, HttpStatus.BAD_REQUEST);
    }

    const latencyMs = Date.now() - start;
    const costEstimate = this.costManager.estimateCost(provider, inputTokens, outputTokens);
    if (this.costManager.isCostDebug()) {
      console.log('[ProviderRouter] tools', { provider, model, inputTokens, outputTokens, latencyMs, costEstimate });
    }

    return {
      content,
      tool_calls,
      meta: {
        provider,
        model,
        tokens: { input: inputTokens, output: outputTokens },
        latencyMs,
        costEstimate: costEstimate ?? undefined,
      },
    };
  }

  /** List model options for UI / admin */
  listModelOptions() {
    return getModelOptions();
  }

  // --- DeepSeek (Auto + DeepSeek) ---
  private async callDeepSeek(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      max_tokens: caps.maxOutputTokens,
    };
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'DeepSeek', errText || 'DeepSeek API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const usage = data?.usage || {};
    return {
      text: content,
      provider: 'deepseek',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  private async callDeepSeekWithTools(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    tools: LlmToolDef[],
    caps: { maxOutputTokens: number },
    tool_choice?: 'auto' | 'required' | 'none',
  ): Promise<{
    content: string;
    tool_calls: LlmResponse['tool_calls'];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    // Helper to build request body from messages
    const buildBody = (msgs: LlmMessage[]) => ({
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(msgs),
      tools: apiTools,
      // tool_choice NOT sent — DeepSeek V4 Pro rejects "thinking mode does not support tool_choice"
      max_tokens: caps.maxOutputTokens,
    });

    // First attempt with original messages
    let body = buildBody(messages);
    let res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    // Handle HTTP errors
    if (!res.ok) {
      const errText = await res.text();
      // Retry once if tool_calls protocol error — strip unpaired tool_calls and retry
      if (/tool_calls must be followed|insufficient tool messages/i.test(errText)) {
        console.log('[DeepSeek] tool_calls protocol error detected, retrying with normalized messages...');
        const normalized = normalizeToolMessageOrder(messages);
        body = buildBody(normalized);
        res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const retryErrText = await res.text();
          const message = parseApiErrorResponse(retryErrText, 'DeepSeek', retryErrText || 'DeepSeek API error');
          throw new HttpException(message, res.status);
        }
      } else {
        const message = parseApiErrorResponse(errText, 'DeepSeek', errText || 'DeepSeek API error');
        throw new HttpException(message, res.status);
      }
    }

    const data = await res.json();
    // API can return 200 with error in body (e.g. tool_use_failed, tool_calls protocol)
    if (data?.error) {
      const errBody = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      // Retry once if tool_calls protocol error
      if (/tool_calls must be followed|insufficient tool messages/i.test(errBody)) {
        console.log('[DeepSeek] tool_calls protocol error in response body, retrying with normalized messages...');
        const normalized = normalizeToolMessageOrder(messages);
        body = buildBody(normalized);
        res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const retryErrText = await res.text();
          const message = parseApiErrorResponse(retryErrText, 'DeepSeek', retryErrText || 'DeepSeek API error');
          throw new HttpException(message, res.status);
        }
        const retryData = await res.json();
        if (retryData?.error) {
          const retryErrBody = typeof retryData.error === 'string' ? retryData.error : JSON.stringify(retryData.error);
          const message = parseApiErrorResponse(retryErrBody, 'DeepSeek', retryErrBody || 'DeepSeek API error');
          throw new HttpException(message, 400);
        }
        // Process successful retry response
        const retryMsg = retryData?.choices?.[0]?.message || {};
        const retryContent = retryMsg.content ?? '';
        const retryRawToolCalls = retryMsg.tool_calls || [];
        const retryToolCalls = sanitizeToolCalls(retryRawToolCalls);
        const retryUsage = retryData?.usage || {};
        return {
          content: retryContent,
          tool_calls: retryToolCalls.length ? retryToolCalls : undefined,
          provider: 'deepseek',
          model: option.defaultModel,
          inputTokens: retryUsage.prompt_tokens ?? 0,
          outputTokens: retryUsage.completion_tokens ?? 0,
        };
      }
      const message = parseApiErrorResponse(errBody, 'DeepSeek', errBody || 'DeepSeek API error');
      throw new HttpException(message, 400);
    }

    const msg = data?.choices?.[0]?.message || {};
    const content = msg.content ?? '';
    const rawToolCalls = msg.tool_calls || [];
    const tool_calls = sanitizeToolCalls(rawToolCalls);
    const usage = data?.usage || {};
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      provider: 'deepseek',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  // --- OpenAI ---
  /** OpenAI: newer models require max_completion_tokens; older use max_tokens. Try both on param errors so the API response is preserved. */
  private async callOpenAI(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = await this.adminSettings.getApiKey('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    // Log model id so "model not exist" errors can be traced to the exact id sent (e.g. gpt-4o)
    console.log('[ProviderRouter] OpenAI chat model:', option.defaultModel);
    const payloads: Array<Record<string, unknown>> = [
      { model: option.defaultModel, messages: this.llmMessagesToOpenAI(messages), max_completion_tokens: caps.maxOutputTokens },
      { model: option.defaultModel, messages: this.llmMessagesToOpenAI(messages), max_tokens: caps.maxOutputTokens },
    ];
    let lastErr: string | null = null;
    for (const body of payloads) {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const resText = await res.text();
      if (res.ok) {
        const data = JSON.parse(resText || '{}');
        const content = data?.choices?.[0]?.message?.content ?? '';
        const usage = data?.usage || {};
        return {
          text: content,
          provider: 'openai',
          model: option.defaultModel,
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
        };
      }
      lastErr = parseApiErrorResponse(resText, 'OpenAI', resText || 'OpenAI API error');
      const useOtherParam = /max_tokens.*not supported|max_completion_tokens.*not supported|use 'max_/i.test(lastErr);
      if (!useOtherParam) break;
    }
    const hint = /does not exist|model.*not exist|invalid.*model/i.test(lastErr || '')
      ? ' Use model id gpt-4o (set OPENAI_GPT5_MODEL_ID or pick GPT-4o in the model picker) and ensure OPENAI_API_KEY has access.'
      : '';
    throw new HttpException((lastErr || 'OpenAI API error') + hint, HttpStatus.BAD_REQUEST);
  }

  private async callOpenAIWithTools(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    tools: LlmToolDef[],
    caps: { maxOutputTokens: number },
    tool_choice?: 'auto' | 'required' | 'none',
  ): Promise<{
    content: string;
    tool_calls: LlmResponse['tool_calls'];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = await this.adminSettings.getApiKey('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
    const toolChoiceVal = tool_choice === 'required' ? 'required' : tool_choice === 'none' ? 'none' : 'auto';
    console.log('[ProviderRouter] OpenAI tools model:', option.defaultModel);
    const payloads: Array<Record<string, unknown>> = [
      { model: option.defaultModel, messages: this.llmMessagesToOpenAI(messages), tools: apiTools, tool_choice: toolChoiceVal, max_completion_tokens: caps.maxOutputTokens },
      { model: option.defaultModel, messages: this.llmMessagesToOpenAI(messages), tools: apiTools, tool_choice: toolChoiceVal, max_tokens: caps.maxOutputTokens },
    ];
    let lastErr: string | null = null;
    for (const body of payloads) {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const resText = await res.text();
      if (res.ok) {
        const data = JSON.parse(resText || '{}');
        const msg = data?.choices?.[0]?.message || {};
        const content = msg.content ?? '';
        const rawToolCalls = msg.tool_calls || [];
        const tool_calls = sanitizeToolCalls(rawToolCalls);
        const usage = data?.usage || {};
        return {
          content,
          tool_calls,
          provider: 'openai',
          model: option.defaultModel,
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
        };
      }
      lastErr = parseApiErrorResponse(resText, 'OpenAI', resText || 'OpenAI API error');
      const useOtherParam = /max_tokens.*not supported|max_completion_tokens.*not supported|use 'max_/i.test(lastErr);
      if (!useOtherParam) break;
    }
    const hint = /does not exist|model.*not exist|invalid.*model/i.test(lastErr || '')
      ? ' Use model id gpt-4o (set OPENAI_GPT5_MODEL_ID or pick GPT-4o in the model picker) and ensure OPENAI_API_KEY has access.'
      : '';
    throw new HttpException((lastErr || 'OpenAI API error') + hint, HttpStatus.BAD_REQUEST);
  }

  // --- Anthropic ---
  private async callAnthropic(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const { system, anthropicMessages } = this.llmMessagesToAnthropic(messages);
    const body: Record<string, unknown> = {
      model: option.defaultModel,
      max_tokens: caps.maxOutputTokens,
      messages: anthropicMessages,
    };
    if (system) body.system = system;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'Anthropic', errText || 'Anthropic API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const textBlock = (data.content || []).find((b: any) => b.type === 'text');
    const text = textBlock?.text ?? '';
    const usage = data.usage || {};
    return {
      text,
      provider: 'anthropic',
      model: option.defaultModel,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    };
  }

  private async callAnthropicWithTools(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    tools: LlmToolDef[],
    caps: { maxOutputTokens: number },
    tool_choice?: 'auto' | 'required' | 'none',
  ): Promise<{
    content: string;
    tool_calls: LlmResponse['tool_calls'];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const anthropicTools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
    const { system, anthropicMessages } = this.llmMessagesToAnthropic(messages);
    const body: Record<string, unknown> = {
      model: option.defaultModel,
      max_tokens: caps.maxOutputTokens,
      messages: anthropicMessages,
      tools: anthropicTools,
    };
    if (system) body.system = system;
    if (tool_choice === 'required') (body as any).tool_choice = { type: 'tool', name: tools[0]?.function?.name };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'Anthropic', errText || 'Anthropic API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const contentBlocks = (data.content || []).filter((b: any) => b.type === 'text');
    const content = contentBlocks.map((b: any) => b.text).join('\n');
    const toolUseBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use');
    const tool_calls = toolUseBlocks.map((b: any) => ({
      id: b.id,
      name: b.name,
      arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input || {}),
    }));
    const usage = data.usage || {};
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      provider: 'anthropic',
      model: option.defaultModel,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    };
  }

  // --- Gemini (Google AI Studio) ---
  private llmMessagesToGeminiContents(messages: LlmMessage[]): Array<{ role: 'user' | 'model'; parts: any[] }> {
    const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
    let systemText = '';
    for (const m of messages) {
      if (m.role === 'system') {
        systemText = (systemText ? systemText + '\n\n' : '') + (typeof m.content === 'string' ? m.content : '');
        continue;
      }
      if (m.role === 'user') {
        const text = typeof m.content === 'string' ? m.content : '';
        const parts = systemText ? [{ text: systemText + '\n\n' + text }] : [{ text }];
        if (systemText) systemText = '';
        contents.push({ role: 'user', parts });
        continue;
      }
      if (m.role === 'assistant') {
        if (m.tool_calls?.length) {
          const parts = m.tool_calls.map((tc) => ({
            functionCall: {
              name: tc.name,
              args: (() => {
                try {
                  return typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments || {};
                } catch {
                  return {};
                }
              })(),
            },
          }));
          contents.push({ role: 'model', parts });
        } else {
          const text = typeof m.content === 'string' ? m.content : '';
          if (text || !contents.length) {
            const parts = systemText ? [{ text: systemText + (text ? '\n\n' + text : '') }] : [{ text: text || '(no output)' }];
            if (systemText) systemText = '';
            contents.push({ role: 'model', parts });
          }
        }
        continue;
      }
      if (m.role === 'tool') {
        const toolCallId = (m.tool_call_id ?? '').trim();
        const content = typeof m.content === 'string' ? m.content : '';
        let name = 'tool_result';
        for (let i = messages.indexOf(m) - 1; i >= 0; i--) {
          const prev = messages[i];
          if (prev.role === 'assistant' && prev.tool_calls?.length) {
            const tc = prev.tool_calls.find((t) => (t.id ?? '') === toolCallId);
            if (tc) name = tc.name;
            break;
          }
        }
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name, response: { name: 'result', content } } }],
        });
      }
    }
    if (systemText) {
      if (contents.length && contents[contents.length - 1].role === 'user') {
        const last = contents[contents.length - 1];
        const part = last.parts[0];
        if (part && 'text' in part) part.text = systemText + '\n\n' + (part.text || '');
      } else contents.push({ role: 'user', parts: [{ text: systemText }] });
    }
    return contents;
  }

  private async callGemini(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const contents = this.llmMessagesToGeminiContents(messages);
    if (!contents.length) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${option.defaultModel}:generateContent`;
    const body = {
      contents,
      generationConfig: { maxOutputTokens: caps.maxOutputTokens },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'Gemini', errText || 'Gemini API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const textPart = parts.find((p: any) => p.text != null);
    const text = textPart?.text ?? '';
    const usage = data?.usageMetadata || {};
    return {
      text,
      provider: 'gemini',
      model: option.defaultModel,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    };
  }

  private async callGeminiWithTools(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    tools: LlmToolDef[],
    caps: { maxOutputTokens: number },
    _tool_choice?: 'auto' | 'required' | 'none',
  ): Promise<{
    content: string;
    tool_calls: LlmResponse['tool_calls'];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const contents = this.llmMessagesToGeminiContents(messages);
    if (!contents.length) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }
    const functionDeclarations = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || { type: 'object', properties: {} },
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${option.defaultModel}:generateContent`;
    const body = {
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: { maxOutputTokens: caps.maxOutputTokens },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'Gemini', errText || 'Gemini API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new HttpException('Gemini blocked the response for safety. Try another model or rephrase.', 400);
    }
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const textPart = parts.find((p: any) => p.text != null);
    const content = textPart?.text ?? '';
    const functionCallParts = parts.filter((p: any) => p.functionCall != null);
    const rawToolCalls = functionCallParts.map((p: any, i: number) => ({
      id: `gemini_${Date.now()}_${i}`,
      name: p.functionCall?.name ?? 'unknown',
      arguments: typeof p.functionCall?.args === 'object' ? JSON.stringify(p.functionCall.args) : (p.functionCall?.args ?? '{}'),
    }));
    const tool_calls = rawToolCalls.length ? rawToolCalls.filter((tc) => tc.name && tc.name !== 'unknown') : undefined;
    const usage = data?.usageMetadata || {};
    return {
      content,
      tool_calls,
      provider: 'gemini',
      model: option.defaultModel,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    };
  }

  // --- xAI (OpenAI-compatible API at api.x.ai) ---
  private async callXAI(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = await this.adminSettings.getApiKey('XAI_BASE_URL') || 'https://api.x.ai/v1';
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      max_tokens: caps.maxOutputTokens,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'xAI', errText || 'xAI API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const usage = data?.usage || {};
    return {
      text: content,
      provider: 'xai',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  private async callXAIWithTools(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    tools: LlmToolDef[],
    caps: { maxOutputTokens: number },
    tool_choice?: 'auto' | 'required' | 'none',
  ): Promise<{
    content: string;
    tool_calls: LlmResponse['tool_calls'];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = await this.adminSettings.getApiKey('XAI_BASE_URL') || 'https://api.x.ai/v1';
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
    }));
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      tools: apiTools,
      tool_choice: tool_choice === 'required' ? 'required' : tool_choice === 'none' ? 'none' : 'auto',
      max_tokens: caps.maxOutputTokens,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'xAI', errText || 'xAI API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    if (data?.error) {
      const errBody = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      throw new HttpException(parseApiErrorResponse(errBody, 'xAI', errBody), 400);
    }
    const msg = data?.choices?.[0]?.message || {};
    const content = msg.content ?? '';
    const tool_calls = sanitizeToolCalls(msg.tool_calls || []);
    const usage = data?.usage || {};
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      provider: 'xai',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  // --- Meta Llama (OpenAI-compatible via Groq/Together/Fireworks/etc.) ---
  private async callMeta(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = await this.adminSettings.getApiKey('META_BASE_URL');
    if (!baseUrl) {
      throw new HttpException('META_BASE_URL not configured. Set it to your Llama provider (e.g. https://api.groq.com/openai/v1)', HttpStatus.BAD_REQUEST);
    }
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      max_tokens: caps.maxOutputTokens,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'Meta/Llama', errText || 'Meta API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const usage = data?.usage || {};
    return {
      text: content,
      provider: 'meta',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  private async callMetaWithTools(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    tools: LlmToolDef[],
    caps: { maxOutputTokens: number },
    tool_choice?: 'auto' | 'required' | 'none',
  ): Promise<{
    content: string;
    tool_calls: LlmResponse['tool_calls'];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    const apiKey = await this.adminSettings.getApiKey(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = this.config.get<string>('META_BASE_URL');
    if (!baseUrl) {
      throw new HttpException('META_BASE_URL not configured. Set it to your Llama provider (e.g. https://api.groq.com/openai/v1)', HttpStatus.BAD_REQUEST);
    }
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
    }));
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      tools: apiTools,
      tool_choice: tool_choice === 'required' ? 'required' : tool_choice === 'none' ? 'none' : 'auto',
      max_tokens: caps.maxOutputTokens,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'Meta/Llama', errText || 'Meta API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    if (data?.error) {
      const errBody = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      throw new HttpException(parseApiErrorResponse(errBody, 'Meta/Llama', errBody), 400);
    }
    const msg = data?.choices?.[0]?.message || {};
    const content = msg.content ?? '';
    const tool_calls = sanitizeToolCalls(msg.tool_calls || []);
    const usage = data?.usage || {};
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      provider: 'meta',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  private messagesToPrompt(messages: LlmMessage[]): string {
    return messages
      .map((m) => {
        const role = m.role.toUpperCase();
        const content = typeof m.content === 'string' ? m.content : '';
        return `${role}:\n${content}`;
      })
      .join('\n\n');
  }

  private llmMessagesToOpenAI(messages: LlmMessage[]): Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: any[] }> {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, content: m.content, tool_call_id: m.tool_call_id };
      }
      if (m.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || '',
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  private llmMessagesToAnthropic(messages: LlmMessage[]): { system?: string; anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string | any[] }> } {
    let system: string | undefined;
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string | any[] }> = [];
    for (const m of messages) {
      if (m.role === 'system') {
        system = typeof m.content === 'string' ? m.content : '';
        continue;
      }
      if (m.role === 'tool') continue;
      const role = m.role === 'user' ? 'user' : 'assistant';
      const content = typeof m.content === 'string' ? m.content : '';
      anthropicMessages.push({ role, content });
    }
    return { system, anthropicMessages };
  }
}
