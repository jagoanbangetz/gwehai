import { AdminMarginController } from '../../src/admin/admin-margin.controller';

describe('AdminMarginController', () => {
  const usageRepo = {
    createQueryBuilder: jest.fn(),
  } as any;
  const userRepo = { count: jest.fn(), find: jest.fn() } as any;
  const orderRepo = {
    createQueryBuilder: jest.fn(),
  } as any;

  const chainRawOne = (value: any) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(value),
  });
  const chainRawMany = (value: any[]) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(value),
  });

  let controller: AdminMarginController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminMarginController(usageRepo, userRepo, orderRepo);
  });

  describe('getSummary', () => {
    it('returns margin summary', async () => {
      orderRepo.createQueryBuilder.mockReturnValue(chainRawOne({ total: '10000' }));
      usageRepo.createQueryBuilder.mockReturnValue(chainRawOne({ points: '50000' }));
      userRepo.count.mockResolvedValue(10);

      const result = await controller.getSummary();

      expect(result.totalRevenue).toBe('100.00');
      expect(result.totalAiCost).toBeDefined();
      expect(result.grossMarginPct).toBeDefined();
      expect(result.avgCostPerUser).toBeDefined();
    });

    it('handles zero revenue', async () => {
      orderRepo.createQueryBuilder.mockReturnValue(chainRawOne({ total: '0' }));
      usageRepo.createQueryBuilder.mockReturnValue(chainRawOne({ points: '0' }));
      userRepo.count.mockResolvedValue(0);

      const result = await controller.getSummary();

      expect(result.totalRevenue).toBe('0.00');
      expect(result.grossMarginPct).toBe('0.0');
    });
  });

  describe('getUsers', () => {
    it('returns user margin list', async () => {
      orderRepo.createQueryBuilder.mockReturnValue(chainRawMany([{ userId: 'u1', revenueCents: '2000' }]));
      usageRepo.createQueryBuilder.mockReturnValue(chainRawMany([{ userId: 'u1', costPoints: '1000' }]));
      userRepo.find.mockResolvedValue([{ id: 'u1', email: 'u@test.com', planId: 'FREE', createdAt: new Date() }]);

      const result = await controller.getUsers('25', '0');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].user).toBe('u@test.com');
      expect(result.items[0].revenue).toBe('20.00');
      expect(result.total).toBe(1);
    });
  });
});
