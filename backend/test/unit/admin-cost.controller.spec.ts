import { AdminCostController } from '../../src/admin/admin-cost.controller';

describe('AdminCostController', () => {
  const chain = (getRawOne: any, getRawMany?: any, getCount?: any) => {
    const c: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(getRawOne),
      getRawMany: jest.fn().mockResolvedValue(getRawMany ?? []),
      getCount: jest.fn().mockResolvedValue(getCount ?? 0),
    };
    return c;
  };

  const usageRepo = {
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  } as any;
  const userRepo = { find: jest.fn() } as any;
  const settingsRepo = {
    find: jest.fn(),
    upsert: jest.fn().mockResolvedValue(undefined),
  } as any;
  const adminService = {
    log: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
  } as any;

  let controller: AdminCostController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminCostController(usageRepo, userRepo, settingsRepo, adminService);
  });

  describe('getSummary', () => {
    it('returns cost summary with tokens and estimated cost', async () => {
      usageRepo.createQueryBuilder
        .mockReturnValueOnce(chain({ input: '100', output: '50', points: '10' }))
        .mockReturnValueOnce(chain({ input: '1000', output: '500', points: '100' }));
      usageRepo.count.mockResolvedValue(42);

      const result = await controller.getSummary();

      expect(result.totalTokensToday).toBe(150);
      expect(result.totalTokensThisMonth).toBe(1500);
      expect(result.totalAICalls).toBe(42);
      expect(result.estimatedCostUsd).toBeDefined();
      expect(typeof result.estimatedCostUsd).toBe('string');
    });
  });

  describe('getSettings', () => {
    it('returns cost settings from repo', async () => {
      settingsRepo.find.mockResolvedValue([
        { key: 'globalDailyTokenCap', value: '1000000' },
        { key: 'modelEscalationToggle', value: 'true' },
      ]);

      const result = await controller.getSettings();

      expect(result.globalDailyTokenCap).toBe(1000000);
      expect(result.modelEscalationToggle).toBe(true);
    });
  });

  describe('saveSettings', () => {
    it('upserts settings and logs audit', async () => {
      const req = { user: { id: 'admin-1' }, headers: {}, socket: {} } as any;
      const body = {
        globalDailyTokenCap: 500000,
        modelEscalationToggle: true,
      };

      const result = await controller.saveSettings(body, req);

      expect(result.ok).toBe(true);
      expect(settingsRepo.upsert).toHaveBeenCalled();
      expect(adminService.log).toHaveBeenCalledWith('admin-1', 'cost_settings_update', expect.any(Object));
    });
  });
});
