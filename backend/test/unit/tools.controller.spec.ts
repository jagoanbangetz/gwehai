import { ToolsController } from '../../src/tools/tools.controller';
import { ToolsService } from '../../src/tools/tools.service';

describe('ToolsController', () => {
  const toolsService = {
    memorySearch: jest.fn(),
    memoryGet: jest.fn(),
    writeFile: jest.fn(),
    execCommand: jest.fn(),
  } as unknown as ToolsService;

  let controller: ToolsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ToolsController(toolsService);
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
});
