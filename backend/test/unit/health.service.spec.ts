import { HealthService } from '../../src/health/health.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: any;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    service = new HealthService(mockDataSource);
  });

  it('returns ok status when all checks pass', async () => {
    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.checks.db.status).toBe('ok');
    expect(result.checks.db.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.checks.memory.status).toBe('ok');
    expect(result.checks.memory.usage_percent).toBeGreaterThanOrEqual(0);
    expect(result.checks.memory.usage_percent).toBeLessThanOrEqual(100);
    expect(result.checks.disk.usage_percent).toBeGreaterThanOrEqual(0);
  });

  it('returns down status when DB fails', async () => {
    mockDataSource.query.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result.status).toBe('down');
    expect(result.checks.db.status).toBe('down');
    expect(result.checks.db.message).toBe('Database connection failed');
  });

  it('measures DB latency', async () => {
    mockDataSource.query.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ '?column?': 1 }]), 50)),
    );

    const result = await service.check();

    expect(result.checks.db.latency_ms).toBeGreaterThanOrEqual(40);
  });

  it('returns valid timestamp in ISO format', async () => {
    const result = await service.check();
    const parsed = new Date(result.timestamp);

    expect(parsed.toISOString()).toBe(result.timestamp);
  });
});
