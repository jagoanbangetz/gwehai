import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service';
import { SubscriptionStatus, SubscriptionPlan } from '../../src/entities/subscription.entity';

const mockSubscriptionRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};
const mockUserRepo = {
  update: jest.fn(),
};
const mockPointsService = {};
const mockPaypalService = {};
const mockBillingSettings = { getPaypalConfig: jest.fn().mockResolvedValue(null), isPaypalConfigured: jest.fn().mockResolvedValue(false) };
const mockMailService = {
  isConfigured: jest.fn().mockReturnValue(false),
  sendSubscriptionSuccess: jest.fn().mockResolvedValue(true),
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockMailService as any).isConfigured.mockReturnValue(false);
    service = new SubscriptionsService(
      mockSubscriptionRepo as any,
      mockUserRepo as any,
      mockPointsService as any,
      mockPaypalService as any,
      mockBillingSettings as any,
      mockMailService as any,
    );
  });

  describe('completeSubscription', () => {
    const paypalId = 'I-XXX123';
    const userId = 'user-uuid';

    it('returns false when subscription not found', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(null);
      const result = await service.completeSubscription(paypalId, userId);
      expect(result).toBe(false);
      expect(mockSubscriptionRepo.findOne).toHaveBeenCalledWith({
        where: { providerSubscriptionId: paypalId, userId },
      });
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('returns false when subscription is already active', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue({
        id: 'sub-uuid',
        userId,
        providerSubscriptionId: paypalId,
        status: SubscriptionStatus.ACTIVE,
        planId: 'PRO',
      });
      const result = await service.completeSubscription(paypalId, userId);
      expect(result).toBe(false);
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('calls activateFromPayPal and returns true when subscription is APPROVAL_PENDING', async () => {
      const sub = {
        id: 'sub-uuid',
        userId,
        providerSubscriptionId: paypalId,
        status: SubscriptionStatus.APPROVAL_PENDING,
        planId: 'PRO',
        plan: SubscriptionPlan.PRO,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      };
      mockSubscriptionRepo.findOne
        .mockResolvedValueOnce(sub)
        .mockResolvedValueOnce(sub);
      mockSubscriptionRepo.save.mockResolvedValue(sub);
      mockUserRepo.update.mockResolvedValue(undefined);

      const result = await service.completeSubscription(paypalId, userId);
      expect(result).toBe(true);
      expect(mockUserRepo.update).toHaveBeenCalledWith(userId, { planId: 'PRO' });
      expect(mockSubscriptionRepo.save).toHaveBeenCalled();
    });
  });

  describe('activateFromPayPal', () => {
    const paypalId = 'I-XXX456';
    const userId = 'user-uuid';

    it('updates user planId and subscription status when subscription found', async () => {
      const sub = {
        id: 'sub-uuid',
        userId,
        providerSubscriptionId: paypalId,
        status: SubscriptionStatus.APPROVAL_PENDING,
        planId: 'PRO_PLUS',
        plan: SubscriptionPlan.PRO_PLUS,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      };
      mockSubscriptionRepo.findOne.mockResolvedValue(sub);
      mockSubscriptionRepo.save.mockResolvedValue(sub);
      mockUserRepo.update.mockResolvedValue(undefined);

      await service.activateFromPayPal(paypalId);

      expect(mockSubscriptionRepo.findOne).toHaveBeenCalledWith({
        where: { providerSubscriptionId: paypalId },
      });
      expect(mockUserRepo.update).toHaveBeenCalledWith(userId, { planId: 'PRO_PLUS' });
      expect(mockSubscriptionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
        }),
      );
    });

    it('does nothing when subscription not found', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(null);
      await service.activateFromPayPal(paypalId);
      expect(mockUserRepo.update).not.toHaveBeenCalled();
      expect(mockSubscriptionRepo.save).not.toHaveBeenCalled();
    });

    it('uses PRO when planId is null', async () => {
      const sub = {
        id: 'sub-uuid',
        userId,
        providerSubscriptionId: paypalId,
        status: SubscriptionStatus.APPROVAL_PENDING,
        planId: null,
        plan: SubscriptionPlan.PRO,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      };
      mockSubscriptionRepo.findOne.mockResolvedValue(sub);
      mockSubscriptionRepo.save.mockResolvedValue(sub);
      mockUserRepo.update.mockResolvedValue(undefined);

      await service.activateFromPayPal(paypalId);
      expect(mockUserRepo.update).toHaveBeenCalledWith(userId, { planId: 'PRO' });
    });
  });

  describe('cancelFromPayPal', () => {
    it('sets subscription to CANCELLED and user to FREE', async () => {
      const sub = {
        id: 'sub-uuid',
        userId: 'user-uuid',
        providerSubscriptionId: 'I-XXX789',
        status: SubscriptionStatus.ACTIVE,
      };
      mockSubscriptionRepo.findOne.mockResolvedValue(sub);
      mockSubscriptionRepo.save.mockResolvedValue(sub);
      mockUserRepo.update.mockResolvedValue(undefined);

      await service.cancelFromPayPal('I-XXX789');

      expect(mockSubscriptionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: expect.any(Date),
        }),
      );
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-uuid', { planId: 'FREE' });
    });
  });
});
