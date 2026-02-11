import { PlansController } from '../../src/plans/plans.controller';
import { PlansService } from '../../src/plans/plans.service';

describe('PlansController', () => {
  const plansService = {
    getAvailablePlans: jest.fn(),
    getCurrentPlanForUser: jest.fn(),
    getUsageForUser: jest.fn(),
  } as unknown as PlansService;

  let controller: PlansController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new PlansController(plansService);
  });

  it('returns available plans', async () => {
    plansService.getAvailablePlans = jest.fn().mockResolvedValue([{ id: 'plan1' }]);
    const result = await controller.getAvailablePlans();

    expect(result).toHaveLength(1);
  });

  it('returns current plan', async () => {
    plansService.getCurrentPlanForUser = jest.fn().mockResolvedValue({ id: 'plan1' });
    const result = await controller.getCurrentPlan({ user: { id: 'u1' } } as any);

    expect(result.id).toBe('plan1');
  });

  it('returns usage with default days', async () => {
    plansService.getUsageForUser = jest.fn().mockResolvedValue([{ id: 'u1' }]);
    const result = await controller.getUsage({ user: { id: 'u1' } } as any);

    expect(plansService.getUsageForUser).toHaveBeenCalledWith('u1', 30);
    expect(result).toHaveLength(1);
  });
});
