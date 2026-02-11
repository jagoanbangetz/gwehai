import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { PointsService } from './points.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('points')
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('balance')
  async getBalance(@Req() req: Request) {
    const user = req.user as any;
    const balance = await this.pointsService.getBalance(user.id);
    return { balance };
  }

  @Get('ledger')
  async getLedger(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const user = req.user as any;
    return await this.pointsService.getLedgerHistory(
      user.id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }
}
