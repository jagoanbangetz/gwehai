import { AdminService } from '../../src/admin/admin.service';

describe('AdminService', () => {
  let service: AdminService;
  const auditRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AdminService(auditRepo as any);
  });

  describe('log', () => {
    it('creates and saves an audit log entry', async () => {
      const created = { id: 'log-1', adminUserId: 'admin-1', action: 'export', resource: 'users', details: null, ipAddress: null };
      auditRepo.create.mockReturnValue(created);
      auditRepo.save.mockResolvedValue(created);

      await service.log('admin-1', 'export', { resource: 'users' });

      expect(auditRepo.create).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        action: 'export',
        resource: 'users',
        details: null,
        ipAddress: null,
      });
      expect(auditRepo.save).toHaveBeenCalledWith(created);
    });

    it('passes details and ipAddress when provided', async () => {
      auditRepo.create.mockReturnValue({});
      auditRepo.save.mockResolvedValue(undefined);

      await service.log('admin-2', 'wipe_chat_and_reports', {
        resource: 'chat,reports',
        details: '{"deleted":5}',
        ipAddress: '127.0.0.1',
      });

      expect(auditRepo.create).toHaveBeenCalledWith({
        adminUserId: 'admin-2',
        action: 'wipe_chat_and_reports',
        resource: 'chat,reports',
        details: '{"deleted":5}',
        ipAddress: '127.0.0.1',
      });
    });
  });

  describe('getClientIp', () => {
    it('returns first value from x-forwarded-for', () => {
      const req = { headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } };
      expect(service.getClientIp(req)).toBe('10.0.0.1');
    });

    it('handles x-forwarded-for as array', () => {
      const req = { headers: { 'x-forwarded-for': ['192.168.1.1', '10.0.0.1'] } };
      expect(service.getClientIp(req)).toBe('192.168.1.1');
    });

    it('falls back to socket.remoteAddress when no x-forwarded-for', () => {
      const req = { headers: {}, socket: { remoteAddress: '::1' } };
      expect(service.getClientIp(req)).toBe('::1');
    });

    it('returns null when no headers or socket', () => {
      expect(service.getClientIp({})).toBeNull();
    });
  });

  describe('getAuditLogs', () => {
    it('returns items and total from query builder', async () => {
      const items = [{ id: '1', action: 'export', adminUserId: 'a1' }];
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([items, 1]),
      };
      auditRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getAuditLogs({ limit: 50, offset: 0 });

      expect(result).toEqual({ items, total: 1 });
      expect(qb.orderBy).toHaveBeenCalledWith('a.createdAt', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(50);
    });

    it('applies action and adminUserId filters when provided', async () => {
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      auditRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAuditLogs({ limit: 10, offset: 0, action: 'export', adminUserId: 'admin-1' });

      expect(qb.andWhere).toHaveBeenCalledWith('a.action = :action', { action: 'export' });
      expect(qb.andWhere).toHaveBeenCalledWith('a.adminUserId = :adminUserId', { adminUserId: 'admin-1' });
    });

    it('clamps limit to max 200', async () => {
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      auditRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAuditLogs({ limit: 500, offset: 0 });

      expect(qb.take).toHaveBeenCalledWith(200);
    });
  });
});
