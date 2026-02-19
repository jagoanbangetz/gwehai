import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Model } from '../../entities/model.entity';
import { LlmMessage, LlmResponse, LlmToolDef } from '../llm.types';
import { LlmProvider } from '../llm.provider';

@Injectable()
export class OpenAICompatibleProvider implements LlmProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  canHandle(model: Model): boolean {
    const metadata = model?.metadata || {};
    return (
      Boolean(metadata?.apiBase) ||
      Boolean(metadata?.apiKeyEnv) ||
      model?.provider === 'openai' ||
      model?.provider === 'custom' ||
      model?.name?.startsWith('deepseek/')
    );
  }

  async generate(model: Model, messages: LlmMessage[]): Promise<LlmResponse> {
    const metadata = model?.metadata || {};
    const apiBase = this.getApiBase(model, metadata);
    const apiKeyEnv = this.getApiKeyEnv(model, metadata);
    const apiKey = this.configService.get<string>(apiKeyEnv || '');

    if (!apiKey) {
      throw new HttpException(
        `Missing API key. Set ${apiKeyEnv} in your environment.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const modelName = metadata?.api_model || model?.name;
    const temperature =
      typeof metadata?.temperature === 'number' ? metadata.temperature : 0.7;
    const url = this.getCompletionsUrl(apiBase);

    const payload = {
      model: modelName,
      messages,
      temperature,
      stream: false,
    };

    console.log('[LLM API] request', {
      url,
      model: modelName,
      messages: messages.length,
      stream: false,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        }),
      );

      const data = response.data || {};
      const content =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        '';
      const usage = data?.usage || {};
      const text = String(content || '');
      const maxPreview = 600;
      const contentPreview = text.length > maxPreview ? text.slice(0, maxPreview) + '...' : text;

      console.log('[LLM API] response', {
        model: modelName,
        contentLength: text.length,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        contentPreview,
      });

      return {
        content: String(content || ''),
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        },
      };
    } catch (error: any) {
      console.log('[LLM API] error', { model: modelName, status: error?.response?.status, message: error?.message });
      if (error?.response?.data) {
        const detail =
          error.response.data?.error?.message ||
          error.response.data?.message ||
          error.response.data?.detail ||
          'LLM provider error';
        throw new HttpException(detail, error.response.status || 500);
      }
      throw new HttpException(
        error?.message || 'Failed to call LLM provider',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async generateWithTools(
    model: Model,
    messages: LlmMessage[],
    tools: LlmToolDef[],
    options?: { tool_choice?: 'auto' | 'required' | 'none'; max_tokens?: number },
  ): Promise<LlmResponse> {
    const metadata = model?.metadata || {};
    const apiBase = this.getApiBase(model, metadata);
    const apiKeyEnv = this.getApiKeyEnv(model, metadata);
    const apiKey = this.configService.get<string>(apiKeyEnv || '');

    if (!apiKey) {
      throw new HttpException(
        `Missing API key. Set ${apiKeyEnv} in your environment.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const modelName = metadata?.api_model || model?.name;
    const temperature =
      typeof metadata?.temperature === 'number' ? metadata.temperature : 0.7;
    const url = this.getCompletionsUrl(apiBase);

    const apiMessages = messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: m.tool_call_id,
          content: m.content,
        };
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

    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const payload: Record<string, unknown> = {
      model: modelName,
      messages: apiMessages,
      tools: apiTools,
      temperature,
      stream: false,
    };
    if (options?.tool_choice === 'required') {
      payload.tool_choice = 'required';
    } else if (options?.tool_choice === 'none') {
      payload.tool_choice = 'none';
    }
    if (options?.max_tokens != null && options.max_tokens > 0) {
      payload.max_tokens = options.max_tokens;
    }

    console.log('[LLM API] request (tools)', {
      url,
      model: modelName,
      messages: apiMessages.length,
      tools: apiTools.length,
      tool_choice: options?.tool_choice,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        }),
      );

      const data = response.data || {};
      const msg = data?.choices?.[0]?.message || {};
      const content = msg.content ?? data?.choices?.[0]?.text ?? '';
      const rawToolCalls = msg.tool_calls || [];
      const usage = data?.usage || {};

      const tool_calls = rawToolCalls.map((tc: any) => ({
        id: tc.id || tc.function?.name,
        name: tc.function?.name || '',
        arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {}),
      }));

      const text = String(content || '');
      const maxPreview = 600;
      const contentPreview = text.length > maxPreview ? text.slice(0, maxPreview) + '...' : text;

      console.log('[LLM API] response (tools)', {
        model: modelName,
        contentLength: text.length,
        tool_calls: tool_calls.length,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        contentPreview,
      });

      return {
        content: String(content || ''),
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        },
        ...(tool_calls.length ? { tool_calls } : {}),
      };
    } catch (error: any) {
      console.log('[LLM API] error (tools)', { model: modelName, status: error?.response?.status, message: error?.message });
      if (error?.response?.data) {
        const detail =
          error.response.data?.error?.message ||
          error.response.data?.message ||
          error.response.data?.detail ||
          'LLM provider error';
        throw new HttpException(detail, error.response.status || 500);
      }
      throw new HttpException(
        error?.message || 'Failed to call LLM provider',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private getApiBase(model: Model, metadata: Record<string, any>): string {
    if (metadata?.apiBase) {
      return String(metadata.apiBase);
    }

    if (model?.name?.startsWith('deepseek/')) {
      return this.configService.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    }

    if (model?.provider === 'openai') {
      return this.configService.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    }

    return this.configService.get<string>('LLM_BASE_URL') || 'https://api.deepseek.com';
  }

  private getApiKeyEnv(model: Model, metadata: Record<string, any>): string {
    if (metadata?.apiKeyEnv) {
      return String(metadata.apiKeyEnv);
    }

    if (model?.name?.startsWith('deepseek/')) {
      return 'DEEPSEEK_API_KEY';
    }

    if (model?.provider === 'openai') {
      return 'OPENAI_API_KEY';
    }

    return 'LLM_API_KEY';
  }

  private getCompletionsUrl(apiBase: string): string {
    const trimmed = apiBase.replace(/\/+$/, '');
    if (/\/v1$/.test(trimmed) || /\/v1\//.test(trimmed)) {
      return `${trimmed}/chat/completions`;
    }
    return `${trimmed}/v1/chat/completions`;
  }
}
