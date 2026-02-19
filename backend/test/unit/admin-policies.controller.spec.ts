import { AdminPoliciesController } from '../../src/admin/admin-policies.controller';

describe('AdminPoliciesController', () => {
  const settingsRepo = {
    find: jest.fn(),
    upsert: jest.fn().mockResolvedValue(undefined),
  } as any;
  const adminService = {
    log: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
  } as any;

  let controller: AdminPoliciesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminPoliciesController(settingsRepo, adminService);
  });

  describe('getPolicies', () => {
    it('returns default policies when no settings', async () => {
      settingsRepo.find.mockResolvedValue([]);

      const result = await controller.getPolicies();

      expect(result.blockLocalhost).toBe(false);
      expect(result.blockRfc1918Ip).toBe(false);
      expect(result.maxParallelJobsPerPlan).toBe(2);
      expect(result.maxSubAgentsPerPlan).toBe(1);
      expect(result.maxToolCallsPerJob).toBe(500);
      expect(result.maxStepsPerConversation).toBe(100);
    });

    it('returns stored policy values', async () => {
      settingsRepo.find.mockResolvedValue([
        { key: 'blockLocalhost', value: 'true' },
        { key: 'maxParallelJobsPerPlan', value: '5' },
      ]);

      const result = await controller.getPolicies();

      expect(result.blockLocalhost).toBe(true);
      expect(result.maxParallelJobsPerPlan).toBe(5);
    });
  });

  describe('updatePolicies', () => {
    it('upserts settings and logs', async () => {
      const req = { user: { id: 'admin-1' }, headers: {}, socket: {} } as any;
      const body = {
        blockLocalhost: true,
        maxStepsPerConversation: 200,
      };

      const result = await controller.updatePolicies(body, req);

      expect(result.ok).toBe(true);
      expect(settingsRepo.upsert).toHaveBeenCalled();
      expect(adminService.log).toHaveBeenCalledWith('admin-1', 'policies_update', expect.any(Object));
    });
  });
});
