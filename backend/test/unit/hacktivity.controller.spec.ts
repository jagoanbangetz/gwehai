import { HacktivityController } from '../../src/hacktivity/hacktivity.controller';
import { HacktivityService } from '../../src/hacktivity/hacktivity.service';

describe('HacktivityController', () => {
  const hacktivityService = {
    list: jest.fn(),
    listConversations: jest.fn(),
    getOne: jest.fn(),
  } as unknown as HacktivityService;

  let controller: HacktivityController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new HacktivityController(hacktivityService);
  });

  describe('list', () => {
    it('returns activity list and total for the authenticated user', async () => {
      const list = [
        { id: 'h1', userId: 'u1', result: 'ok', createdAt: new Date().toISOString() },
      ];
      (hacktivityService.list as jest.Mock).mockResolvedValue({ items: list, total: 1 });

      const result = await controller.list(
        { user: { id: 'u1' } } as any,
        undefined,
        undefined,
        undefined,
      );

      expect(hacktivityService.list).toHaveBeenCalledWith('u1', {
        conversationId: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual({ items: list, total: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ id: 'h1', result: 'ok' });
    });

    it('passes conversationId, limit, offset from query', async () => {
      (hacktivityService.list as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await controller.list(
        { user: { id: 'u1' } } as any,
        'conv-123',
        '50',
        '10',
      );

      expect(hacktivityService.list).toHaveBeenCalledWith('u1', {
        conversationId: 'conv-123',
        limit: 50,
        offset: 10,
      });
    });
  });

  describe('listConversations', () => {
    it('returns conversations with activity count', async () => {
      const convs = [
        { conversationId: 'c1', title: 'Pentest run', count: 12 },
      ];
      (hacktivityService.listConversations as jest.Mock).mockResolvedValue(convs);

      const result = await controller.listConversations({ user: { id: 'u1' } } as any);

      expect(hacktivityService.listConversations).toHaveBeenCalledWith('u1');
      expect(result).toEqual(convs);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ conversationId: 'c1', count: 12 });
    });
  });

  describe('getOne', () => {
    it('returns one activity for detail view', async () => {
      const row = {
        id: 'h1',
        userId: 'u1',
        conversationId: 'c1',
        domain: 'https://example.com',
        result: 'stdout...',
        toolArgs: { command: 'dirsearch' },
        createdAt: new Date(),
      };
      (hacktivityService.getOne as jest.Mock).mockResolvedValue(row);

      const result = await controller.getOne({ user: { id: 'u1' } } as any, 'h1');

      expect(hacktivityService.getOne).toHaveBeenCalledWith('u1', 'h1');
      expect(result).toEqual(row);
      expect(result.id).toBe('h1');
      expect(result.domain).toBe('https://example.com');
    });
  });
});
