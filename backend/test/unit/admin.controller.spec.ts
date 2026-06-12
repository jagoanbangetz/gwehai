import { AdminController } from '../../src/admin/admin.controller';

describe('AdminController', () => {
  const repo = () => ({
    count: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  });

  const chain = (fn: string, resolved: any) => {
    const c: any = {};
    ['orderBy', 'take', 'skip', 'addSelect', 'select', 'groupBy', 'andWhere', 'leftJoinAndSelect', 'getMany', 'getManyAndCount', 'getRawMany', 'getRawOne'].forEach((m) => {
      c[m] = jest.fn().mockReturnValue(m === fn ? Promise.resolve(resolved) : c);
    });
    return c;
  };

  let controller: AdminController;
  const userRepo = repo() as any;
  const modelRepo = repo() as any;
  const orderRepo = repo() as any;
  const reportRepo = repo() as any;
  const usageRepo = repo() as any;
  const messageRepo = repo() as any;
  const messagePartRepo = repo() as any;
  const messageFileRepo = repo() as any;
  const conversationRepo = repo() as any;
  const memoryRepo = repo() as any;
  const hacktivityRepo = repo() as any;
  const adminService = {
    log: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
    getAuditLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const gwehaiService = {
    getActiveJobsForAdmin: jest.fn().mockReturnValue([]),
  };
  const hacktivityService = {
    getAdminStream: jest.fn().mockReturnValue({ subscribe: jest.fn() }),
  };
  const settingsRepo = repo() as any;
  const abuseRepo = repo() as any;
  const planUsageService = {} as any;
  const mailService = { isConfigured: jest.fn().mockReturnValue(false), sendPromotionEmail: jest.fn().mockResolvedValue(true) } as any;
  const pentestJobsService = { listRecentForAdmin: jest.fn().mockResolvedValue([]) } as any;
  const dbBackupService = { createBackup: jest.fn(), listBackups: jest.fn().mockReturnValue([]), generateRestoreToken: jest.fn(), restoreBackup: jest.fn() } as any;
  const adminSettingsService = { getApiKey: jest.fn(), invalidate: jest.fn(), invalidateAll: jest.fn() } as any;
  const objectStorageService = { upload: jest.fn().mockResolvedValue({ url: 'https://example.com/test.png', key: 'branding/logo/test.png' }), delete: jest.fn() } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AdminController(
      userRepo,
      modelRepo,
      orderRepo,
      reportRepo,
      usageRepo,
      messageRepo,
      messagePartRepo,
      messageFileRepo,
      conversationRepo,
      memoryRepo,
      hacktivityRepo,
      settingsRepo,
      abuseRepo,
      adminService as any,
      adminSettingsService,
      objectStorageService,
      gwehaiService as any,
      hacktivityService as any,
      planUsageService,
      mailService,
      pentestJobsService,
      dbBackupService,
    );
  });

  it('returns dashboard summary', async () => {
    userRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    modelRepo.count.mockResolvedValue(3);
    orderRepo.count.mockResolvedValue(4);
    reportRepo.count.mockResolvedValue(5);
    conversationRepo.count.mockResolvedValue(6);
    hacktivityRepo.count.mockResolvedValue(7);
    gwehaiService.getActiveJobsForAdmin.mockReturnValue([{ job_id: 'j1', status: 'running' }]);
    usageRepo.find.mockResolvedValue([]);

    const result = await controller.getDashboardSummary();

    expect(result.users).toBe(10);
    expect(result.admins).toBe(2);
    expect(result.aiAgents).toBe(3);
    expect(result.payments).toBe(4);
    expect(result.reports).toBe(5);
    expect(result.conversations).toBe(6);
    expect(result.hacktivityTotal).toBe(7);
    expect(result.activeJobsCount).toBe(1);
    expect(result.activeJobs).toHaveLength(1);
    expect(result.recentActivity).toEqual([]);
  });

  it('lists users', async () => {
    const qb = chain('getMany', [{ id: 'u1', email: 'a@b.com' }]);
    userRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await controller.listUsers();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
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
    reportRepo.findAndCount.mockResolvedValue([[{ id: 'r1' }], 1]);
    const result = await controller.listAllReports();

    expect(result).toEqual({ items: [{ id: 'r1' }], total: 1 });
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

  it('returns settings in { settings, groups } format', async () => {
    settingsRepo.find.mockResolvedValue([
      { key: 'OPENAI_API_KEY', value: 'sk-test', updatedAt: new Date() },
    ]);
    const result = await controller.getSettings({} as any);
    expect(result.settings).toBeDefined();
    expect(result.groups).toBeDefined();
    expect(result.settings.OPENAI_API_KEY).toBeDefined();
    expect(result.settings.OPENAI_API_KEY.source).toBe('db');
    expect(result.settings.OPENAI_API_KEY.value).toBe('sk-test');
    expect(result.groups.ai).toBeDefined();
    expect(result.groups.ai.fields).toContain('OPENAI_API_KEY');
  });

  it('returns health', async () => {
    userRepo.query.mockResolvedValue([{ '?column?': 1 }]);
    const result = await controller.getHealth();
    expect(result.ok).toBe(true);
    expect(result.database).toBe('connected');
  });

  it('returns audit logs', async () => {
    adminService.getAuditLogs.mockResolvedValue({ items: [{ id: 'a1', action: 'export' }], total: 1 });
    const result = await controller.getAuditLog();
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns usage summary', async () => {
    const chain = () => ({
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    });
    const qbUser = chain();
    (qbUser.getRawMany as jest.Mock).mockResolvedValue([
      { userId: 'u1', userEmail: 'u@e.com', planId: 'FREE', inputTokens: '100', outputTokens: '50', costPoints: '0', calls: '2' },
    ]);
    const qbTotal = chain();
    (qbTotal.getRawOne as jest.Mock).mockResolvedValue({ inputTokens: '500', outputTokens: '200', costPoints: '0', calls: '10' });
    const qbByModel = chain();
    (qbByModel.getRawMany as jest.Mock).mockResolvedValue([]);
    const qbToday = chain();
    (qbToday.getRawMany as jest.Mock).mockResolvedValue([]);
    usageRepo.createQueryBuilder
      .mockReturnValueOnce(qbUser)
      .mockReturnValueOnce(qbTotal)
      .mockReturnValueOnce(qbByModel)
      .mockReturnValueOnce(qbToday);

    const result = await controller.getUsageSummary();
    expect(result.byUser).toHaveLength(1);
    expect(result.total).toMatchObject({ inputTokens: '500', outputTokens: '200', calls: '10' });
  });
});
