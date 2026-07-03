import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes } from 'crypto';
import { Webhook, WebhookEvent } from '../entities/webhook.entity';

/** All valid webhook event types. */
export const ALL_WEBHOOK_EVENTS: WebhookEvent[] = [
  'pentest.completed',
  'pentest.failed',
  'finding.critical',
  'finding.high',
];

/** Max consecutive failures before auto-disabling a webhook. */
const MAX_FAILURES_BEFORE_DISABLE = 10;

/** HTTP timeout for webhook delivery (ms). */
const DELIVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
  ) {}

  // ─── CRUD ───────────────────────────────────────────────────────

  async create(
    userId: string,
    dto: { url: string; label?: string; events: WebhookEvent[] },
  ): Promise<{ id: string; url: string; secret: string; events: WebhookEvent[] }> {
    if (!dto.url || !dto.url.startsWith('http')) {
      throw new BadRequestException('url must start with http:// or https://');
    }
    if (!dto.events?.length) {
      throw new BadRequestException('At least one event type is required.');
    }
    const invalid = dto.events.filter((e) => !ALL_WEBHOOK_EVENTS.includes(e));
    if (invalid.length) {
      throw new BadRequestException(`Invalid event types: ${invalid.join(', ')}`);
    }

    const secret = randomBytes(32).toString('hex');
    const webhook = this.webhookRepo.create({
      userId,
      url: dto.url.trim(),
      label: dto.label?.trim() ?? null,
      secret,
      events: dto.events,
      isActive: true,
    });
    const saved = await this.webhookRepo.save(webhook);
    this.logger.log(`Webhook created: ${saved.id} for user ${userId} → ${saved.url}`);
    return { id: saved.id, url: saved.url, secret, events: saved.events };
  }

  async list(userId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<Webhook> {
    const wh = await this.webhookRepo.findOne({ where: { id, userId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    return wh;
  }

  async update(
    userId: string,
    id: string,
    dto: { url?: string; label?: string; events?: WebhookEvent[]; isActive?: boolean },
  ): Promise<Webhook> {
    const wh = await this.findOne(userId, id);
    if (dto.url !== undefined) {
      if (!dto.url.startsWith('http')) throw new BadRequestException('url must start with http:// or https://');
      wh.url = dto.url.trim();
    }
    if (dto.label !== undefined) wh.label = dto.label?.trim() ?? null;
    if (dto.events !== undefined) {
      if (!dto.events.length) throw new BadRequestException('At least one event type is required.');
      wh.events = dto.events;
    }
    if (dto.isActive !== undefined) wh.isActive = dto.isActive;
    return this.webhookRepo.save(wh);
  }

  async delete(userId: string, id: string): Promise<void> {
    const wh = await this.findOne(userId, id);
    await this.webhookRepo.remove(wh);
  }

  /** Regenerate the signing secret for a webhook. Returns the new secret. */
  async rotateSecret(userId: string, id: string): Promise<{ secret: string }> {
    const wh = await this.findOne(userId, id);
    wh.secret = randomBytes(32).toString('hex');
    await this.webhookRepo.save(wh);
    return { secret: wh.secret };
  }

  // ─── Delivery ───────────────────────────────────────────────────

  /**
   * Fire webhooks for a given event type + user.
   * Payload is signed with HMAC-SHA256 using each webhook's secret.
   * Delivery is fire-and-forget (non-blocking to the caller).
   */
  async fireEvent(
    userId: string,
    event: WebhookEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      const webhooks = await this.webhookRepo.find({
        where: { userId, isActive: true },
      });
      const matching = webhooks.filter((wh) => wh.events.includes(event));
      if (matching.length === 0) return;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      // Fire all in parallel, don't await — fire-and-forget
      for (const wh of matching) {
        this.deliver(wh, body).catch((err) =>
          this.logger.error(`Webhook delivery failed for ${wh.id}: ${err?.message}`),
        );
      }
    } catch (err: any) {
      this.logger.error(`fireEvent error for user ${userId}, event ${event}: ${err?.message}`);
    }
  }

  /**
   * Deliver a single webhook POST with HMAC-SHA256 signature.
   * Updates failure count and auto-disables after MAX_FAILURES.
   */
  private async deliver(wh: Webhook, body: string): Promise<void> {
    const signature = createHmac('sha256', wh.secret).update(body).digest('hex');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Id': wh.id,
      'User-Agent': 'GwehAI-Webhooks/1.0',
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      const res = await fetch(wh.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      wh.lastDeliveryAt = new Date();
      wh.lastStatusCode = res.status;

      if (res.ok) {
        wh.failureCount = 0;
      } else {
        wh.failureCount++;
        this.logger.warn(
          `Webhook ${wh.id} delivery returned ${res.status} (failures: ${wh.failureCount})`,
        );
        if (wh.failureCount >= MAX_FAILURES_BEFORE_DISABLE) {
          wh.isActive = false;
          this.logger.warn(`Webhook ${wh.id} auto-disabled after ${MAX_FAILURES_BEFORE_DISABLE} failures`);
        }
      }
    } catch (err: any) {
      wh.lastDeliveryAt = new Date();
      wh.failureCount++;
      wh.lastStatusCode = null;
      this.logger.warn(
        `Webhook ${wh.id} delivery error: ${err?.message} (failures: ${wh.failureCount})`,
      );
      if (wh.failureCount >= MAX_FAILURES_BEFORE_DISABLE) {
        wh.isActive = false;
        this.logger.warn(`Webhook ${wh.id} auto-disabled after ${MAX_FAILURES_BEFORE_DISABLE} failures`);
      }
    }

    // Persist delivery status (best-effort, don't throw)
    try {
      await this.webhookRepo.save(wh);
    } catch (err: any) {
      this.logger.error(`Failed to update webhook ${wh.id} delivery status: ${err?.message}`);
    }
  }

  // ─── Signature Verification Helper ──────────────────────────────

  /**
   * Verify an incoming webhook signature (for consumers receiving GwehAI webhooks).
   * Exported as a static utility so frontend/third-party code can verify.
   */
  static verifySignature(body: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    return signature === `sha256=${expected}`;
  }
}
