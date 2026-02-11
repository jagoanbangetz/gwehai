import { PaymentsController } from '../../src/payments/payments.controller';
import { PaymentsService } from '../../src/payments/payments.service';

describe('PaymentsController', () => {
  const paymentsService = {
    getCreditPacks: jest.fn(),
    createCreditOrder: jest.fn(),
    getUserOrders: jest.fn(),
  } as unknown as PaymentsService;

  let controller: PaymentsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new PaymentsController(paymentsService);
  });

  it('returns credit packs', async () => {
    paymentsService.getCreditPacks = jest.fn().mockResolvedValue([{ id: 'p1' }]);
    const result = await controller.getCreditPacks();

    expect(result).toHaveLength(1);
  });

  it('creates an order', async () => {
    paymentsService.createCreditOrder = jest.fn().mockResolvedValue({ id: 'o1' });
    const result = await controller.createOrder(
      { user: { id: 'u1' } } as any,
      { creditPackId: 'p1', idempotencyKey: 'k1' },
    );

    expect(result.id).toBe('o1');
    expect(paymentsService.createCreditOrder).toHaveBeenCalledWith('u1', 'p1', 'k1');
  });

  it('returns user orders', async () => {
    paymentsService.getUserOrders = jest.fn().mockResolvedValue([{ id: 'o1' }]);
    const result = await controller.getMyOrders({ user: { id: 'u1' } } as any);

    expect(result).toHaveLength(1);
  });

  it('accepts stripe webhook', async () => {
    const result = await controller.stripeWebhook({ type: 'payment_intent.succeeded', data: { object: {} } });

    expect(result.received).toBe(true);
  });
});
