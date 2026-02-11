import { PointsController } from '../../src/points/points.controller';
import { PointsService } from '../../src/points/points.service';

describe('PointsController', () => {
  const pointsService = {
    getBalance: jest.fn(),
    getLedgerHistory: jest.fn(),
  } as unknown as PointsService;

  let controller: PointsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new PointsController(pointsService);
  });

  it('returns balance', async () => {
    pointsService.getBalance = jest.fn().mockResolvedValue(5.5);
    const result = await controller.getBalance({ user: { id: 'u1' } } as any);

    expect(result.balance).toBe(5.5);
  });

  it('returns ledger history with pagination', async () => {
    pointsService.getLedgerHistory = jest.fn().mockResolvedValue({ entries: [], total: 0 });
    const result = await controller.getLedger({ user: { id: 'u1' } } as any, '10', '5');

    expect(pointsService.getLedgerHistory).toHaveBeenCalledWith('u1', 10, 5);
    expect(result.total).toBe(0);
  });
});
