import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { Plan } from '../entities/plan.entity';
import { AdminService } from './admin.service';
import { Request } from 'express';

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPlansController {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    private readonly adminService: AdminService,
  ) {}

  /**
   * GET /admin/plans — list semua plans (termasuk inactive)
   */
  @Get()
  async listPlans() {
    const plans = await this.planRepo.find({
      order: { monthlyPriceUsd: 'ASC', createdAt: 'DESC' },
    });
    return {
      plans: plans.map((p) => this.formatPlan(p)),
      total: plans.length,
    };
  }

  /**
   * GET /admin/plans/:id — detail plan by id
   */
  @Get(':id')
  async getPlan(@Param('id') id: string) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
    }
    return { plan: this.formatPlan(plan) };
  }

  /**
   * POST /admin/plans — create plan baru
   */
  @Post()
  async createPlan(
    @Body()
    body: {
      code?: string;
      name?: string;
      description?: string;
      monthlyPriceUsd?: number;
      pointsIncluded?: number;
      reportsIncluded?: number;
      isRecurring?: boolean;
      features?: string[];
      modelAccess?: string[];
      scanLimit?: number;
      metadata?: Record<string, any>;
    },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    // Validation
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpException('name is required', HttpStatus.BAD_REQUEST);
    }
    if (!body.code || typeof body.code !== 'string' || !body.code.trim()) {
      throw new HttpException('code is required (unique identifier, e.g. "PRO", "BUSINESS")', HttpStatus.BAD_REQUEST);
    }

    // Check unique code
    const existing = await this.planRepo.findOne({ where: { code: body.code.trim().toUpperCase() } });
    if (existing) {
      throw new HttpException(`Plan with code "${body.code}" already exists`, HttpStatus.CONFLICT);
    }

    // Build metadata
    const metadata: Record<string, any> = { ...(body.metadata || {}) };
    if (body.features) metadata.features = body.features;
    if (body.modelAccess) metadata.modelAccess = body.modelAccess;
    if (body.scanLimit !== undefined) metadata.scanLimit = body.scanLimit;

    const plan = this.planRepo.create({
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      description: body.description?.trim() || null,
      monthlyPriceUsd: body.monthlyPriceUsd ?? 0,
      pointsIncluded: body.pointsIncluded ?? null,
      reportsIncluded: body.reportsIncluded ?? null,
      isRecurring: body.isRecurring ?? false,
      isActive: true,
      metadata,
    });

    const saved = await this.planRepo.save(plan);

    await this.adminService.log(adminUser.id, 'admin_plan_create', {
      resource: 'admin/plans',
      details: JSON.stringify({ planId: saved.id, code: saved.code, name: saved.name }),
      ipAddress: ip,
    });

    return { ok: true, plan: this.formatPlan(saved) };
  }

  /**
   * PUT /admin/plans/:id — edit plan
   */
  @Put(':id')
  async updatePlan(
    @Param('id') id: string,
    @Body()
    body: {
      code?: string;
      name?: string;
      description?: string;
      monthlyPriceUsd?: number;
      pointsIncluded?: number;
      reportsIncluded?: number;
      isRecurring?: boolean;
      isActive?: boolean;
      features?: string[];
      modelAccess?: string[];
      scanLimit?: number;
      metadata?: Record<string, any>;
    },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
    }

    // Check unique code if changing
    if (body.code && body.code.trim().toUpperCase() !== plan.code) {
      const dup = await this.planRepo.findOne({ where: { code: body.code.trim().toUpperCase() } });
      if (dup) {
        throw new HttpException(`Plan with code "${body.code}" already exists`, HttpStatus.CONFLICT);
      }
      plan.code = body.code.trim().toUpperCase();
    }

    if (body.name !== undefined) plan.name = body.name.trim();
    if (body.description !== undefined) plan.description = body.description?.trim() || null;
    if (body.monthlyPriceUsd !== undefined) plan.monthlyPriceUsd = body.monthlyPriceUsd;
    if (body.pointsIncluded !== undefined) plan.pointsIncluded = body.pointsIncluded;
    if (body.reportsIncluded !== undefined) plan.reportsIncluded = body.reportsIncluded;
    if (body.isRecurring !== undefined) plan.isRecurring = body.isRecurring;
    if (body.isActive !== undefined) plan.isActive = body.isActive;

    // Merge metadata
    const metadata: Record<string, any> = { ...(plan.metadata || {}), ...(body.metadata || {}) };
    if (body.features !== undefined) metadata.features = body.features;
    if (body.modelAccess !== undefined) metadata.modelAccess = body.modelAccess;
    if (body.scanLimit !== undefined) metadata.scanLimit = body.scanLimit;
    plan.metadata = metadata;

    const saved = await this.planRepo.save(plan);

    await this.adminService.log(adminUser.id, 'admin_plan_update', {
      resource: 'admin/plans',
      details: JSON.stringify({ planId: id, changes: body }),
      ipAddress: ip,
    });

    return { ok: true, plan: this.formatPlan(saved) };
  }

  /**
   * DELETE /admin/plans/:id — soft delete (set isActive = false)
   */
  @Delete(':id')
  async deletePlan(@Param('id') id: string, @Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new HttpException('Plan not found', HttpStatus.NOT_FOUND);
    }

    plan.isActive = false;
    await this.planRepo.save(plan);

    await this.adminService.log(adminUser.id, 'admin_plan_delete', {
      resource: 'admin/plans',
      details: JSON.stringify({ planId: id, code: plan.code, name: plan.name }),
      ipAddress: ip,
    });

    return { ok: true, message: `Plan "${plan.name}" deactivated (soft delete)` };
  }

  /**
   * Format plan untuk response — extract metadata fields ke top-level
   */
  private formatPlan(plan: Plan) {
    const meta = (plan.metadata || {}) as Record<string, any>;
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthlyPriceUsd: plan.monthlyPriceUsd != null ? String(plan.monthlyPriceUsd) : null,
      pointsIncluded: plan.pointsIncluded,
      reportsIncluded: plan.reportsIncluded,
      isRecurring: plan.isRecurring,
      isActive: plan.isActive,
      features: meta.features || [],
      modelAccess: meta.modelAccess || [],
      scanLimit: meta.scanLimit ?? plan.pointsIncluded ?? null,
      metadata: meta,
      createdAt: plan.createdAt?.toISOString?.() ?? plan.createdAt,
      updatedAt: plan.updatedAt?.toISOString?.() ?? plan.updatedAt,
    };
  }
}
