import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlanResolutionService } from './plan-resolution.service';
import { PlanUsageService } from './plan-usage.service';
import { getPlanPayload } from '../config/plans.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly planResolution: PlanResolutionService,
    private readonly planUsage: PlanUsageService,
  ) {}

  /**
   * Current user's plan (source of truth: plan-based quota).
   * Returns plan id, marketing copy, limits_summary, and usage for dashboard/UI.
   */
  @Get('me')
  async getMyPlan(@Req() req: Request, @Query('conversation_id') conversationId?: string) {
    const user = req.user as any;
    const planId = await this.planResolution.getUserPlan(user.id);
    const payload = getPlanPayload(planId);
    const usage = await this.planUsage.getUsage(user.id, planId, conversationId || undefined);
    return {
      planId,
      plan: payload.plan,
      limits_summary: payload.limits_summary,
      usage,
    };
  }

  @Get('available')
  async getAvailablePlans() {
    return this.plansService.getAvailablePlans();
  }

  @Get('current')
  async getCurrentPlan(@Req() req: Request) {
    const user = req.user as any;
    return this.plansService.getCurrentPlanForUser(user.id);
  }

  @Get('usage')
  async getUsage(
    @Req() req: Request,
    @Query('days') days?: string,
  ) {
    const user = req.user as any;
    const numDays = days ? parseInt(days, 10) || 30 : 30;
    return this.plansService.getUsageForUser(user.id, numDays);
  }
}

