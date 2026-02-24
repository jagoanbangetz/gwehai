import { HttpStatus } from '@nestjs/common';
import { AdminModelsController } from '../../src/admin/admin-models.controller';
import { Model } from '../../src/entities/model.entity';

describe('AdminModelsController', () => {
  const mockModelRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
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
    it('returns models ordered by isDefault DESC and displayName ASC', async () => {
      const rows = [
        {
          id: 'm1',
          name: 'gpt-4',
          displayName: 'GPT-4',
          provider: 'openai',
          pointsPer1kInputTokens: 1,
          pointsPer1kOutputTokens: 2,
          isActive: true,
          isDefault: true,
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
      expect(result.models[0].isDefault).toBe(true);
      expect(mockModelRepo.find).toHaveBeenCalledWith({
        order: { isDefault: 'DESC', displayName: 'ASC' },
      });
    });

    it('returns empty array when no models', async () => {
      mockModelRepo.find.mockResolvedValue([]);
      const result = await controller.listModels();
      expect(result.models).toEqual([]);
    });
  });

  describe('updateModel', () => {
    it('returns 404 when model not found', async () => {
      mockModelRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.updateModel(
          'non-existent',
          { displayName: 'New Name' },
          { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('updates displayName and saves', async () => {
      const model = {
        id: 'm1',
        name: 'gpt-4',
        displayName: 'GPT-4',
        provider: 'openai',
        pointsPer1kInputTokens: 1,
        pointsPer1kOutputTokens: 2,
        isActive: true,
        isDefault: false,
        save: jest.fn(),
      };
      mockModelRepo.findOne.mockResolvedValue(model);
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockModelRepo.createQueryBuilder.mockReturnValue(qb);
      mockModelRepo.save.mockResolvedValue(model);

      const result = await controller.updateModel(
        'm1',
        { displayName: 'GPT-4 Turbo' },
        { user: { id: 'admin1' }, headers: {}, socket: {} } as any,
      );

      expect(result.ok).toBe(true);
      expect(model.displayName).toBe('GPT-4 Turbo');
      expect(mockModelRepo.save).toHaveBeenCalledWith(model);
      expect(mockAdminService.log).toHaveBeenCalled();
    });
  });
});
