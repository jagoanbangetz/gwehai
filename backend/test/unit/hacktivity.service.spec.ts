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
