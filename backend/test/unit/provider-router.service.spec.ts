import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderRouterService } from '../../src/llm/provider-router.service';
import { CostManagerService } from '../../src/llm/cost-manager.service';

const mockGenerateText = jest.fn();
jest.mock('ai', () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
}));

describe('ProviderRouterService', () => {
  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'GROQ_API_KEY') return 'test-groq-key';
      return undefined;
    }),
  };
  const mockCostManager = {
    getCaps: jest.fn(() => ({ maxOutputTokens: 300, maxInputTokens: 6000 })),
    estimateCost: jest.fn(() => null),
    isCostDebug: jest.fn(() => false),
    shouldUseCheapModelForAuto: jest.fn(() => false),
    getAutoCheapModelId: jest.fn(() => 'llama-3.3-70b-versatile'),
  };

  let service: ProviderRouterService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    mockGenerateText.mockResolvedValue({
      text: 'Hello',
      usage: { promptTokens: 10, completionTokens: 5 },
    });
    service = new ProviderRouterService(
      mockConfig as unknown as ConfigService,
      mockCostManager as unknown as CostManagerService,
    );
  });

  describe('runChatCompletion (Auto/Groq)', () => {
    it('returns text and meta on success', async () => {
      const result = await service.runChatCompletion({
        selectedModelKey: 'auto',
        messages: [{ role: 'user', content: 'Hi' }],
        mode: 'decision',
      });
      expect(result.text).toBe('Hello');
      expect(result.meta.provider).toBe('groq');
      expect(result.meta.tokens?.input).toBe(10);
      expect(result.meta.tokens?.output).toBe(5);
    });
  });

  describe('generateWithTools (Auto/Groq)', () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'run_pentest',
          description: 'Run pentest',
          parameters: { type: 'object' as const, properties: {} },
        },
      },
    ];
    const opts = {
      selectedModelKey: 'auto' as const,
      messages: [{ role: 'user' as const, content: 'Pentest http://example.com' }],
      tools,
      mode: 'decision' as const,
    };

    it('throws user-friendly message when Groq returns "Failed to call a function"', async () => {
      const groqErrorBody = JSON.stringify({
        error: {
          message: 'Failed to call a function. Pl...ls/WEB_CHECKLIST.md"></function>\n',
        },
      });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(groqErrorBody),
      });
      const err = await service.generateWithTools(opts).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).message).toMatch(/Try again or use a different model/);
    });

    it('returns content and sanitized tool_calls on 200', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: 'I will run the tool.',
                  tool_calls: [
                    {
                      id: 'call_1',
                      function: { name: 'run_pentest', arguments: '{"url":"http://example.com"}' },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 30 },
          }),
      });
      const result = await service.generateWithTools(opts);
      expect(result.content).toBe('I will run the tool.');
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls![0].name).toBe('run_pentest');
      expect(result.tool_calls![0].arguments).toBe('{"url":"http://example.com"}');
    });

    it('sanitizes tool_calls with invalid JSON arguments to {}', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_2',
                      function: { name: 'run_pentest', arguments: 'not valid json {{{' },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
      });
      const result = await service.generateWithTools({
        ...opts,
        messages: [{ role: 'user', content: 'Pentest' }],
      });
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls![0].name).toBe('run_pentest');
      expect(result.tool_calls![0].arguments).toBe('{}');
    });

    it('filters out tool_calls with missing function name', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    { id: 'x', function: { name: 'valid_tool', arguments: '{}' } },
                    { id: 'y', function: { arguments: '{}' } },
                    { id: 'z', function: { name: '', arguments: '{}' } },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
      });
      const result = await service.generateWithTools({
        ...opts,
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'valid_tool',
              description: 'Valid',
              parameters: { type: 'object' as const, properties: {} },
            },
          },
        ],
      });
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls![0].name).toBe('valid_tool');
    });
  });
});
