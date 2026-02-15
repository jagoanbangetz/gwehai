import { AdminController } from '../../src/admin/admin.controller';

describe('AdminController', () => {
  const repo = () => ({
    count: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  let controller: AdminController;
  const userRepo = repo();
  const modelRepo = repo();
  const orderRepo = repo();
  const reportRepo = repo();
  const usageRepo = repo();
  const messageRepo = repo();
  const messagePartRepo = repo();
  const messageFileRepo = repo();
  const conversationRepo = repo();
  const memoryRepo = repo();
  const hacktivityRepo = repo();

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AdminController(
      userRepo as any,
      modelRepo as any,
      orderRepo as any,
      reportRepo as any,
      usageRepo as any,
      messageRepo as any,
      messagePartRepo as any,
      messageFileRepo as any,
      conversationRepo as any,
      memoryRepo as any,
      hacktivityRepo as any,
    );
  });

  it('returns dashboard summary', async () => {
    userRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    modelRepo.count.mockResolvedValue(3);
    orderRepo.count.mockResolvedValue(4);
    reportRepo.count.mockResolvedValue(5);

    const result = await controller.getDashboardSummary();

    expect(result.users).toBe(10);
    expect(result.admins).toBe(2);
    expect(result.aiAgents).toBe(3);
  });

  it('lists users', async () => {
    userRepo.find.mockResolvedValue([{ id: 'u1' }]);
    const result = await controller.listUsers();

    expect(result).toHaveLength(1);
  });

  it('lists ai agents', async () => {
    modelRepo.find.mockResolvedValue([{ id: 'm1' }]);
    const result = await controller.listAiAgents();

    expect(result).toHaveLength(1);
  });

  it('lists admin users', async () => {
    userRepo.find.mockResolvedValue([{ id: 'u1' }]);
    const result = await controller.listAdminUsers();

    expect(result).toHaveLength(1);
  });

  it('lists payments', async () => {
    orderRepo.find.mockResolvedValue([{ id: 'o1' }]);
    const result = await controller.listPayments();

    expect(result).toHaveLength(1);
  });

  it('lists reports', async () => {
    reportRepo.find.mockResolvedValue([{ id: 'r1' }]);
    const result = await controller.listAllReports();

    expect(result).toHaveLength(1);
  });

  it('lists user activity', async () => {
    usageRepo.find.mockResolvedValue([{ id: 'u1' }]);
    const result = await controller.listUserActivity();

    expect(result).toHaveLength(1);
  });

  it('lists messages', async () => {
    messageRepo.find.mockResolvedValue([{ id: 'm1' }]);
    const result = await controller.listMessages();

    expect(result).toHaveLength(1);
  });

  it('returns ai behaviour stats', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ modelId: 'm1', calls: '2' }]),
    };
    usageRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await controller.getAiBehaviour();

    expect(result).toHaveLength(1);
  });

  it('returns settings', async () => {
    const result = await controller.getSettings({} as any);
    expect(result.environment).toBeDefined();
    expect(result.apiBaseUrl).toBeDefined();
  });
});
