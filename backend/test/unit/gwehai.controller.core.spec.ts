import { GwehAIController } from '../../src/gwehai/gwehai.controller';

describe('GwehAIController core endpoints', () => {
  const gwehaiService = {
    startChat: jest.fn(),
    createJob: jest.fn(),
    getJobStatus: jest.fn(),
    stopJob: jest.fn(),
    continueJob: jest.fn(),
    healthCheck: jest.fn(),
    getJob: jest.fn(),
  };

  let controller: GwehAIController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new GwehAIController(gwehaiService as any);
  });

  it('starts a chat', async () => {
    gwehaiService.startChat.mockResolvedValue({ stream_id: 's1' });
    const result = await controller.startChat({ user: { id: 'u1' } } as any, { messages: [] });

    expect(result.stream_id).toBe('s1');
    expect(gwehaiService.startChat).toHaveBeenCalledWith('u1', { messages: [] });
  });

  it('creates job via completions', async () => {
    gwehaiService.createJob.mockResolvedValue({ job_id: 'j1' });
    const result = await controller.createJob(
      { user: { id: 'u1' } } as any,
      { messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(result.job_id).toBe('j1');
  });

  it('gets job status', async () => {
    gwehaiService.getJobStatus.mockResolvedValue({ status: 'ready' });
    const result = await controller.getJobStatus('j1', { user: { id: 'u1' } } as any);

    expect(result.status).toBe('ready');
  });

  it('returns SSE url', async () => {
    const result = await controller.getSSEUrl('j1', { user: { id: 'u1' } } as any);

    expect(result.url).toContain('stream_id=j1');
  });

  it('stops a job', async () => {
    gwehaiService.stopJob.mockResolvedValue({ status: 'stopped' });
    const result = await controller.stopJob('j1', { user: { id: 'u1' } } as any);

    expect(result.status).toBe('stopped');
  });

  it('continues a job', async () => {
    gwehaiService.continueJob.mockResolvedValue({ status: 'ready' });
    const result = await controller.continueJob('j1', { user: { id: 'u1' } } as any);

    expect(result.status).toBe('ready');
  });

  it('health check', async () => {
    gwehaiService.healthCheck.mockResolvedValue(true);
    const result = await controller.healthCheck();

    expect(result.status).toBe('ok');
  });
});
