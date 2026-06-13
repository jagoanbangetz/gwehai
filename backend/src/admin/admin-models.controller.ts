import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { Model, ModelProvider } from '../entities/model.entity';
import { AdminService } from './admin.service';
import { Request } from 'express';

interface ModelResponse {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  apiModelId: string | null;
  pointsPer1kInputTokens: string;
  pointsPer1kOutputTokens: string;
  isActive: boolean;
  isDefault: boolean;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminModelsController {
  constructor(
    @InjectRepository(Model)
    private readonly modelRepo: Repository<Model>,
    private readonly adminService: AdminService,
  ) {}

  private toResponse(m: Model): ModelResponse {
    return {
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      provider: m.provider,
      apiModelId: m.apiModelId ?? null,
      pointsPer1kInputTokens: String(m.pointsPer1kInputTokens ?? 0),
      pointsPer1kOutputTokens: String(m.pointsPer1kOutputTokens ?? 0),
      isActive: m.isActive,
      isDefault: m.isDefault,
      metadata: m.metadata ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  /**
   * GET /api/admin/models
   * List all models (including inactive), grouped by provider.
   */
  @Get('models')
  async listModels(): Promise<{ models: ModelResponse[] }> {
    const rows = await this.modelRepo.find({
      order: { provider: 'ASC', isDefault: 'DESC', displayName: 'ASC' },
    });
    return { models: rows.map((m) => this.toResponse(m)) };
  }

  /**
   * POST /api/admin/models
   * Create a new model.
   * - name required, unique
   * - provider required
   * - apiModelId optional (the actual model ID for the provider API)
   * - If isDefault=true, auto-unset isDefault on other models in same provider
   */
  @Post('models')
  async createModel(
    @Body()
    body: {
      name: string;
      displayName?: string;
      provider: string;
      apiModelId?: string;
      apiKey?: string;
      pointsPer1kInputTokens?: number;
      pointsPer1kOutputTokens?: number;
      isActive?: boolean;
      isDefault?: boolean;
      metadata?: Record<string, any>;
    },
    @Req() req: Request,
  ): Promise<{ ok: boolean; model: ModelResponse }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    // --- Validation ---
    if (!body.name || !body.name.trim()) {
      throw new HttpException('Name is required', HttpStatus.BAD_REQUEST);
    }
    if (!body.provider || !body.provider.trim()) {
      throw new HttpException('Provider is required', HttpStatus.BAD_REQUEST);
    }

    // Validate provider enum
    const validProviders = Object.values(ModelProvider);
    if (!validProviders.includes(body.provider as ModelProvider)) {
      throw new HttpException(
        `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check name uniqueness
    const existing = await this.modelRepo.findOne({
      where: { name: body.name.trim() },
    });
    if (existing) {
      throw new HttpException(
        'A model with this name already exists',
        HttpStatus.CONFLICT,
      );
    }

    // --- Create model ---
    const model = this.modelRepo.create({
      name: body.name.trim(),
      displayName: body.displayName?.trim() || body.name.trim(),
      provider: body.provider as ModelProvider,
      apiModelId: body.apiModelId?.trim() || null,
      apiKey: body.apiKey?.trim() || null,
      pointsPer1kInputTokens: body.pointsPer1kInputTokens ?? 0,
      pointsPer1kOutputTokens: body.pointsPer1kOutputTokens ?? 0,
      isActive: body.isActive ?? true,
      isDefault: body.isDefault ?? false,
      metadata: body.metadata ?? null,
    });

    // If setting as default, unset other defaults in same provider
    if (model.isDefault) {
      await this.unsetDefaultForProvider(model.provider);
    }

    const saved = await this.modelRepo.save(model);

    // Audit log
    await this.adminService.log(adminUser.id, 'admin_models_create', {
      resource: 'admin/models',
      details: JSON.stringify({ modelId: saved.id, name: saved.name, provider: saved.provider }),
      ipAddress: ip,
    });

    return { ok: true, model: this.toResponse(saved) };
  }

  /**
   * PUT /api/admin/models/:id
   * Full edit model.
   * - name required, unique (if changed)
   * - provider required
   * - If isDefault=true, auto-unset isDefault on other models in same provider
   */
  @Put('models/:id')
  async updateModel(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      displayName?: string;
      provider: string;
      apiModelId?: string;
      apiKey?: string;
      pointsPer1kInputTokens?: number;
      pointsPer1kOutputTokens?: number;
      isActive?: boolean;
      isDefault?: boolean;
      metadata?: Record<string, any>;
    },
    @Req() req: Request,
  ): Promise<{ ok: boolean; model: ModelResponse }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const model = await this.modelRepo.findOne({ where: { id: id.trim() } });
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }

    // --- Validation ---
    if (!body.name || !body.name.trim()) {
      throw new HttpException('Name is required', HttpStatus.BAD_REQUEST);
    }
    if (!body.provider || !body.provider.trim()) {
      throw new HttpException('Provider is required', HttpStatus.BAD_REQUEST);
    }

    // Validate provider enum
    const validProviders = Object.values(ModelProvider);
    if (!validProviders.includes(body.provider as ModelProvider)) {
      throw new HttpException(
        `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check name uniqueness (exclude current model)
    if (body.name.trim() !== model.name) {
      const existing = await this.modelRepo.findOne({
        where: { name: body.name.trim() },
      });
      if (existing) {
        throw new HttpException(
          'A model with this name already exists',
          HttpStatus.CONFLICT,
        );
      }
    }

    // --- Update fields ---
    model.name = body.name.trim();
    model.displayName = body.displayName?.trim() || body.name.trim();
    model.provider = body.provider as ModelProvider;
    model.apiModelId = body.apiModelId?.trim() || null;
    if (body.apiKey !== undefined) {
      model.apiKey = body.apiKey?.trim() || null;
    }
    if (typeof body.pointsPer1kInputTokens === 'number' && body.pointsPer1kInputTokens >= 0) {
      model.pointsPer1kInputTokens = body.pointsPer1kInputTokens as any;
    }
    if (typeof body.pointsPer1kOutputTokens === 'number' && body.pointsPer1kOutputTokens >= 0) {
      model.pointsPer1kOutputTokens = body.pointsPer1kOutputTokens as any;
    }
    if (typeof body.isActive === 'boolean') {
      model.isActive = body.isActive;
    }
    if (body.metadata !== undefined) {
      model.metadata = body.metadata ?? null;
    }

    // Handle isDefault with provider-scoped uniqueness
    if (typeof body.isDefault === 'boolean') {
      model.isDefault = body.isDefault;
      if (body.isDefault) {
        await this.unsetDefaultForProvider(model.provider, model.id);
      }
    }

    const saved = await this.modelRepo.save(model);

    // Audit log
    await this.adminService.log(adminUser.id, 'admin_models_update', {
      resource: 'admin/models',
      details: JSON.stringify({ modelId: id, body }),
      ipAddress: ip,
    });

    return { ok: true, model: this.toResponse(saved) };
  }

  /**
   * PATCH /api/admin/models/:id
   * Partial update (backward compat).
   */
  @Patch('models/:id')
  async patchModel(
    @Param('id') id: string,
    @Body()
    body: {
      displayName?: string;
      isActive?: boolean;
      isDefault?: boolean;
      pointsPer1kInputTokens?: number;
      pointsPer1kOutputTokens?: number;
      apiModelId?: string;
      apiKey?: string;
      metadata?: Record<string, any>;
    },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const model = await this.modelRepo.findOne({ where: { id: id.trim() } });
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }

    if (body.displayName !== undefined) {
      model.displayName = String(body.displayName).trim() || model.displayName;
    }
    if (typeof body.isActive === 'boolean') {
      model.isActive = body.isActive;
    }
    if (typeof body.isDefault === 'boolean') {
      model.isDefault = body.isDefault;
      if (body.isDefault) {
        await this.unsetDefaultForProvider(model.provider, model.id);
      }
    }
    if (typeof body.pointsPer1kInputTokens === 'number' && body.pointsPer1kInputTokens >= 0) {
      model.pointsPer1kInputTokens = body.pointsPer1kInputTokens as any;
    }
    if (typeof body.pointsPer1kOutputTokens === 'number' && body.pointsPer1kOutputTokens >= 0) {
      model.pointsPer1kOutputTokens = body.pointsPer1kOutputTokens as any;
    }
    if (body.apiModelId !== undefined) {
      model.apiModelId = body.apiModelId?.trim() || null;
    }
    if (body.apiKey !== undefined) {
      model.apiKey = body.apiKey?.trim() || null;
    }
    if (body.metadata !== undefined) {
      model.metadata = body.metadata ?? null;
    }

    await this.modelRepo.save(model);

    await this.adminService.log(adminUser.id, 'admin_models_update', {
      resource: 'admin/models',
      details: JSON.stringify({ modelId: id, body }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  /**
   * DELETE /api/admin/models/:id
   * Delete a model. Prevent deletion if model has usage events.
   */
  @Delete('models/:id')
  async deleteModel(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const model = await this.modelRepo.findOne({ where: { id: id.trim() } });
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }

    // Check for usage events referencing this model
    const usageCount = await this.modelRepo.manager
      .getRepository('UsageEvent')
      .count({ where: { model: { id: model.id } } });

    if (usageCount > 0) {
      throw new HttpException(
        'Cannot delete model with existing usage events. Deactivate it instead.',
        HttpStatus.CONFLICT,
      );
    }

    await this.modelRepo.remove(model);

    // Audit log
    await this.adminService.log(adminUser.id, 'admin_models_delete', {
      resource: 'admin/models',
      details: JSON.stringify({ modelId: id, name: model.name, provider: model.provider }),
      ipAddress: ip,
    });

    return { ok: true };
  }

  /**
   * PUT /api/admin/models/:id/toggle
   * Quick toggle active/inactive status.
   */
  @Put('models/:id/toggle')
  async toggleModel(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ ok: boolean; isActive: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const model = await this.modelRepo.findOne({ where: { id: id.trim() } });
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }

    model.isActive = !model.isActive;
    await this.modelRepo.save(model);

    // Audit log
    await this.adminService.log(adminUser.id, 'admin_models_toggle', {
      resource: 'admin/models',
      details: JSON.stringify({ modelId: id, isActive: model.isActive }),
      ipAddress: ip,
    });

    return { ok: true, isActive: model.isActive };
  }

  /**
   * Helper: Unset isDefault on all models in a provider, optionally excluding one model.
   */
  private async unsetDefaultForProvider(provider: ModelProvider, excludeId?: string): Promise<void> {
    const qb = this.modelRepo
      .createQueryBuilder()
      .update(Model)
      .set({ isDefault: false })
      .where('provider = :provider', { provider });

    if (excludeId) {
      qb.andWhere('id != :id', { id: excludeId });
    }

    await qb.execute();
  }
}
