import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, VerificationStatus } from '../../src/entities/report.entity';
import { ReVerifyService } from '../../src/reports/re-verify.service';
import { ToolsService } from '../../src/tools/tools.service';

describe('ReVerifyService', () => {
  let service: ReVerifyService;
  let reportRepo: Repository<Report>;
  let toolsService: ToolsService;

  const mockReportRepo = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };

  const mockToolsService = {
    execCommand: jest.fn(),
  };

  const mockQueryBuilder: any = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockReportRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockReportRepo.update.mockResolvedValue({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReVerifyService,
        { provide: getRepositoryToken(Report), useValue: mockReportRepo },
        { provide: ToolsService, useValue: mockToolsService },
      ],
    }).compile();

    service = module.get<ReVerifyService>(ReVerifyService);
    reportRepo = module.get<Repository<Report>>(getRepositoryToken(Report));
    toolsService = module.get<ToolsService>(ToolsService);
  });

  describe('getFindingsNeedingReVerification', () => {
    it('should query for HIGH/CRITICAL findings with PENDING or FAILED status', async () => {
      const mockFindings = [
        { id: 'f1', metadata: { severity: 'HIGH' }, verificationStatus: VerificationStatus.PENDING },
        { id: 'f2', metadata: { severity: 'CRITICAL' }, verificationStatus: VerificationStatus.FAILED },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(mockFindings);

      const result = await service.getFindingsNeedingReVerification('user1', 'conv1');

      expect(mockReportRepo.createQueryBuilder).toHaveBeenCalledWith('r');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('r.userId = :userId', { userId: 'user1' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('r.conversationId = :conversationId', { conversationId: 'conv1' });
      expect(result).toEqual(mockFindings);
    });

    it('should return empty array when no findings need re-verification', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getFindingsNeedingReVerification('user1', 'conv1');

      expect(result).toEqual([]);
    });
  });

  describe('reVerifyFinding', () => {
    it('should mark as SKIPPED when no verification command can be built', async () => {
      const finding = {
        id: 'f1',
        detail: 'Some logic flaw',
        poc: '',
        target: '',
        metadata: { title: 'Logic issue' },
        verificationAttempts: 0,
      } as any;

      const result = await service.reVerifyFinding(finding);

      expect(result.status).toBe(VerificationStatus.SKIPPED);
      expect(result.attempts).toBe(1);
      expect(mockReportRepo.update).toHaveBeenCalledWith('f1', expect.objectContaining({
        verificationStatus: VerificationStatus.SKIPPED,
        verificationAttempts: 1,
      }));
    });

    it('should mark as PASSED when SQLi verification confirms vulnerability', async () => {
      const finding = {
        id: 'f2',
        detail: 'SQL injection in login form',
        poc: "curl 'https://example.com/login?id=1 OR 1=1'",
        target: 'https://example.com/login',
        metadata: { title: 'SQLi in login', severity: 'CRITICAL' },
        verificationAttempts: 0,
      } as any;

      mockToolsService.execCommand.mockResolvedValue({
        stdout: 'Parameter: id (GET)\n    Type: boolean-based blind\n    Title: AND boolean-based blind\nsqlmap identified the following injection point(s)',
        stderr: '',
        exitCode: 0,
      });

      const result = await service.reVerifyFinding(finding);

      expect(result.status).toBe(VerificationStatus.PASSED);
      expect(result.attempts).toBe(1);
      expect(mockToolsService.execCommand).toHaveBeenCalledWith(expect.objectContaining({
        command: 'sqlmap',
      }));
    });

    it('should mark as FAILED when SQLi verification does not confirm', async () => {
      const finding = {
        id: 'f3',
        detail: 'SQL injection in search',
        poc: "curl 'https://example.com/search?q=test'",
        target: 'https://example.com/search',
        metadata: { title: 'SQLi in search', severity: 'HIGH' },
        verificationAttempts: 0,
      } as any;

      mockToolsService.execCommand.mockResolvedValue({
        stdout: 'all tested parameters do not appear to be injectable',
        stderr: '',
        exitCode: 0,
      });

      const result = await service.reVerifyFinding(finding);

      expect(result.status).toBe(VerificationStatus.FAILED);
      expect(result.attempts).toBe(1);
    });

    it('should mark as FAILED on tool execution error', async () => {
      const finding = {
        id: 'f4',
        detail: 'XSS in comment field',
        poc: "curl 'https://example.com/comment'",
        target: 'https://example.com/comment',
        metadata: { title: 'Stored XSS', severity: 'HIGH' },
        verificationAttempts: 0,
      } as any;

      mockToolsService.execCommand.mockRejectedValue(new Error('Command timed out'));

      const result = await service.reVerifyFinding(finding);

      expect(result.status).toBe(VerificationStatus.FAILED);
      expect(result.attempts).toBe(1);
    });

    it('should increment attempts correctly', async () => {
      const finding = {
        id: 'f5',
        detail: 'SQL injection found',
        poc: '',
        target: 'https://example.com/api',
        metadata: { title: 'SQLi', severity: 'CRITICAL' },
        verificationAttempts: 2, // Already had 2 attempts
      } as any;

      mockToolsService.execCommand.mockResolvedValue({
        stdout: 'is vulnerable',
        stderr: '',
        exitCode: 0,
      });

      const result = await service.reVerifyFinding(finding);

      expect(result.attempts).toBe(3);
    });
  });

  describe('reVerifyAllHighCritical', () => {
    it('should return zeroed summary when no findings need re-verification', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.reVerifyAllHighCritical('user1', 'conv1');

      expect(result).toEqual({ total: 0, passed: 0, failed: 0, skipped: 0, disputed: 0, results: [] });
    });

    it('should re-verify all findings and return correct counts', async () => {
      const findings = [
        {
          id: 'f1',
          detail: 'SQL injection in login',
          poc: "curl 'https://example.com/login?id=1'",
          target: 'https://example.com/login',
          metadata: { title: 'SQLi', severity: 'CRITICAL' },
          verificationAttempts: 0,
        },
        {
          id: 'f2',
          detail: 'Logic flaw in checkout',
          poc: '',
          target: '',
          metadata: { title: 'Business logic', severity: 'HIGH' },
          verificationAttempts: 0,
        },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(findings);

      // First finding: sqlmap confirms
      mockToolsService.execCommand.mockResolvedValueOnce({
        stdout: 'is vulnerable',
        stderr: '',
        exitCode: 0,
      });
      // Second finding: no command can be built → SKIPPED

      const result = await service.reVerifyAllHighCritical('user1', 'conv1');

      expect(result.total).toBe(2);
      expect(result.passed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.disputed).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should flag finding as DISPUTED after max failed attempts', async () => {
      const findings = [
        {
          id: 'f1',
          detail: 'SQL injection in login',
          poc: "curl 'https://example.com/login?id=1'",
          target: 'https://example.com/login',
          metadata: { title: 'SQLi', severity: 'CRITICAL' },
          verificationAttempts: 2, // Already 2 attempts, this will be 3rd
        },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(findings);

      mockToolsService.execCommand.mockResolvedValue({
        stdout: 'not injectable',
        stderr: '',
        exitCode: 0,
      });

      const result = await service.reVerifyAllHighCritical('user1', 'conv1');

      expect(result.total).toBe(1);
      expect(result.disputed).toBe(1);
      expect(result.results[0].status).toBe(VerificationStatus.FAILED);
      // Should update metadata with disputed flag
      expect(mockReportRepo.update).toHaveBeenCalledWith('f1', expect.objectContaining({
        metadata: expect.objectContaining({
          disputed: true,
          dispute_reason: expect.stringContaining('Failed re-verification'),
        }),
      }));
    });
  });

  describe('buildVerifyCommand', () => {
    it('should build sqlmap command for SQLi findings', () => {
      const finding = {
        detail: 'SQL injection in parameter',
        poc: '',
        target: 'https://example.com/api',
        metadata: { title: 'SQLi vulnerability' },
      } as any;

      // Access private method for direct testing
      const result = (service as any).buildVerifyCommand(finding);

      expect(result).not.toBeNull();
      expect(result.command).toBe('sqlmap');
      expect(result.commandLine).toContain('sqlmap');
      expect(result.commandLine).toContain('--batch');
    });

    it('should build curl command for XSS findings', () => {
      const finding = {
        detail: 'Cross-site scripting in search',
        poc: '',
        target: 'https://example.com/search',
        metadata: { title: 'XSS reflected' },
      } as any;

      const result = (service as any).buildVerifyCommand(finding);

      expect(result).not.toBeNull();
      expect(result.command).toBe('curl');
    });

    it('should return null for unverifiable finding types', () => {
      const finding = {
        detail: 'Weak password policy',
        poc: '',
        target: '',
        metadata: { title: 'Password complexity' },
      } as any;

      const result = (service as any).buildVerifyCommand(finding);

      expect(result).toBeNull();
    });

    it('should fall back to URL extraction from POC when target is empty', () => {
      const finding = {
        detail: 'XSS found',
        poc: "Payload sent to https://example.com/vulnerable endpoint",
        target: '',
        metadata: { title: 'XSS' },
      } as any;

      const result = (service as any).buildVerifyCommand(finding);

      expect(result).not.toBeNull();
      expect(result.commandLine).toContain('https://example.com/vulnerable');
    });
  });

  describe('evaluateVerificationResult', () => {
    it('should pass SQLi when sqlmap reports injectable', () => {
      const finding = { detail: 'SQL injection', poc: '' } as any;
      const result = (service as any).evaluateVerificationResult(
        finding,
        'Parameter id is injectable',
        '',
        0,
      );
      expect(result).toBe(true);
    });

    it('should fail SQLi when sqlmap reports not injectable', () => {
      const finding = { detail: 'SQL injection', poc: '' } as any;
      const result = (service as any).evaluateVerificationResult(
        finding,
        'all tested parameters do not appear to be injectable',
        '',
        0,
      );
      expect(result).toBe(false);
    });

    it('should pass IDOR when endpoint returns 200', () => {
      const finding = { detail: 'IDOR access control', poc: '' } as any;
      const result = (service as any).evaluateVerificationResult(
        finding,
        '200',
        '',
        0,
      );
      expect(result).toBe(true);
    });

    it('should fail IDOR when endpoint returns 403', () => {
      const finding = { detail: 'IDOR access control', poc: '' } as any;
      const result = (service as any).evaluateVerificationResult(
        finding,
        '403',
        '',
        0,
      );
      expect(result).toBe(false);
    });
  });
});
