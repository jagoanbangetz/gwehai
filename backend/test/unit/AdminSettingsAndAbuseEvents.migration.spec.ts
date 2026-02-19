import { AdminSettingsAndAbuseEvents1700000000024 } from '../../src/migrations/1700000000024-AdminSettingsAndAbuseEvents';

describe('AdminSettingsAndAbuseEvents1700000000024', () => {
  let migration: AdminSettingsAndAbuseEvents1700000000024;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new AdminSettingsAndAbuseEvents1700000000024();
    queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
  });

  it('has correct name', () => {
    expect(migration.name).toBe('AdminSettingsAndAbuseEvents1700000000024');
  });

  it('up creates admin_settings and abuse_events tables', async () => {
    await migration.up(queryRunner as any);

    expect(queryRunner.query).toHaveBeenCalled();
    const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
    expect(calls.some((q) => q.includes('CREATE TABLE') && q.includes('admin_settings'))).toBe(true);
    expect(calls.some((q) => q.includes('CREATE TABLE') && q.includes('abuse_events'))).toBe(true);
    expect(calls.some((q) => q.includes('IDX_abuse_events_userId_createdAt'))).toBe(true);
    expect(calls.some((q) => q.includes('IDX_abuse_events_createdAt'))).toBe(true);
  });

  it('down drops tables and indexes', async () => {
    await migration.down(queryRunner as any);

    expect(queryRunner.query).toHaveBeenCalled();
    const calls = queryRunner.query.mock.calls.map((c) => c[0] as string);
    expect(calls.some((q) => q.includes('DROP INDEX') && q.includes('IDX_abuse_events_createdAt'))).toBe(true);
    expect(calls.some((q) => q.includes('DROP TABLE') && q.includes('abuse_events'))).toBe(true);
    expect(calls.some((q) => q.includes('DROP TABLE') && q.includes('admin_settings'))).toBe(true);
  });
});
