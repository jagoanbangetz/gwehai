import { ReportsController } from '../../src/reports/reports.controller';
import { ReportsService } from '../../src/reports/reports.service';

describe('ReportsController', () => {
  const reportsService = {
    listGroupedByDomainAndDate: jest.fn(),
    listFindingsByDomainAndDate: jest.fn(),
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
    it('returns reports grouped by domain, date, conversationId for the Report menu', async () => {
      const grouped = [
        {
          domain: 'example.com',
          date: '2026-02-17',
          conversationId: 'c1-uuid',
          findingsCount: 3,
          createdAt: '2026-02-17T12:00:00.000Z',
          firstAt: '2026-02-17T10:00:00.000Z',
          lastAt: '2026-02-17T12:00:00.000Z',
        },
      ];
      (reportsService.listGroupedByDomainAndDate as jest.Mock).mockResolvedValue(grouped);

      const result = await controller.listReports({ user: { id: 'u1' } } as any);

      expect(reportsService.listGroupedByDomainAndDate).toHaveBeenCalledWith('u1');
      expect(result).toEqual(grouped);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        domain: 'example.com',
        date: '2026-02-17',
        conversationId: 'c1-uuid',
        findingsCount: 3,
      });
    });

    it('returns empty array when user has no reports', async () => {
      (reportsService.listGroupedByDomainAndDate as jest.Mock).mockResolvedValue([]);

      const result = await controller.listReports({ user: { id: 'u2' } } as any);

      expect(result).toEqual([]);
    });
  });

  describe('listFindingsByDomainAndDate (by-domain-date)', () => {
    it('returns findings for domain and date', async () => {
      const findings = [
        { id: 'f1', detail: 'SQL injection', target: 'https://example.com', metadata: { title: 'SQLi', severity: 'high' }, poc: 'curl ...' },
      ];
      (reportsService.listFindingsByDomainAndDate as jest.Mock).mockResolvedValue(findings);

      const result = await controller.listFindingsByDomainAndDate(
        { user: { id: 'u1' } } as any,
        'example.com',
        '2026-02-17',
        undefined,
      );

      expect(reportsService.listFindingsByDomainAndDate).toHaveBeenCalledWith('u1', 'example.com', '2026-02-17', undefined);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'f1', detail: 'SQL injection' });
    });

    it('passes conversationId when provided', async () => {
      (reportsService.listFindingsByDomainAndDate as jest.Mock).mockResolvedValue([]);

      await controller.listFindingsByDomainAndDate(
        { user: { id: 'u1' } } as any,
        'example.com',
        '2026-02-17',
        'conv-123',
      );

      expect(reportsService.listFindingsByDomainAndDate).toHaveBeenCalledWith('u1', 'example.com', '2026-02-17', 'conv-123');
    });

    it('returns empty array when domain or date is missing', async () => {
      const resultEmptyDomain = await controller.listFindingsByDomainAndDate(
        { user: { id: 'u1' } } as any,
        '',
        '2026-02-17',
        undefined,
      );
      expect(resultEmptyDomain).toEqual([]);
      expect(reportsService.listFindingsByDomainAndDate).not.toHaveBeenCalled();

      const resultEmptyDate = await controller.listFindingsByDomainAndDate(
        { user: { id: 'u1' } } as any,
        'example.com',
        '',
        undefined,
      );
      expect(resultEmptyDate).toEqual([]);
      expect(reportsService.listFindingsByDomainAndDate).not.toHaveBeenCalled();
    });
  });

  describe('listFindingsByConversation (legacy)', () => {
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
