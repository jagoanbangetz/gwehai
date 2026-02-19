import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from '../../src/entities/report.entity';
import { PentestJob } from '../../src/entities/pentest-job.entity';
import { ReportsService } from '../../src/reports/reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let reportRepo: Repository<Report>;

  const mockReportRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockPentestJobRepo = {
    find: jest.fn(),
  };

  const mockQueryBuilder: any = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    leftJoin: jest.fn(),
    groupBy: jest.fn(),
    addGroupBy: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addSelect.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.leftJoin.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.groupBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addGroupBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockReportRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockPentestJobRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: mockReportRepo,
        },
        {
          provide: getRepositoryToken(PentestJob),
          useValue: mockPentestJobRepo,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    reportRepo = module.get<Repository<Report>>(getRepositoryToken(Report));
  });

  describe('listReportsForUser', () => {
    it('returns reports for user ordered by createdAt DESC', async () => {
      const reports = [
        { id: 'r1', userId: 'u1', conversationId: 'c1', detail: 'd1', createdAt: new Date() },
      ];
      mockReportRepo.find.mockResolvedValue(reports);

      const result = await service.listReportsForUser('u1');

      expect(mockReportRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(reports);
    });
  });

  describe('getReportForUser', () => {
    it('returns report when found', async () => {
      const report = { id: 'r1', userId: 'u1', detail: 'XSS', poc: 'alert(1)' };
      mockReportRepo.findOne.mockResolvedValue(report);

      const result = await service.getReportForUser('u1', 'r1');

      expect(mockReportRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r1', userId: 'u1' } });
      expect(result).toEqual(report);
    });

    it('throws NotFoundException when report not found', async () => {
      mockReportRepo.findOne.mockResolvedValue(null);

      await expect(service.getReportForUser('u1', 'missing')).rejects.toThrow(NotFoundException);
      await expect(service.getReportForUser('u1', 'missing')).rejects.toThrow('Report not found');
    });
  });

  describe('createReportForUser', () => {
    it('creates and saves report with jobId', async () => {
      const created = { id: 'r1', userId: 'u1', jobId: 'j1', status: ReportStatus.QUEUED };
      mockReportRepo.create.mockReturnValue(created);
      mockReportRepo.save.mockResolvedValue(created);

      const result = await service.createReportForUser('u1', { jobId: 'j1' });

      expect(mockReportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          jobId: 'j1',
          conversationId: null,
          detail: null,
          status: ReportStatus.QUEUED,
        }),
      );
      expect(mockReportRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });
  });

  describe('createFinding', () => {
    it('saves finding with detail, conversationId, and optional poc/title/severity/target', async () => {
      const saved = {
        id: 'f1',
        userId: 'u1',
        conversationId: 'c1',
        detail: 'SQL injection in login',
        poc: 'curl "http://target/login?user=1\' OR 1=1--"',
        target: 'http://target',
        metadata: { title: 'SQLi', severity: 'high' },
        status: ReportStatus.COMPLETED,
      };
      mockReportRepo.create.mockReturnValue(saved);
      mockReportRepo.save.mockResolvedValue(saved);

      const result = await service.createFinding('u1', 'c1', 'SQL injection in login', {
        title: 'SQLi',
        severity: 'high',
        target: 'http://target',
        poc: 'curl "http://target/login?user=1\' OR 1=1--"',
      });

      expect(mockReportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          conversationId: 'c1',
          detail: 'SQL injection in login',
          poc: 'curl "http://target/login?user=1\' OR 1=1--"',
          target: 'http://target',
          status: ReportStatus.COMPLETED,
          metadata: { title: 'SQLi', severity: 'high' },
        }),
      );
      expect(mockReportRepo.save).toHaveBeenCalledWith(saved);
      expect(result).toEqual(saved);
    });

    it('saves finding without optional fields when not provided', async () => {
      const saved = { id: 'f2', userId: 'u1', conversationId: 'c1', detail: 'XSS', poc: null };
      mockReportRepo.create.mockReturnValue(saved);
      mockReportRepo.save.mockResolvedValue(saved);

      await service.createFinding('u1', 'c1', 'XSS');

      expect(mockReportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          conversationId: 'c1',
          detail: 'XSS',
          poc: null,
          target: null,
          status: ReportStatus.COMPLETED,
        }),
      );
    });
  });

  describe('listGroupedByDomainAndDate', () => {
    it('returns one row per (domain, conversationId, date) with findingsCount, firstAt, lastAt', async () => {
      const reports = [
        {
          id: 'r1',
          target: 'https://example.com/page',
          createdAt: new Date('2026-02-17T10:00:00.000Z'),
          conversationId: 'c1',
        },
        {
          id: 'r2',
          target: 'https://example.com/other',
          createdAt: new Date('2026-02-17T12:00:00.000Z'),
          conversationId: 'c1',
        },
      ];
      mockReportRepo.find.mockResolvedValue(reports);

      const result = await service.listGroupedByDomainAndDate('u1');

      expect(mockReportRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u1', status: ReportStatus.COMPLETED },
        order: { createdAt: 'DESC' },
        select: ['id', 'target', 'createdAt', 'conversationId'],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        domain: 'example.com',
        date: '2026-02-17',
        conversationId: 'c1',
        findingsCount: 2,
      });
      expect(result[0].firstAt).toBe('2026-02-17T10:00:00.000Z');
      expect(result[0].lastAt).toBe('2026-02-17T12:00:00.000Z');
      expect(result[0].createdAt).toBeDefined();
    });

    it('returns separate rows for different conversationId on same domain and date', async () => {
      const reports = [
        { id: 'r1', target: 'https://example.com', createdAt: new Date('2026-02-17T10:00:00.000Z'), conversationId: 'c1' },
        { id: 'r2', target: 'https://example.com', createdAt: new Date('2026-02-17T11:00:00.000Z'), conversationId: 'c2' },
      ];
      mockReportRepo.find.mockResolvedValue(reports);

      const result = await service.listGroupedByDomainAndDate('u1');

      expect(result).toHaveLength(2);
      expect(result.map((r) => ({ domain: r.domain, date: r.date, conversationId: r.conversationId, findingsCount: r.findingsCount }))).toEqual([
        { domain: 'example.com', date: '2026-02-17', conversationId: 'c2', findingsCount: 1 },
        { domain: 'example.com', date: '2026-02-17', conversationId: 'c1', findingsCount: 1 },
      ]);
    });

    it('uses "—" for domain when target is null', async () => {
      mockReportRepo.find.mockResolvedValue([
        { id: 'r1', target: null, createdAt: new Date('2026-02-17T10:00:00.000Z'), conversationId: 'c1' },
      ]);

      const result = await service.listGroupedByDomainAndDate('u1');

      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe('—');
      expect(result[0].date).toBe('2026-02-17');
      expect(result[0].conversationId).toBe('c1');
    });
  });

  describe('listFindingsByDomainAndDate', () => {
    it('returns completed findings for domain and date', async () => {
      const reports = [
        { id: 'f1', target: 'https://example.com', conversationId: 'c1', createdAt: new Date('2026-02-17T10:00:00.000Z'), status: ReportStatus.COMPLETED },
        { id: 'f2', target: 'https://example.com/path', conversationId: 'c1', createdAt: new Date('2026-02-17T11:00:00.000Z'), status: ReportStatus.COMPLETED },
      ];
      mockReportRepo.find.mockResolvedValue(reports);

      const result = await service.listFindingsByDomainAndDate('u1', 'example.com', '2026-02-17');

      expect(mockReportRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u1', status: ReportStatus.COMPLETED },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('f1');
      expect(result[1].id).toBe('f2');
    });

    it('filters by conversationId when provided', async () => {
      const reports = [
        { id: 'f1', target: 'https://example.com', conversationId: 'c1', createdAt: new Date('2026-02-17T10:00:00.000Z'), status: ReportStatus.COMPLETED },
        { id: 'f2', target: 'https://example.com', conversationId: 'c2', createdAt: new Date('2026-02-17T11:00:00.000Z'), status: ReportStatus.COMPLETED },
      ];
      mockReportRepo.find.mockResolvedValue(reports);

      const result = await service.listFindingsByDomainAndDate('u1', 'example.com', '2026-02-17', 'c1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('f1');
      expect(result[0].conversationId).toBe('c1');
    });

    it('returns empty array when no reports match', async () => {
      mockReportRepo.find.mockResolvedValue([]);

      const result = await service.listFindingsByDomainAndDate('u1', 'other.com', '2026-02-17');

      expect(result).toEqual([]);
    });
  });

  describe('listGroupedByConversation', () => {
    it('returns one row per conversation with website and findingsCount', async () => {
      const raw = [
        {
          conversationId: 'c1',
          website: 'https://example.com',
          findingsCount: '3',
          createdAt: new Date('2026-02-10T12:00:00.000Z'),
        },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(raw);

      const result = await service.listGroupedByConversation('u1');

      expect(mockReportRepo.createQueryBuilder).toHaveBeenCalledWith('r');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('r.userId = :userId', { userId: 'u1' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('r.conversationId IS NOT NULL');
      expect(mockQueryBuilder.getRawMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        conversationId: 'c1',
        website: 'https://example.com',
        findingsCount: 3,
      });
      expect(result[0].createdAt).toBeDefined();
    });

    it('uses "—" for website when null', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { conversationId: 'c2', website: null, findingsCount: '1', createdAt: new Date() },
      ]);

      const result = await service.listGroupedByConversation('u1');

      expect(result[0].website).toBe('—');
      expect(result[0].findingsCount).toBe(1);
    });
  });

  describe('listFindingsByConversation', () => {
    it('returns completed findings for conversation ordered by createdAt DESC', async () => {
      const findings = [
        { id: 'f1', conversationId: 'c1', detail: 'SQLi', status: ReportStatus.COMPLETED },
      ];
      mockReportRepo.find.mockResolvedValue(findings);

      const result = await service.listFindingsByConversation('u1', 'c1');

      expect(mockReportRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u1', conversationId: 'c1', status: ReportStatus.COMPLETED },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(findings);
    });
  });

  describe('updateReportStatus', () => {
    it('updates report by jobId', async () => {
      const existing = { id: 'r1', jobId: 'j1', status: ReportStatus.QUEUED };
      const updated = { ...existing, status: ReportStatus.COMPLETED };
      mockReportRepo.findOne.mockResolvedValue(existing);
      mockReportRepo.save.mockResolvedValue(updated);

      const result = await service.updateReportStatus('j1', { status: ReportStatus.COMPLETED });

      expect(mockReportRepo.findOne).toHaveBeenCalledWith({ where: { jobId: 'j1' } });
      expect(mockReportRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ReportStatus.COMPLETED }));
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when jobId not found', async () => {
      mockReportRepo.findOne.mockResolvedValue(null);

      await expect(service.updateReportStatus('missing', { status: ReportStatus.COMPLETED })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
