import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../entities/user.entity';
import { AdminSetting } from '../entities/admin-setting.entity';
import { AdminService } from './admin.service';
import { Request } from 'express';

const POLICY_KEYS = [
  'blockLocalhost',
  'blockRfc1918Ip',
  'blockMetadataEndpoints',
  'blockRepeatedTargetScanning',
  'enforcePerPlanToolRestrictions',
  'strictExploitModeProOnly',
  'maxParallelJobsPerPlan',
  'maxSubAgentsPerPlan',
  'maxToolCallsPerJob',
  'maxStepsPerConversation',
];

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPoliciesController {
  constructor(
    @InjectRepository(AdminSetting)
    private readonly settingsRepo: Repository<AdminSetting>,
    private readonly adminService: AdminService,
  ) {}

  @Get('policies')
  async getPolicies() {
    const rows = await this.settingsRepo.find({
      where: { key: In(POLICY_KEYS) },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const bool = (v: string | null | undefined) => v === 'true' || v === '1';
    const num = (v: string | null | undefined, def: number) => (v != null && v !== '' ? parseInt(v, 10) : def);
    return {
      blockLocalhost: bool(map.get('blockLocalhost')),
      blockRfc1918Ip: bool(map.get('blockRfc1918Ip')),
      blockMetadataEndpoints: bool(map.get('blockMetadataEndpoints')),
      blockRepeatedTargetScanning: bool(map.get('blockRepeatedTargetScanning')),
      enforcePerPlanToolRestrictions: bool(map.get('enforcePerPlanToolRestrictions')),
      strictExploitModeProOnly: bool(map.get('strictExploitModeProOnly')),
      maxParallelJobsPerPlan: num(map.get('maxParallelJobsPerPlan'), 2),
      maxSubAgentsPerPlan: num(map.get('maxSubAgentsPerPlan'), 1),
      maxToolCallsPerJob: num(map.get('maxToolCallsPerJob'), 500),
      maxStepsPerConversation: num(map.get('maxStepsPerConversation'), 100),
    };
  }

  @Post('policies/update')
  async updatePolicies(
    @Body()
    body: {
      blockLocalhost?: boolean;
      blockRfc1918Ip?: boolean;
      blockMetadataEndpoints?: boolean;
      blockRepeatedTargetScanning?: boolean;
      enforcePerPlanToolRestrictions?: boolean;
      strictExploitModeProOnly?: boolean;
      maxParallelJobsPerPlan?: number;
      maxSubAgentsPerPlan?: number;
      maxToolCallsPerJob?: number;
      maxStepsPerConversation?: number;
    },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const updates: Record<string, string> = {
      blockLocalhost: body.blockLocalhost != null ? String(body.blockLocalhost) : undefined,
      blockRfc1918Ip: body.blockRfc1918Ip != null ? String(body.blockRfc1918Ip) : undefined,
      blockMetadataEndpoints: body.blockMetadataEndpoints != null ? String(body.blockMetadataEndpoints) : undefined,
      blockRepeatedTargetScanning: body.blockRepeatedTargetScanning != null ? String(body.blockRepeatedTargetScanning) : undefined,
      enforcePerPlanToolRestrictions: body.enforcePerPlanToolRestrictions != null ? String(body.enforcePerPlanToolRestrictions) : undefined,
      strictExploitModeProOnly: body.strictExploitModeProOnly != null ? String(body.strictExploitModeProOnly) : undefined,
      maxParallelJobsPerPlan: body.maxParallelJobsPerPlan != null ? String(body.maxParallelJobsPerPlan) : undefined,
      maxSubAgentsPerPlan: body.maxSubAgentsPerPlan != null ? String(body.maxSubAgentsPerPlan) : undefined,
      maxToolCallsPerJob: body.maxToolCallsPerJob != null ? String(body.maxToolCallsPerJob) : undefined,
      maxStepsPerConversation: body.maxStepsPerConversation != null ? String(body.maxStepsPerConversation) : undefined,
    };
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      await this.settingsRepo.upsert(
        { key, value, updatedAt: new Date() },
        { conflictPaths: ['key'] },
      );
    }
    await this.adminService.log(adminUser.id, 'policies_update', {
      resource: 'admin/policies',
      details: JSON.stringify(body),
      ipAddress: ip,
    });
    return { ok: true };
  }
}
