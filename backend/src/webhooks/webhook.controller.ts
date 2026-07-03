import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebhookService, ALL_WEBHOOK_EVENTS } from './webhook.service';
import type { WebhookEvent } from '../entities/webhook.entity';

interface AuthedRequest {
  user: { id: string; email: string; role?: string };
}

@Controller('api/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /** List available event types (for frontend dropdown). */
  @Get('events')
  listEvents() {
    return { events: ALL_WEBHOOK_EVENTS };
  }

  /** List all webhooks for the authenticated user. */
  @Get()
  async list(@Req() req: AuthedRequest) {
    const webhooks = await this.webhookService.list(req.user.id);
    return {
      webhooks: webhooks.map((w) => ({
        id: w.id,
        label: w.label,
        url: w.url,
        events: w.events,
        isActive: w.isActive,
        failureCount: w.failureCount,
        lastDeliveryAt: w.lastDeliveryAt,
        lastStatusCode: w.lastStatusCode,
        createdAt: w.createdAt,
      })),
    };
  }

  /** Get a single webhook by ID. */
  @Get(':id')
  async getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    const w = await this.webhookService.findOne(req.user.id, id);
    return {
      id: w.id,
      label: w.label,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      failureCount: w.failureCount,
      lastDeliveryAt: w.lastDeliveryAt,
      lastStatusCode: w.lastStatusCode,
      createdAt: w.createdAt,
    };
  }

  /** Create a new webhook subscription. Returns the signing secret (shown once). */
  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Body() body: { url: string; label?: string; events: WebhookEvent[] },
  ) {
    const result = await this.webhookService.create(req.user.id, body);
    return {
      ...result,
      message: 'Webhook created. Store the secret securely — it will not be shown again.',
    };
  }

  /** Update a webhook (url, label, events, isActive). */
  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { url?: string; label?: string; events?: WebhookEvent[]; isActive?: boolean },
  ) {
    const w = await this.webhookService.update(req.user.id, id, body);
    return {
      id: w.id,
      label: w.label,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
    };
  }

  /** Delete a webhook. */
  @Delete(':id')
  @HttpCode(204)
  async delete(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.webhookService.delete(req.user.id, id);
  }

  /** Rotate the signing secret for a webhook. Returns the new secret (shown once). */
  @Post(':id/rotate-secret')
  async rotateSecret(@Req() req: AuthedRequest, @Param('id') id: string) {
    const result = await this.webhookService.rotateSecret(req.user.id, id);
    return {
      ...result,
      message: 'Secret rotated. Store it securely — it will not be shown again.',
    };
  }
}
