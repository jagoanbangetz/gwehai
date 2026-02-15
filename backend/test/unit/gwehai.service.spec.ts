import { HttpException } from '@nestjs/common';
import { GwehAIService } from '../../src/gwehai/gwehai.service';
import { getPlanDefinition } from '../../src/config/plans.config';
import type { PlanId } from '../../src/config/plans.config';

describe('GwehAIService plan validation', () => {
  const userId = 'user-1';

  const chatService = {
    setConversationRunStatus: jest.fn().mockResolvedValue(undefined),
    processMessageSimple: jest.fn().mockResolvedValue(undefined),
    processMessageWithTools: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves so worker slot stays
  };

  const planResolution = {
    getUserPlan: jest.fn().mockResolvedValue('FREE' as PlanId),
    getPlanDefinition: jest.fn().mockImplementation((id: PlanId) => getPlanDefinition(id)),
  };

  const planUsage = {
    getSessionsStartedToday: jest.fn().mockResolvedValue(0),
    recordSessionStart: jest.fn().mockResolvedValue(undefined),
    getUsage: jest.fn().mockResolvedValue({ sessions_today: 0, steps_this_session: 0 }),
  };

  let service: GwehAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    planUsage.getSessionsStartedToday.mockResolvedValue(0);
    service = new GwehAIService(
      chatService as any,
      planResolution as any,
      planUsage as any,
    );
  });

  it('throws when FREE user has 1 concurrent scan and starts another', async () => {
    const payload = { messages: [{ role: 'user', content: 'https://example.com' }] };
    const first = service.startChat(userId, payload);
    await expect(first).resolves.toMatchObject({ job_id: expect.any(String) });

    const second = service.startChat(userId, payload);
    await expect(second).rejects.toThrow(HttpException);
    await expect(second).rejects.toThrow(/maximum 1 concurrent scan/);
  });

  it('throws when FREE user has already started 5 sessions today', async () => {
    planUsage.getSessionsStartedToday.mockResolvedValue(5);
    const payload = { messages: [{ role: 'user', content: 'https://example.com' }] };
    await expect(service.startChat(userId, payload)).rejects.toThrow(HttpException);
    await expect(service.startChat(userId, payload)).rejects.toThrow(/maximum 5 sessions per day/);
  });

  it('allows PRO user to start a scan when under worker limit', async () => {
    planResolution.getUserPlan.mockResolvedValue('PRO' as PlanId);
    planUsage.getSessionsStartedToday.mockResolvedValue(0);
    const payload = { messages: [{ role: 'user', content: 'https://example.com' }] };
    const result = await service.startChat(userId, payload);
    expect(result).toMatchObject({ job_id: expect.any(String), limits_summary: { workers: '3' } });
  });
});
