import { ReportsController } from '../../src/reports/reports.controller';
import { ReportsService } from '../../src/reports/reports.service';

describe('ReportsController', () => {
  const reportsService = {
    listGroupedByConversation: jest.fn(),
    listFindingsByConversation: jest.fn(),
    getReportForUser: jest.fn(),
    createReportForUser: jest.fn(),
  } as unknown as ReportsService;

  let controller: ReportsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ReportsController(reportsService);
  });

  describe('listReports', () => {
    it('returns reports grouped by conversation for the Report menu', async () => {
      const grouped = [
        { conversationId: 'c1', website: 'https://example.com', findingsCount: 3, createdAt: '2026-02-10T12:00:00.000Z' },
      ];
      (reportsService.listGroupedByConversation as jest.Mock).mockResolvedValue(grouped);

      const result = await controller.listReports({ user: { id: 'u1' } } as any, undefined, undefined);

      expect(reportsService.listGroupedByConversation).toHaveBeenCalledWith('u1', { groupByParent: false });
      expect(result).toEqual(grouped);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ conversationId: 'c1', website: 'https://example.com', findingsCount: 3 });
    });

    it('returns empty array when user has no reports', async () => {
      (reportsService.listGroupedByConversation as jest.Mock).mockResolvedValue([]);

      const result = await controller.listReports({ user: { id: 'u2' } } as any);

      expect(result).toEqual([]);
    });
  });

  describe('listFindingsByConversation', () => {
    it('returns findings for a conversation', async () => {
      const findings = [
        { id: 'f1', detail: 'SQL injection', metadata: { title: 'SQLi', severity: 'high' }, poc: 'curl ...' },
      ];
      (reportsService.listFindingsByConversation as jest.Mock).mockResolvedValue(findings);

      const result = await controller.listFindingsByConversation(
        { user: { id: 'u1' } } as any,
        'conv-123',
      );

      expect(reportsService.listFindingsByConversation).toHaveBeenCalledWith('u1', 'conv-123');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'f1', detail: 'SQL injection' });
    });
  });

  describe('getReport', () => {
    it('gets report by id', async () => {
      const report = { id: 'r1', detail: 'XSS', poc: 'alert(1)' };
      (reportsService.getReportForUser as jest.Mock).mockResolvedValue(report);

      const result = await controller.getReport({ user: { id: 'u1' } } as any, 'r1');

      expect(reportsService.getReportForUser).toHaveBeenCalledWith('u1', 'r1');
      expect(result).toEqual(report);
      expect(result.id).toBe('r1');
      expect(result.poc).toBe('alert(1)');
    });
  });

  describe('createReport', () => {
    it('creates report with jobId', async () => {
      (reportsService.createReportForUser as jest.Mock).mockResolvedValue({ id: 'r1' });

      const result = await controller.createReport(
        { user: { id: 'u1' } } as any,
        { jobId: 'j1' },
      );

      expect(result.id).toBe('r1');
      expect(reportsService.createReportForUser).toHaveBeenCalledWith('u1', { jobId: 'j1' });
    });
  });
});
