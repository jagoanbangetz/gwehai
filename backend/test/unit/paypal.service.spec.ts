import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PaypalService } from '../../src/paypal/paypal.service';

describe('PaypalService', () => {
  const mockConfigGet = jest.fn();
  const mockHttpPost = jest.fn();
  const mockHttpGet = jest.fn();

  const config = {
    get: mockConfigGet,
  } as unknown as ConfigService;

  const http = {
    post: mockHttpPost,
    get: mockHttpGet,
  } as unknown as HttpService;

  let service: PaypalService;

  function createService(overrides: Partial<Record<string, string | undefined>> = {}) {
    const map: Record<string, string | undefined> = {
      PAYPAL_MODE: 'sandbox',
      PAYPAL_CLIENT_ID: '',
      PAYPAL_CLIENT_SECRET: '',
      PAYPAL_PLAN_PRO: undefined,
      PAYPAL_PLAN_PRO_PLUS: undefined,
      PAYPAL_PLAN_ULTRA: undefined,
      ...overrides,
    };
    mockConfigGet.mockImplementation((key: string, defaultValue?: string) => {
      const v = map[key];
      return v !== undefined ? v : (defaultValue ?? '');
    });
    return new PaypalService(config, http);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('returns false when client id and secret are missing', () => {
      service = createService({ PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' });
      expect(service.isConfigured()).toBe(false);
    });

    it('returns false when only client id is set', () => {
      service = createService({ PAYPAL_CLIENT_ID: 'client-id', PAYPAL_CLIENT_SECRET: '' });
      expect(service.isConfigured()).toBe(false);
    });

    it('returns true when client id and secret are set', () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'test-client-id',
        PAYPAL_CLIENT_SECRET: 'test-secret',
      });
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('getPayPalPlanId', () => {
    it('returns null for FREE plan', () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
        PAYPAL_PLAN_PRO: 'P-PRO',
      });
      expect(service.getPayPalPlanId('FREE')).toBeNull();
    });

    it('returns plan id from env when set', () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
        PAYPAL_PLAN_PRO: 'P-PRO123',
        PAYPAL_PLAN_PRO_PLUS: 'P-PROPLUS456',
        PAYPAL_PLAN_ULTRA: 'P-ULTRA789',
      });
      expect(service.getPayPalPlanId('PRO')).toBe('P-PRO123');
      expect(service.getPayPalPlanId('PRO_PLUS')).toBe('P-PROPLUS456');
      expect(service.getPayPalPlanId('ULTRA')).toBe('P-ULTRA789');
    });

    it('returns null when plan id not in env', () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
      });
      expect(service.getPayPalPlanId('PRO')).toBeNull();
    });
  });

  describe('createSubscription', () => {
    it('returns null when plan is FREE', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
      });
      const result = await service.createSubscription({
        planId: 'FREE',
        userId: 'user-1',
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
      });
      expect(result).toBeNull();
      expect(mockHttpPost).not.toHaveBeenCalled();
    });

    it('returns null when PayPal plan id is not configured for tier', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
        PAYPAL_PLAN_PRO: undefined,
      });
      const result = await service.createSubscription({
        planId: 'PRO',
        userId: 'user-1',
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
      });
      expect(result).toBeNull();
    });

    it('calls token endpoint then subscription endpoint and returns approval URL', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'client',
        PAYPAL_CLIENT_SECRET: 'secret',
        PAYPAL_PLAN_PRO: 'P-PRO',
      });
      mockHttpPost
        .mockReturnValueOnce(
          of({
            data: { access_token: 'token-123', expires_in: 3600 },
          }),
        )
        .mockReturnValueOnce(
          of({
            data: {
              id: 'I-SUB123',
              status: 'APPROVAL_PENDING',
              links: [
                { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkout?token=xxx' },
              ],
            },
          }),
        );

      const result = await service.createSubscription({
        planId: 'PRO',
        userId: 'user-1',
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
      });

      expect(result).toEqual({
        subscriptionId: 'I-SUB123',
        approvalUrl: 'https://www.sandbox.paypal.com/checkout?token=xxx',
        status: 'APPROVAL_PENDING',
      });
      expect(mockHttpPost).toHaveBeenCalledTimes(2);
      expect(mockHttpPost).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/v1/oauth2/token'),
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
      expect(mockHttpPost).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/v1/billing/subscriptions'),
        expect.objectContaining({
          plan_id: 'P-PRO',
          custom_id: 'user-1',
          application_context: expect.objectContaining({
            return_url: 'https://app.com/return',
            cancel_url: 'https://app.com/cancel',
          }),
        }),
        expect.any(Object),
      );
    });

    it('returns null when subscription API fails', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'client',
        PAYPAL_CLIENT_SECRET: 'secret',
        PAYPAL_PLAN_PRO: 'P-PRO',
      });
      mockHttpPost
        .mockReturnValueOnce(of({ data: { access_token: 't', expires_in: 3600 } }))
        .mockReturnValueOnce(throwError(() => new Error('Network error')));

      const result = await service.createSubscription({
        planId: 'PRO',
        userId: 'user-1',
        returnUrl: 'https://app.com/return',
        cancelUrl: 'https://app.com/cancel',
      });

      expect(result).toBeNull();
    });
  });

  describe('getSubscription', () => {
    it('returns subscription details when API succeeds', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
      });
      mockHttpPost.mockReturnValueOnce(
        of({ data: { access_token: 't', expires_in: 3600 } }),
      );
      mockHttpGet.mockReturnValueOnce(
        of({
          data: {
            id: 'I-SUB1',
            status: 'ACTIVE',
            plan_id: 'P-PRO',
            custom_id: 'user-1',
          },
        }),
      );

      const result = await service.getSubscription('I-SUB1');

      expect(result).toEqual({
        id: 'I-SUB1',
        status: 'ACTIVE',
        plan_id: 'P-PRO',
        custom_id: 'user-1',
      });
    });

    it('returns null when API fails', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
      });
      mockHttpPost.mockReturnValueOnce(
        of({ data: { access_token: 't', expires_in: 3600 } }),
      );
      mockHttpGet.mockReturnValueOnce(throwError(() => new Error('Not found')));

      const result = await service.getSubscription('I-BAD');

      expect(result).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    it('returns true when cancel API succeeds', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
      });
      mockHttpPost
        .mockReturnValueOnce(of({ data: { access_token: 't', expires_in: 3600 } }))
        .mockReturnValueOnce(of({ status: 204 }));

      const result = await service.cancelSubscription('I-SUB1', 'User requested');

      expect(result).toBe(true);
      expect(mockHttpPost).toHaveBeenCalledTimes(2);
    });

    it('returns false when cancel API fails', async () => {
      service = createService({
        PAYPAL_CLIENT_ID: 'c',
        PAYPAL_CLIENT_SECRET: 's',
      });
      mockHttpPost
        .mockReturnValueOnce(of({ data: { access_token: 't', expires_in: 3600 } }))
        .mockReturnValueOnce(throwError(() => new Error('Failed')));

      const result = await service.cancelSubscription('I-SUB1');

      expect(result).toBe(false);
    });
  });
});
