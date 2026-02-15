import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('packs')
  async getCreditPacks() {
    return await this.paymentsService.getCreditPacks();
  }

  @Post('orders')
  async createOrder(
    @Req() req: Request,
    @Body() body: { creditPackId: string; idempotencyKey?: string },
  ) {
    const user = req.user as any;
    return await this.paymentsService.createCreditOrder(
      user.id,
      body.creditPackId,
      body.idempotencyKey,
    );
  }

  @Get('orders')
  async getMyOrders(@Req() req: Request) {
    const user = req.user as any;
    return await this.paymentsService.getUserOrders(user.id);
  }
}
