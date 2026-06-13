import { ToolsController } from '../../src/tools/tools.controller';
import { ToolsService } from '../../src/tools/tools.service';
import { ToolAvailabilityService } from '../../src/tools/tool-availability.service';
import { WebSearchService } from '../../src/tools/web-search.service';

describe('ToolsController', () => {
  const toolsService = {
    memorySearch: jest.fn(),
    memoryGet: jest.fn(),
    writeFile: jest.fn(),
    execCommand: jest.fn(),
  } as unknown as ToolsService;

  const toolAvailability = {
    getAvailableTools: jest.fn().mockResolvedValue({
      available: ['curl', 'nmap'],
      unavailable: [],
      categories: [],
      checkedAt: new Date().toISOString(),
      source: 'host',
    }),
    getAvailableToolNames: jest.fn().mockResolvedValue(['curl', 'nmap']),
    isToolAvailable: jest.fn().mockResolvedValue(true),
    invalidateCache: jest.fn(),
    refresh: jest.fn(),
  } as unknown as ToolAvailabilityService;

  const webSearchService = {
    search: jest.fn(),
    getRemainingSearches: jest.fn().mockReturnValue(10),
    resetSessionCounter: jest.fn(),
  } as unknown as WebSearchService;

  let controller: ToolsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ToolsController(toolsService, toolAvailability, webSearchService);
  });

  it('runs memory search', async () => {
    toolsService.memorySearch = jest.fn().mockResolvedValue([{ path: 'MEMORY.md' }]);
    const result = await controller.memorySearch({ query: 'test' });

    expect(result.results).toHaveLength(1);
  });

  it('gets memory file', async () => {
    toolsService.memoryGet = jest.fn().mockResolvedValue('content');
    const result = await controller.memoryGet({ path: 'MEMORY.md' });

    expect(result.text).toBe('content');
  });

  it('writes file', async () => {
    toolsService.writeFile = jest.fn().mockResolvedValue({ ok: true, path: 'MEMORY.md' });
    const result = await controller.writeFile({ path: 'MEMORY.md', content: 'hello' });

    expect(result.ok).toBe(true);
  });

  it('executes command', async () => {
    toolsService.execCommand = jest.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const result = await controller.exec({ command: 'nmap', args: ['-sV', 'example.com'], target: 'example.com' });

    expect(result.stdout).toBe('ok');
  });

  it('web search exploit', async () => {
    const mockResult = {
      type: 'exploit',
      query: 'Apache 2.4.49',
      results: [{ title: 'CVE-2021-41773', cve_id: 'CVE-2021-41773', source: 'nvd' }],
      count: 1,
      cached: false,
      search_time_ms: 500,
    };
    (webSearchService.search as jest.Mock).mockResolvedValue(mockResult);
    const result = await controller.webSearch({ query: 'Apache 2.4.49', type: 'exploit' });

    expect(result.type).toBe('exploit');
    expect(result.results).toHaveLength(1);
    expect(webSearchService.search).toHaveBeenCalledWith('Apache 2.4.49', 'exploit', undefined, undefined);
  });

  it('web search remaining', async () => {
    (webSearchService.getRemainingSearches as jest.Mock).mockReturnValue(7);
    const result = await controller.webSearchRemaining({ sessionId: 'test-session' });

    expect(result.remaining).toBe(7);
    expect(result.sessionId).toBe('test-session');
  });
});
