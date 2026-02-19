import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText } from 'ai';
import { getOptionByKey, getModelOptions, type ModelOptionKey } from '../config/model-options.config';
import { CostManagerService, type CostMode } from './cost-manager.service';
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
  messages: LlmMessage[];
  mode: CostMode;
}

export interface RunChatCompletionResult {
  text: string;
  meta: ChatCompletionMeta;
}

export interface GenerateWithToolsOptions {
  selectedModelKey: ModelOptionKey;
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

/** Parse API error response body and return a user-friendly message. */
function parseApiErrorResponse(body: string, provider: string, fallback: string): string {
  try {
    const json = JSON.parse(body);
    const msg = json?.error?.message ?? json?.message ?? json?.error;
    if (typeof msg === 'string' && msg.trim()) {
      if (/failed to call a function|invalid.*function|malformed.*tool|tool_use_failed/i.test(msg)) {
        return `The ${provider} model returned an invalid response. Try again or use a different model (e.g. DeepSeek or Claude) for this task.`;
      }
      return msg.length > 500 ? msg.slice(0, 500) + '...' : msg;
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
}

/** Normalize any LLM/API error string before sending to client (SSE). Handles raw JSON and tool_use_failed. */
export function normalizeLlmErrorMessage(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'An error occurred. Please try again.';
  if (/failed to call a function|tool_use_failed|failed_generation/i.test(s)) {
    return TOOL_USE_FAILED_MESSAGE;
  }
  try {
    const json = JSON.parse(s);
    const msg = json?.error?.message ?? json?.message;
    if (typeof msg === 'string' && msg.trim()) {
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
  ) {}

  /**
   * Single entry: run chat completion with the selected model key.
   * Routes to DeepSeek (Auto), OpenAI, or Anthropic.
   */
  async runChatCompletion(opts: RunChatCompletionOptions): Promise<RunChatCompletionResult> {
    const { selectedModelKey, messages, mode } = opts;
    const option = getOptionByKey(selectedModelKey);
    if (!option) {
      throw new HttpException(`Unknown model key: ${selectedModelKey}`, HttpStatus.BAD_REQUEST);
    }
    const caps = this.costManager.getCaps(selectedModelKey, mode);
    const start = Date.now();

    let text: string;
    let provider: string;
    let model: string;
    let inputTokens = 0;
    let outputTokens = 0;

    switch (option.provider) {
      case 'deepseek':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callDeepSeek(option, messages, caps));
        break;
      case 'openai':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callOpenAI(option, messages, caps));
        break;
      case 'anthropic':
        ({ text, provider, model, inputTokens, outputTokens } = await this.callAnthropic(option, messages, caps));
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
    const { selectedModelKey, messages, tools, mode, tool_choice } = opts;
    const option = getOptionByKey(selectedModelKey);
    if (!option) {
      throw new HttpException(`Unknown model key: ${selectedModelKey}`, HttpStatus.BAD_REQUEST);
    }
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

    switch (option.provider) {
      case 'deepseek':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callDeepSeekWithTools(
          option,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'openai':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callOpenAIWithTools(
          option,
          messages,
          tools,
          caps,
          tool_choice,
        ));
        break;
      case 'anthropic':
        ({ content, tool_calls, provider, model, inputTokens, outputTokens } = await this.callAnthropicWithTools(
          option,
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
    const apiKey = this.config.get<string>(option.apiKeyEnv);
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
    const apiKey = this.config.get<string>(option.apiKeyEnv);
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
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      tools: apiTools,
      tool_choice: tool_choice === 'required' ? 'required' : tool_choice === 'none' ? 'none' : 'auto',
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
    // API can return 200 with error in body (e.g. tool_use_failed)
    if (data?.error) {
      const errBody = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
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
  private async callOpenAI(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = this.config.get<string>(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = this.config.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const body = {
      model: option.defaultModel,
      messages: this.llmMessagesToOpenAI(messages),
      max_tokens: caps.maxOutputTokens,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'OpenAI', errText || 'OpenAI API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
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
    const apiKey = this.config.get<string>(option.apiKeyEnv);
    if (!apiKey) {
      throw new HttpException(`Missing ${option.apiKeyEnv}`, HttpStatus.BAD_REQUEST);
    }
    const baseUrl = this.config.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const url = baseUrl.replace(/\/?$/, '') + '/chat/completions';
    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      const message = parseApiErrorResponse(errText, 'OpenAI', errText || 'OpenAI API error');
      throw new HttpException(message, res.status);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message || {};
    const content = msg.content ?? '';
    const rawToolCalls = msg.tool_calls || [];
    const tool_calls = sanitizeToolCalls(rawToolCalls);
    const usage = data?.usage || {};
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      provider: 'openai',
      model: option.defaultModel,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  // --- Anthropic ---
  private async callAnthropic(
    option: { defaultModel: string; apiKeyEnv: string },
    messages: LlmMessage[],
    caps: { maxOutputTokens: number },
  ): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number }> {
    const apiKey = this.config.get<string>(option.apiKeyEnv);
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
    const apiKey = this.config.get<string>(option.apiKeyEnv);
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
