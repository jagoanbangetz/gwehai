import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

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

