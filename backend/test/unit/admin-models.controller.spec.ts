import { HttpStatus } from '@nestjs/common';
import { AdminModelsController } from '../../src/admin/admin-models.controller';
import { Model } from '../../src/entities/model.entity';

describe('AdminModelsController', () => {
  const mockModelRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      getRepository: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(0),
      }),
    },
  };
  const mockAdminService = {
    getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
    log: jest.fn().mockResolvedValue(undefined),
  };

  let controller: AdminModelsController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AdminModelsController(
      mockModelRepo as any,
      mockAdminService as any,
    );
  });

  describe('listModels', () => {
    it('returns models ordered by provider, isDefault DESC, displayName ASC', async () => {
      const rows = [
        {
          id: 'm1',
          name: 'gpt-4',
          displayName: 'GPT-4',
          provider: 'openai',
          apiModelId: 'gpt-4-turbo',
          pointsPer1kInputTokens: 1,
          pointsPer1kOutputTokens: 2,
          isActive: true,
          isDefault: true,
          metadata: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      mockModelRepo.find.mockResolvedValue(rows);

      const result = await controller.listModels();

      expect(result.models).toHaveLength(1);
      expect(result.models[0].id).toBe('m1');
      expect(result.models[0].name).toBe('gpt-4');
      expect(result.models[0].displayName).toBe('GPT-4');
      expect(result.models[0].apiModelId).toBe('gpt-4-turbo');
      expect(result.models[0].isDefault).toBe(true);
      expect(mockModelRepo.find).toHaveBeenCalledWith({
        order: { provider: 'ASC', isDefault: 'DESC', displayName: 'ASC' },
      });
    });

    it('returns empty array when no models', async () => {
      mockModelRepo.find.mockResolvedValue([]);
      const result = await controller.listModels();
      expect(result.models).toEqual([]);
    });
  });

  describe('createModel', () => {
    it('returns 400 when name is missing', async () => {
      await expect(
        controller.createModel(
          { name: '', provider: 'openai' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns 400 when provider is missing', async () => {
      await expect(
        controller.createModel(
          { name: 'gpt-4', provider: '' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns 400 when provider is invalid', async () => {
      await expect(
        controller.createModel(
          { name: 'test-model', provider: 'invalid' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('returns 409 when name already exists', async () => {
      mockModelRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        controller.createModel(
          { name: 'gpt-4', provider: 'openai' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('creates model and returns ok', async () => {
      mockModelRepo.findOne.mockResolvedValue(null);
      const newModel = {
        id: 'm-new',
        name: 'gpt-4-turbo',
        displayName: 'GPT-4 Turbo',
        provider: 'openai',
        apiModelId: 'gpt-4-turbo',
        apiKey: null,
        pointsPer1kInputTokens: 0,
        pointsPer1kOutputTokens: 0,
        isActive: true,
        isDefault: false,
        metadata: null,
        createdAt: new Date('2024-06-01'),
        updatedAt: new Date('2024-06-01'),
      };
      mockModelRepo.create.mockReturnValue(newModel);
      mockModelRepo.save.mockResolvedValue(newModel);

      const result = await controller.createModel(
        { name: 'gpt-4-turbo', provider: 'openai', apiModelId: 'gpt-4-turbo' },
        { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
      );

      expect(result.ok).toBe(true);
      expect(result.model.name).toBe('gpt-4-turbo');
      expect(mockModelRepo.save).toHaveBeenCalled();
      expect(mockAdminService.log).toHaveBeenCalled();
    });
  });

  describe('updateModel (PUT)', () => {
    it('returns 404 when model not found', async () => {
      mockModelRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.updateModel(
          'non-existent',
          { name: 'updated', provider: 'openai' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('returns 400 when name is missing', async () => {
      mockModelRepo.findOne.mockResolvedValue({ id: 'm1', name: 'old' });
      await expect(
        controller.updateModel(
          'm1',
          { name: '', provider: 'openai' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('updates model with all fields and returns ok', async () => {
      const model = {
        id: 'm1',
        name: 'gpt-4',
        displayName: 'GPT-4',
        provider: 'openai',
        apiModelId: null,
        apiKey: null,
        pointsPer1kInputTokens: 1,
        pointsPer1kOutputTokens: 2,
        isActive: true,
        isDefault: false,
        metadata: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };
      // First call: find the model. Second call: uniqueness check (null = no conflict)
      mockModelRepo.findOne
        .mockResolvedValueOnce(model)
        .mockResolvedValueOnce(null);
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockModelRepo.createQueryBuilder.mockReturnValue(qb);
      mockModelRepo.save.mockImplementation(async (m) => m);

      const result = await controller.updateModel(
        'm1',
        {
          name: 'gpt-4-turbo',
          displayName: 'GPT-4 Turbo',
          provider: 'openai',
          apiModelId: 'gpt-4-turbo-2024',
        },
        { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
      );

      expect(result.ok).toBe(true);
      expect(result.model.name).toBe('gpt-4-turbo');
      expect(result.model.displayName).toBe('GPT-4 Turbo');
      expect(result.model.apiModelId).toBe('gpt-4-turbo-2024');
      expect(mockAdminService.log).toHaveBeenCalled();
    });
  });

  describe('toggleModel', () => {
    it('returns 404 when model not found', async () => {
      mockModelRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.toggleModel(
          'non-existent',
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('toggles isActive from true to false', async () => {
      const model = {
        id: 'm1',
        name: 'gpt-4',
        isActive: true,
        provider: 'openai',
      };
      mockModelRepo.findOne.mockResolvedValue(model);
      mockModelRepo.save.mockResolvedValue(model);

      const result = await controller.toggleModel(
        'm1',
        { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
      );

      expect(result.ok).toBe(true);
      expect(result.isActive).toBe(false);
      expect(model.isActive).toBe(false);
    });
  });

  describe('deleteModel', () => {
    it('returns 404 when model not found', async () => {
      mockModelRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.deleteModel(
          'non-existent',
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('deletes model when no usage events', async () => {
      const model = { id: 'm1', name: 'gpt-4', provider: 'openai' };
      mockModelRepo.findOne.mockResolvedValue(model);
      mockModelRepo.remove.mockResolvedValue(model);
      // Re-setup manager mock (resetAllMocks clears it)
      mockModelRepo.manager.getRepository.mockReturnValue({
        count: jest.fn().mockResolvedValue(0),
      });

      const result = await controller.deleteModel(
        'm1',
        { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
      );

      expect(result.ok).toBe(true);
      expect(mockModelRepo.remove).toHaveBeenCalledWith(model);
      expect(mockAdminService.log).toHaveBeenCalled();
    });
  });
});
