import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from '../../src/entities/report.entity';
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

  const mockQueryBuilder: any = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addSelect.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.groupBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockReportRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: mockReportRepo,
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
          metadata: null,
        }),
      );
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
