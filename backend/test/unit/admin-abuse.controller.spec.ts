import { AdminAbuseController } from '../../src/admin/admin-abuse.controller';
import { HttpStatus } from '@nestjs/common';

describe('AdminAbuseController', () => {
  const abuseRepo = {
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
    findAndCount: jest.fn(),
  } as any;
  const userRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() } as any;
  const adminService = {
    log: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
  } as any;

  let controller: AdminAbuseController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminAbuseController(abuseRepo, userRepo, adminService);
  });

  describe('getSummary', () => {
    it('returns abuse summary counts', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ c: '2' }),
      };
      abuseRepo.createQueryBuilder.mockReturnValue(qb);
      abuseRepo.count.mockResolvedValue(5);

      const result = await controller.getSummary();

      expect(result.suspiciousUsersToday).toBe(2);
      expect(result.rateLimitViolations).toBe(5);
      expect(result.repeatedTargetAttempts).toBe(5);
      expect(result.highVelocityRequests).toBe(5);
    });
  });

  describe('getEvents', () => {
    it('returns paginated abuse events with user emails', async () => {
      const events = [
        { id: 'e1', userId: 'u1', ipAddress: '1.2.3.4', eventType: 'high_velocity', requestsPerMin: 100, domainsTargeted: 2, riskScore: 75, createdAt: new Date() },
      ];
      abuseRepo.findAndCount.mockResolvedValue([events, 1]);
      userRepo.find.mockResolvedValue([{ id: 'u1', email: 'u@test.com' }]);

      const result = await controller.getEvents('10', '0');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].user).toBe('u@test.com');
      expect(result.items[0].riskScore).toBe(75);
      expect(result.total).toBe(1);
    });
  });

  describe('postAction', () => {
    it('throws when userId or action missing', async () => {
      const req = { user: { id: 'admin-1' } } as any;
      await expect(controller.postAction({ userId: '', action: 'ban' }, req)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      await expect(controller.postAction({ userId: 'u1', action: 'invalid' as any }, req)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('throws when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const req = { user: { id: 'admin-1' } } as any;
      await expect(controller.postAction({ userId: 'u-missing', action: 'ban' }, req)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('deactivates user and logs on ban', async () => {
      const user = { id: 'u1', email: 'u@test.com', isActive: true };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);
      const req = { user: { id: 'admin-1' }, headers: {}, socket: {} } as any;

      const result = await controller.postAction({ userId: 'u1', action: 'ban', reason: 'abuse' }, req);

      expect(result.ok).toBe(true);
      expect(result.action).toBe('ban');
      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      expect(adminService.log).toHaveBeenCalledWith('admin-1', 'abuse_ban', expect.any(Object));
    });
  });
});
