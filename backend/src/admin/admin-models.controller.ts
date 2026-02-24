import {
  Controller,
  Get,
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
import { Model } from '../entities/model.entity';
import { AdminService } from './admin.service';
import { Request } from 'express';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminModelsController {
  constructor(
    @InjectRepository(Model)
    private readonly modelRepo: Repository<Model>,
    private readonly adminService: AdminService,
  ) {}

  @Get('models')
  async listModels(): Promise<{
    models: Array<{
      id: string;
      name: string;
      displayName: string;
      provider: string;
      pointsPer1kInputTokens: string;
      pointsPer1kOutputTokens: string;
      isActive: boolean;
      isDefault: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const rows = await this.modelRepo.find({
      order: { isDefault: 'DESC', displayName: 'ASC' },
    });
    const models = rows.map((m) => ({
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      provider: m.provider,
      pointsPer1kInputTokens: String(m.pointsPer1kInputTokens ?? 0),
      pointsPer1kOutputTokens: String(m.pointsPer1kOutputTokens ?? 0),
      isActive: m.isActive,
      isDefault: m.isDefault,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
    return { models };
  }

  @Patch('models/:id')
  async updateModel(
    @Param('id') id: string,
    @Body()
    body: {
      displayName?: string;
      isActive?: boolean;
      isDefault?: boolean;
      pointsPer1kInputTokens?: number;
      pointsPer1kOutputTokens?: number;
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
        await this.modelRepo
          .createQueryBuilder()
          .update(Model)
          .set({ isDefault: false })
          .where('id != :id', { id: model.id })
          .execute();
      }
    }
    if (typeof body.pointsPer1kInputTokens === 'number' && body.pointsPer1kInputTokens >= 0) {
      model.pointsPer1kInputTokens = body.pointsPer1kInputTokens as any;
    }
    if (typeof body.pointsPer1kOutputTokens === 'number' && body.pointsPer1kOutputTokens >= 0) {
      model.pointsPer1kOutputTokens = body.pointsPer1kOutputTokens as any;
    }

    await this.modelRepo.save(model);

    await this.adminService.log(adminUser.id, 'admin_models_update', {
      resource: 'admin/models',
      details: JSON.stringify({ modelId: id, body }),
      ipAddress: ip,
    });
    return { ok: true };
  }
}
