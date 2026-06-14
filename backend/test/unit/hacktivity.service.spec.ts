import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Hacktivity } from '../../src/entities/hacktivity.entity';
import { Conversation } from '../../src/entities/conversation.entity';
import { HacktivityService } from '../../src/hacktivity/hacktivity.service';

describe('HacktivityService', () => {
  let service: HacktivityService;
  let hacktivityRepo: Repository<Hacktivity>;

  const mockHacktivityRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockQueryBuilder: any = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    skip: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getCount: jest.fn(),
  };

  const mockConversationRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.take.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.skip.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
    mockHacktivityRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HacktivityService,
        {
          provide: getRepositoryToken(Hacktivity),
          useValue: mockHacktivityRepo,
        },
        {
          provide: getRepositoryToken(Conversation),
          useValue: mockConversationRepo,
        },
      ],
    }).compile();

    service = module.get<HacktivityService>(HacktivityService);
    hacktivityRepo = module.get<Repository<Hacktivity>>(getRepositoryToken(Hacktivity));
  });

  describe('create', () => {
    it('creates and saves a hacktivity row with all fields', async () => {
      const data = {
        conversationId: 'conv-1',
        domain: 'https://example.com',
        result: 'stdout: dirsearch output',
        toolArgs: { command: 'dirsearch', target: 'https://example.com' },
      };
      const created = {
        id: 'h1',
        userId: 'u1',
        ...data,
        createdAt: new Date(),
      };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      const result = await service.create('u1', data);

      expect(mockHacktivityRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        conversationId: 'conv-1',
        domain: 'https://example.com',
        result: 'stdout: dirsearch output',
        toolArgs: data.toolArgs,
      });
      expect(mockHacktivityRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('skips noise entry: empty stdout with stderr', async () => {
      const data = {
        result: JSON.stringify({ stdout: '', stderr: 'bash: command not found', exitCode: 127 }),
      };
      const result = await service.create('u1', data);
      expect(result).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
      expect(mockHacktivityRepo.save).not.toHaveBeenCalled();
    });

    it('skips noise entry: empty command error', async () => {
      const data = {
        result: JSON.stringify({ error: 'exec requires a non-empty command.', exitCode: 1 }),
      };
      const result = await service.create('u1', data);
      expect(result).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('skips noise entry: browser crash (success: false + error)', async () => {
      const data = {
        result: JSON.stringify({ success: false, action: 'navigate', error: 'Browser crashed' }),
      };
      const result = await service.create('u1', data);
      expect(result).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('skips noise entry: tool error with no stdout', async () => {
      const data = {
        result: JSON.stringify({ error: 'Unknown tool: foo' }),
      };
      const result = await service.create('u1', data);
      expect(result).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('keeps entry: stdout has content even with stderr', async () => {
      const data = {
        result: JSON.stringify({ stdout: 'some output', stderr: 'warning: deprecated', exitCode: 0 }),
        domain: 'https://example.com',
      };
      const created = { id: 'h-keep', userId: 'u1', result: '{"stdout":"some output","stderr":"warning: deprecated","exitCode":0}', createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      const result = await service.create('u1', data);
      expect(result).not.toBeNull();
      expect(mockHacktivityRepo.save).toHaveBeenCalled();
    });

    it('skips noise entry: plain text "Error: command is required"', async () => {
      const data = { result: 'Error: command is required' };
      const r = await service.create('u1', data);
      expect(r).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('skips noise entry: plain text "Error: exec requires a non-empty command."', async () => {
      const data = { result: 'Error: exec requires a non-empty command.' };
      const r = await service.create('u1', data);
      expect(r).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('skips noise entry: case-insensitive "error: tool failed"', async () => {
      const data = { result: 'error: tool failed to execute' };
      const r = await service.create('u1', data);
      expect(r).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('skips noise entry: empty string result', async () => {
      const data = { result: '   ' };
      const r = await service.create('u1', data);
      expect(r).toBeNull();
      expect(mockHacktivityRepo.create).not.toHaveBeenCalled();
    });

    it('keeps entry: plain text result (not JSON)', async () => {
      const data = { result: 'some plain text output' };
      const created = { id: 'h-text', userId: 'u1', result: 'some plain text output', createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      const result = await service.create('u1', data);
      expect(result).not.toBeNull();
      expect(mockHacktivityRepo.save).toHaveBeenCalled();
    });

    it('keeps entry: pentest output describing target error page (not a tool error)', async () => {
      const data = { result: 'Found error page at /admin: "500 Internal Server Error: Database connection failed"' };
      const created = { id: 'h-pentest', userId: 'u1', result: data.result, createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      const result = await service.create('u1', data);
      expect(result).not.toBeNull();
      expect(mockHacktivityRepo.save).toHaveBeenCalled();
    });

    it('keeps entry: successful browser action', async () => {
      const data = {
        result: JSON.stringify({ success: true, action: 'navigate', url: 'https://example.com', title: 'Example' }),
      };
      const created = { id: 'h-browse', userId: 'u1', result: data.result, createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      const result = await service.create('u1', data);
      expect(result).not.toBeNull();
      expect(mockHacktivityRepo.save).toHaveBeenCalled();
    });

    it('creates with null optional fields when not provided', async () => {
      const data = { result: '[]' };
      const created = { id: 'h2', userId: 'u1', ...data, conversationId: null, domain: null, toolArgs: null, createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      await service.create('u1', data);

      expect(mockHacktivityRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        conversationId: null,
        domain: null,
        result: '[]',
        toolArgs: null,
      });
    });

    it('truncates result when longer than MAX_RESULT_LENGTH', async () => {
      const longResult = 'x'.repeat(17000);
      const data = { result: longResult };
      const created = { id: 'h3', userId: 'u1', result: 'x'.repeat(16000) + '\n...[truncated]', createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);

      await service.create('u1', data);

      expect(mockHacktivityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'x'.repeat(16000) + '\n...[truncated]',
        }),
      );
    });
  });

  describe('list', () => {
    it('returns items and total for user with default limit', async () => {
      const rows = [
        { id: 'h1', userId: 'u1', result: 'ok', createdAt: new Date() },
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([rows, 1]);

      const result = await service.list('u1');

      expect(mockHacktivityRepo.createQueryBuilder).toHaveBeenCalledWith('h');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('h.userId = :userId', { userId: 'u1' });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('h.createdAt', 'DESC');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(result).toEqual({ items: rows, total: 1 });
    });

    it('filters by conversationId when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.list('u1', { conversationId: 'conv-1' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('h.conversationId = :conversationId', {
        conversationId: 'conv-1',
      });
    });

    it('applies limit and offset from options', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.list('u1', { limit: 50, offset: 10 });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
    });

    it('caps limit at 100', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.list('u1', { limit: 500 });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
    });

    it('filters noise entries (Error: prefix) on read', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.list('u1');

      // Should add andWhere to exclude plain-text error messages
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('Error:%'),
      );
    });
  });

  describe('listConversations', () => {
    let mockConvQueryBuilder: any;

    beforeEach(() => {
      mockConvQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(),
      };
      mockHacktivityRepo.createQueryBuilder.mockReturnValue(mockConvQueryBuilder);
    });

    it('returns conversations ordered by last activity with LIMIT 50', async () => {
      const rawRows = [
        { conversationId: 'c1', count: '10', lastActivity: new Date().toISOString() },
        { conversationId: 'c2', count: '5', lastActivity: new Date().toISOString() },
      ];
      mockConvQueryBuilder.getRawMany.mockResolvedValue(rawRows);
      mockConversationRepo.find.mockResolvedValue([
        { id: 'c1', title: 'Pentest A' },
        { id: 'c2', title: null },
      ]);

      const result = await service.listConversations('u1');

      expect(mockConvQueryBuilder.andWhere).toHaveBeenCalledWith(
        "h.createdAt > NOW() - INTERVAL '30 days'",
      );
      expect(mockConvQueryBuilder.limit).toHaveBeenCalledWith(50);
      expect(mockConvQueryBuilder.orderBy).toHaveBeenCalledWith('lastActivity', 'DESC');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ conversationId: 'c1', title: 'Pentest A', count: 10 });
      expect(result[1]).toMatchObject({ conversationId: 'c2', title: null, count: 5 });
    });

    it('returns cached result on second call within TTL', async () => {
      const rawRows = [{ conversationId: 'c1', count: '3', lastActivity: new Date().toISOString() }];
      mockConvQueryBuilder.getRawMany.mockResolvedValue(rawRows);
      mockConversationRepo.find.mockResolvedValue([{ id: 'c1', title: 'Cached' }]);

      // First call — hits DB
      const first = await service.listConversations('u1');
      expect(mockHacktivityRepo.createQueryBuilder).toHaveBeenCalledTimes(1);

      // Second call — should use cache, no extra DB call
      const second = await service.listConversations('u1');
      expect(mockHacktivityRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('invalidates cache when create() is called', async () => {
      const rawRows = [{ conversationId: 'c1', count: '3', lastActivity: new Date().toISOString() }];
      mockConvQueryBuilder.getRawMany.mockResolvedValue(rawRows);
      mockConversationRepo.find.mockResolvedValue([{ id: 'c1', title: 'Old' }]);

      // Populate cache
      await service.listConversations('u1');
      expect(mockHacktivityRepo.createQueryBuilder).toHaveBeenCalledTimes(1);

      // create() should invalidate cache
      const created = { id: 'h-new', userId: 'u1', conversationId: 'c1', result: 'ok', createdAt: new Date() };
      mockHacktivityRepo.create.mockReturnValue(created);
      mockHacktivityRepo.save.mockResolvedValue(created);
      await service.create('u1', { result: 'ok', conversationId: 'c1' });

      // Next listConversations should hit DB again
      mockConvQueryBuilder.getRawMany.mockResolvedValue([
        ...rawRows,
        { conversationId: 'c2', count: '1', lastActivity: new Date().toISOString() },
      ]);
      mockConversationRepo.find.mockResolvedValue([
        { id: 'c1', title: 'Old' },
        { id: 'c2', title: 'New' },
      ]);
      const afterCreate = await service.listConversations('u1');
      expect(mockHacktivityRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(afterCreate).toHaveLength(2);
    });

    it('returns empty array when no conversations exist', async () => {
      mockConvQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.listConversations('u1');

      expect(result).toEqual([]);
    });
  });

  describe('countEvidenceToolCalls', () => {
    it('returns 0 when no hacktivity entries exist for conversation', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const result = await service.countEvidenceToolCalls('u1', 'conv-empty');

      expect(result).toBe(0);
    });

    it('counts evidence-producing tool entries and excludes report_finding results', async () => {
      const entries = [
        { id: 'h1', result: '{"stdout":"SQL injection found in param id","exitCode":0}' },
        { id: 'h2', result: '{"ok":true,"report_id":"r1","confidence":80}' },  // report_finding → skip
        { id: 'h3', result: 'HTTP/1.1 200 OK\\nContent-Type: text/html' },
        { id: 'h4', result: '{"ok":true,"path":"main","message":"saved"}' },  // write_file → skip
        { id: 'h5', result: '{"phase":"exploit","checklist":{"recon":true}}' },  // update_pentest_phase → skip
      ];
      mockQueryBuilder.getMany.mockResolvedValue(entries);

      const result = await service.countEvidenceToolCalls('u1', 'conv-1');

      expect(result).toBe(2); // h1 and h3 are evidence
    });

    it('returns 0 when only non-evidence entries exist', async () => {
      const entries = [
        { id: 'h1', result: '{"ok":true,"report_id":"r1","confidence":80}' },
        { id: 'h2', result: '{"phase":"exploit","checklist":{"recon":true}}' },
        { id: 'h3', result: '{"ok":true,"path":"main","message":"saved"}' },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(entries);

      const result = await service.countEvidenceToolCalls('u1', 'conv-no-evidence');

      expect(result).toBe(0);
    });
  });

  describe('getOne', () => {
    it('returns activity when found', async () => {
      const row = { id: 'h1', userId: 'u1', result: 'ok', createdAt: new Date() };
      mockHacktivityRepo.findOne.mockResolvedValue(row);

      const result = await service.getOne('u1', 'h1');

      expect(mockHacktivityRepo.findOne).toHaveBeenCalledWith({ where: { id: 'h1', userId: 'u1' } });
      expect(result).toEqual(row);
    });

    it('throws NotFoundException when not found', async () => {
      mockHacktivityRepo.findOne.mockResolvedValue(null);

      await expect(service.getOne('u1', 'missing')).rejects.toThrow(NotFoundException);
      await expect(service.getOne('u1', 'missing')).rejects.toThrow('Activity not found');
    });
  });
});
