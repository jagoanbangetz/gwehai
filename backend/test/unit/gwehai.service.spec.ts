import { HttpException } from '@nestjs/common';
import { GwehAIService } from '../../src/gwehai/gwehai.service';
import { getPlanDefinition } from '../../src/config/plans.config';
import type { PlanId } from '../../src/config/plans.config';

const userId = 'user-1';

function createMocks() {
  const chatService = {
    setConversationRunStatus: jest.fn().mockResolvedValue(undefined),
    processMessageSimple: jest.fn().mockResolvedValue(undefined),
    processMessageWithTools: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves so worker slot stays
  };

  const planResolution = {
    getUserPlan: jest.fn().mockResolvedValue('FREE' as PlanId),
    getPlanDefinition: jest.fn().mockImplementation((id: PlanId) => getPlanDefinition(id)),
  };

  let workerCount = 0;
  const planUsage = {
    getSessionsStartedToday: jest.fn().mockResolvedValue(0),
    recordSessionStart: jest.fn().mockResolvedValue(undefined),
    getUsage: jest.fn().mockResolvedValue({ sessions_today: 0, steps_this_session: 0 }),
    getActiveWorkerCount: jest.fn().mockImplementation(() => workerCount),
    reserveWorkerSlot: jest.fn().mockImplementation(() => {
      workerCount += 1;
      return { jobId: 'mock-slot', release: () => { workerCount -= 1; } };
    }),
  };

  const policyOverrides = {
    getOverrides: jest.fn().mockResolvedValue({
      maxParallelJobsPerPlan: 2,
      maxSubAgentsPerPlan: 1,
      maxToolCallsPerJob: 500,
      maxStepsPerConversation: 100,
    }),
  };

  const jobsEvents = {
    emitJobListUpdate: jest.fn(),
  };

  const pentestJobs = {
    ensureJobForConversation: jest.fn().mockResolvedValue(null),
    updateJobStatusByConversationId: jest.fn().mockResolvedValue(null),
  };

  const chatEvents = {
    emit: jest.fn(),
    onEvents: jest.fn().mockReturnValue({ subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }) }),
  };

  const makeService = () =>
    new GwehAIService(
      chatService as any,
      planResolution as any,
      planUsage as any,
      policyOverrides as any,
      jobsEvents as any,
      pentestJobs as any,
      chatEvents as any,
    );

  return { chatService, planResolution, planUsage, policyOverrides, jobsEvents, pentestJobs, chatEvents, makeService };
}

describe('GwehAIService plan validation', () => {
  const mocks = createMocks();
  let service: GwehAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks.planUsage.getSessionsStartedToday.mockResolvedValue(0);
    mocks.planResolution.getUserPlan.mockResolvedValue('FREE' as PlanId);
    mocks.policyOverrides.getOverrides.mockResolvedValue({
      maxParallelJobsPerPlan: 2,
      maxSubAgentsPerPlan: 1,
      maxToolCallsPerJob: 500,
      maxStepsPerConversation: 100,
    });
    service = mocks.makeService();
  });

  it('throws when FREE user has 1 concurrent scan and starts another', async () => {
    const payload = { messages: [{ role: 'user', content: 'https://example.com' }] };
    const first = service.startChat(userId, payload);
    await expect(first).resolves.toMatchObject({ job_id: expect.any(String) });

    const second = service.startChat(userId, payload);
    await expect(second).rejects.toThrow(HttpException);
    await expect(second).rejects.toThrow(/maximum 1 concurrent scan/);
  });

  it('throws when FREE user has already started 3 sessions today', async () => {
    mocks.planUsage.getSessionsStartedToday.mockResolvedValue(3);
    mocks.planUsage.getActiveWorkerCount.mockReturnValue(0);
    const payload = { messages: [{ role: 'user', content: 'https://example.com' }] };
    await expect(service.startChat(userId, payload)).rejects.toThrow(HttpException);
    await expect(service.startChat(userId, payload)).rejects.toThrow(/maximum 3 sessions per day/);
  });

  it('allows PRO user to start a scan when under worker limit', async () => {
    mocks.planResolution.getUserPlan.mockResolvedValue('PRO' as PlanId);
    mocks.planUsage.getSessionsStartedToday.mockResolvedValue(0);
    const payload = { messages: [{ role: 'user', content: 'https://example.com' }] };
    const result = await service.startChat(userId, payload);
    expect(result).toMatchObject({ job_id: expect.any(String), limits_summary: { workers: '5' } });
  });
});

describe('GwehAIService model routing via model_key', () => {
  const mocks = createMocks();
  let service: GwehAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks.planUsage.getSessionsStartedToday.mockResolvedValue(0);
    mocks.planResolution.getUserPlan.mockResolvedValue('PRO' as PlanId);
    mocks.policyOverrides.getOverrides.mockResolvedValue({
      maxParallelJobsPerPlan: 2,
      maxSubAgentsPerPlan: 1,
      maxToolCallsPerJob: 500,
      maxStepsPerConversation: 100,
    });

    // For routing tests we want processMessageWithTools to resolve quickly and capture options.
    (mocks.chatService.processMessageWithTools as jest.Mock).mockImplementation(
      async (
        u: string,
        msg: string,
        cid: string | undefined,
        jobId: string,
        push: (ev: any) => void,
        agentInfo: any,
        memoryScope: string | undefined,
        options?: { model_key?: string },
      ) => {
        // Emit a minimal done event so background job completes.
        push({ type: 'done', data: { job_id: jobId, conversation_id: cid ?? '' } });
        return { conversationId: cid ?? 'conv-1', messageId: 'msg-1', response: 'ok', options };
      },
    );

    service = mocks.makeService();
  });

  it('passes explicit model_key through to ChatService (e.g. claude)', async () => {
    const payload = {
      messages: [{ role: 'user', content: 'pentest https://example.com' }],
      model_key: 'claude',
    };
    await service.startChat(userId, payload);

    // Allow background runAgentInBackground to execute.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.chatService.processMessageWithTools).toHaveBeenCalled();
    const call = (mocks.chatService.processMessageWithTools as jest.Mock).mock.calls[0];
    const options = call[7];
    expect(options).toBeDefined();
    expect(options.model_key).toBe('claude');
  });

  it('defaults invalid or missing model_key to auto', async () => {
    const payload = {
      messages: [{ role: 'user', content: 'pentest https://example.com' }],
      model_key: 'invalid-key',
    } as any;
    await service.startChat(userId, payload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.chatService.processMessageWithTools).toHaveBeenCalled();
    const call = (mocks.chatService.processMessageWithTools as jest.Mock).mock.calls[0];
    const options = call[7];
    expect(options).toBeDefined();
    expect(options.model_key).toBe('auto');
  });

  it('accepts any model_key when plan is FREE (all models allowed)', async () => {
    mocks.planResolution.getUserPlan.mockResolvedValue('FREE' as PlanId);
    const payload = {
      messages: [{ role: 'user', content: 'pentest https://example.com' }],
      model_key: 'openai_gpt5',
    } as any;
    await service.startChat(userId, payload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.chatService.processMessageWithTools).toHaveBeenCalled();
    const call = (mocks.chatService.processMessageWithTools as jest.Mock).mock.calls[0];
    const options = call[7];
    expect(options).toBeDefined();
    expect(options.model_key).toBe('openai_gpt5');
  });
});
