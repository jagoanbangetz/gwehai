/**
 * OOB Detector Service — Unit Tests
 *
 * Tests the core OOB callback detection logic:
 * - Test creation and ID generation
 * - Payload template resolution
 * - Callback processing and confidence scoring
 * - Timeout handling
 * - Rate limiting
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OobDetectorService, PAYLOAD_TEMPLATES } from './oob-detector.service';
import { OobLog } from '../entities/oob-log.entity';

// Mock repository
const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
});

const mockConfigService = () => ({
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      OOB_CALLBACK_DOMAIN: 'callback.gweh.sh',
      OOB_DNS_PORT: '5353',
      OOB_HTTP_PORT: '8825',
      OOB_MAX_PENDING: '50',
      OOB_DEFAULT_TIMEOUT_MS: '30000',
    };
    return config[key];
  }),
});

describe('OobDetectorService', () => {
  let service: OobDetectorService;
  let repo: ReturnType<typeof mockRepo>;
  let configService: ReturnType<typeof mockConfigService>;

  beforeEach(async () => {
    repo = mockRepo();
    configService = mockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OobDetectorService,
        { provide: getRepositoryToken(OobLog), useValue: repo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<OobDetectorService>(OobDetectorService);
    // Don't start servers in tests
    jest.spyOn(service as any, 'startDnsServer').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'startHttpServer').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'startCleanupTimer').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('payload templates', () => {
    it('should have templates for all vuln types', () => {
      const types = new Set(PAYLOAD_TEMPLATES.map((t) => t.vulnType));
      expect(types.has('sqli')).toBe(true);
      expect(types.has('xxe')).toBe(true);
      expect(types.has('ssrf')).toBe(true);
      expect(types.has('cmdi')).toBe(true);
    });

    it('should have DNS and HTTP variants for SQLi', () => {
      const sqliTemplates = PAYLOAD_TEMPLATES.filter((t) => t.vulnType === 'sqli');
      const dnsCount = sqliTemplates.filter((t) => t.id.includes('_dns_')).length;
      const httpCount = sqliTemplates.filter((t) => t.id.includes('_http_')).length;
      expect(dnsCount).toBeGreaterThanOrEqual(4);
      expect(httpCount).toBeGreaterThanOrEqual(4);
    });

    it('should all contain {{callback}} placeholder', () => {
      for (const tmpl of PAYLOAD_TEMPLATES) {
        expect(tmpl.payload).toContain('{{callback}}');
      }
    });

    it('getTemplates should filter by vuln type', () => {
      const sqli = service.getTemplates('sqli');
      expect(sqli.length).toBeGreaterThan(0);
      for (const t of sqli) {
        expect(t.vulnType).toBe('sqli');
      }
    });

    it('getTemplates should return all when no filter', () => {
      const all = service.getTemplates();
      expect(all.length).toBe(PAYLOAD_TEMPLATES.length);
    });
  });

  describe('createTest', () => {
    it('should create a test with unique testId', async () => {
      repo.count.mockResolvedValue(0);
      repo.create.mockImplementation((data: any) => ({ ...data, id: 'uuid-1' }));
      repo.save.mockImplementation((data: any) => Promise.resolve({ ...data, createdAt: new Date() }));

      const result = await service.createTest({
        payloadType: 'dns',
        targetUrl: 'https://example.com',
        vulnType: 'sqli',
      });

      expect(result.testId).toBeDefined();
      expect(result.testId.length).toBeGreaterThan(8);
      expect(result.callbackDomain).toContain('.callback.gweh.sh');
      expect(result.callbackUrl).toContain('http://');
      expect(result.timeoutMs).toBe(30000);
    });

    it('should resolve template when templateId provided', async () => {
      repo.count.mockResolvedValue(0);
      repo.create.mockImplementation((data: any) => ({ ...data, id: 'uuid-2' }));
      repo.save.mockImplementation((data: any) => Promise.resolve({ ...data, createdAt: new Date() }));

      const result = await service.createTest({
        templateId: 'sqli_dns_mysql',
      });

      expect(result.payloadTemplate).toBeDefined();
      expect(result.payloadTemplate).toContain('LOAD_FILE');
      expect(result.payloadTemplate).toContain('.callback.gweh.sh');
      expect(result.payloadTemplate).not.toContain('{{callback}}');
    });

    it('should reject when max pending reached', async () => {
      repo.count.mockResolvedValue(50);

      await expect(
        service.createTest({ payloadType: 'dns' }),
      ).rejects.toThrow('Max pending OOB tests reached');
    });
  });

  describe('getStatus', () => {
    it('should return test status', async () => {
      const mockLog = {
        testId: 'test-123',
        status: 'received',
        confidence: 90,
        callbacks: [{ type: 'http', timestamp: new Date().toISOString() }],
        payloadType: 'dns',
        targetUrl: 'https://example.com',
        vulnType: 'sqli',
        callbackDomain: 'test-123.callback.gweh.sh',
        payloadTemplate: null,
        createdAt: new Date(),
        callbackReceivedAt: new Date(),
      };
      repo.findOne.mockResolvedValue(mockLog);

      const result = await service.getStatus('test-123');
      expect(result.status).toBe('received');
      expect(result.confidence).toBe(90);
      expect(result.callbackCount).toBe(1);
    });

    it('should throw for non-existent test', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getStatus('nonexistent')).rejects.toThrow('OOB test not found');
    });
  });

  describe('DNS query parsing', () => {
    it('should parse DNS query name correctly', () => {
      // Build a minimal DNS query for "abc123.callback.gweh.sh"
      const labels = ['abc123', 'callback', 'gweh', 'sh'];
      const parts: number[] = [];
      for (const label of labels) {
        parts.push(label.length);
        for (const ch of label) parts.push(ch.charCodeAt(0));
      }
      parts.push(0); // root label

      // DNS header (12 bytes) + question
      const header = Buffer.alloc(12);
      header.writeUInt16BE(0x1234, 0); // ID
      header.writeUInt16BE(0x0100, 2); // flags: standard query
      header.writeUInt16BE(1, 4);      // QDCOUNT = 1

      const question = Buffer.from([...parts, 0, 1, 0, 1]); // QTYPE=A, QCLASS=IN
      const msg = Buffer.concat([header, question]);

      const parsed = (service as any).parseDnsQueryName(msg);
      expect(parsed).toBe('abc123.callback.gweh.sh');
    });

    it('should return null for invalid DNS message', () => {
      const msg = Buffer.alloc(5);
      const parsed = (service as any).parseDnsQueryName(msg);
      expect(parsed).toBeNull();
    });
  });

  describe('waitForCallback', () => {
    it('should return immediately if already received', async () => {
      const mockLog = {
        testId: 'test-wait',
        status: 'received',
        confidence: 95,
        callbacks: [{ type: 'dns' }, { type: 'http' }],
      };
      repo.findOne.mockResolvedValue(mockLog);

      const result = await service.waitForCallback('test-wait');
      expect(result.status).toBe('received');
      expect(result.confidence).toBe(95);
    });

    it('should throw for non-existent test', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.waitForCallback('nonexistent')).rejects.toThrow('OOB test not found');
    });
  });

  describe('cancelTest', () => {
    it('should cancel a pending test', async () => {
      const mockLog = { id: 'uuid-1', testId: 'test-cancel', status: 'pending' };
      repo.findOne.mockResolvedValue(mockLog);

      const result = await service.cancelTest('test-cancel');
      expect(result.ok).toBe(true);
      expect(repo.update).toHaveBeenCalledWith('uuid-1', { status: 'cancelled' });
    });
  });
});
