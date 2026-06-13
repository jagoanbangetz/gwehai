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
  const cveFeedService = {
    getStatus: jest.fn().mockReturnValue({ entries: 100, lastUpdated: '2026-06-10T00:00:00Z', isStale: false }),
    forceRefresh: jest.fn().mockResolvedValue({ entries: 150, updated: '2026-06-10T06:00:00Z' }),
    search: jest.fn().mockReturnValue([]),
  } as any;

  let controller: AdminOpsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminOpsController(gwehaiService, planUsageService, adminService, cveFeedService);
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

  describe('getCveFeedStatus', () => {
    it('returns CVE feed status', async () => {
      const result = await controller.getCveFeedStatus();
      expect(result.entries).toBe(100);
      expect(result.isStale).toBe(false);
      expect(cveFeedService.getStatus).toHaveBeenCalled();
    });
  });

  describe('postCveFeedRefresh', () => {
    it('forces refresh and logs', async () => {
      const req = { user: { id: 'admin-1' }, headers: {}, socket: {} } as any;
      const result = await controller.postCveFeedRefresh(req);
      expect(result.ok).toBe(true);
      expect(result.entries).toBe(150);
      expect(cveFeedService.forceRefresh).toHaveBeenCalled();
      expect(adminService.log).toHaveBeenCalledWith('admin-1', 'ops_cve_feed_refresh', expect.any(Object));
    });
  });

  describe('searchCveFeed', () => {
    it('returns 400 when q parameter missing', async () => {
      await expect(controller.searchCveFeed('')).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns search results', async () => {
      cveFeedService.search.mockReturnValue([{ id: 'CVE-2026-1234', description: 'test' }]);
      const result = await controller.searchCveFeed('wordpress', '10');
      expect(result.query).toBe('wordpress');
      expect(result.count).toBe(1);
      expect(cveFeedService.search).toHaveBeenCalledWith('wordpress', 10);
    });
  });
});
