import { AdminOpsController } from '../../src/admin/admin-ops.controller';
import { HttpStatus } from '@nestjs/common';

describe('AdminOpsController', () => {
  const gwehaiService = {
    getActiveJobsForAdmin: jest.fn().mockReturnValue([]),
    stopJob: jest.fn(),
  } as any;
  const planUsageService = {} as any;
  const adminService = {
    log: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
  } as any;

  let controller: AdminOpsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminOpsController(gwehaiService, planUsageService, adminService);
  });

  describe('getJobsLive', () => {
    it('returns job list with meta', async () => {
      const now = Date.now();
      gwehaiService.getActiveJobsForAdmin.mockReturnValue([
        { job_id: 'j1', userId: 'u1', conversationId: 'c1', status: 'running', createdAt: now, userMessage: 'pentest https://example.com' },
      ]);

      const result = await controller.getJobsLive();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].job_id).toBe('j1');
      expect(result.items[0].target).toContain('example.com');
      expect(result.items[0].phase).toBe('—');
      expect(result.items[0].durationSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('postJobsAction', () => {
    it('returns 400 when jobId or action missing', async () => {
      const req = { user: { id: 'admin-1' } } as any;
      await expect(controller.postJobsAction({ jobId: '', action: 'cancel' }, req)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      await expect(controller.postJobsAction({ jobId: 'j1', action: 'invalid' as any }, req)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('calls stopJob and logs', async () => {
      gwehaiService.stopJob.mockResolvedValue(undefined);
      const req = { user: { id: 'admin-1' }, headers: {}, socket: {} } as any;

      const result = await controller.postJobsAction({ jobId: 'j1', action: 'cancel' }, req);

      expect(result.ok).toBe(true);
      expect(result.action).toBe('cancel');
      expect(result.stopped).toBe(true);
      expect(gwehaiService.stopJob).toHaveBeenCalledWith('j1');
      expect(adminService.log).toHaveBeenCalledWith('admin-1', 'ops_job_cancel', expect.any(Object));
    });
  });

  describe('getWorkersStatus', () => {
    it('returns worker counts from active jobs', async () => {
      gwehaiService.getActiveJobsForAdmin.mockReturnValue([
        { status: 'running' },
        { status: 'running' },
        { status: 'completed' },
      ]);

      const result = await controller.getWorkersStatus();

      expect(result.activeWorkers).toBe(2);
      expect(result.maxWorkers).toBe(10);
      expect(result.queueSize).toBe(0);
      expect(result.stuckJobs).toBe(0);
    });
  });

  describe('postWorkersRestart', () => {
    it('logs and returns ok', async () => {
      const req = { user: { id: 'admin-1' }, headers: {}, socket: {} } as any;

      const result = await controller.postWorkersRestart(req);

      expect(result.ok).toBe(true);
      expect(adminService.log).toHaveBeenCalledWith('admin-1', 'ops_workers_restart', expect.any(Object));
    });
  });
});
