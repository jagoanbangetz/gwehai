import { Controller, Post, Req, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionsService } from './subscriptions.service';

interface PayPalWebhookEvent {
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
  };
}

@Controller('webhooks')
export class PaypalWebhookController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /**
   * PayPal sends webhook events here. Configure this URL in PayPal Dashboard (Webhooks).
   * No auth - verified via PayPal signature (optional PAYPAL_WEBHOOK_ID).
   */
  @Post('paypal')
  @HttpCode(HttpStatus.NO_CONTENT)
  async paypal(
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
  ): Promise<void> {
    const event = req.body as PayPalWebhookEvent;
    if (!event?.event_type) return;

    const eventType = event?.event_type || '';
    const subscriptionId = event?.resource?.id;

    if (!subscriptionId) return;

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await this.subscriptions.activateFromPayPal(subscriptionId);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await this.subscriptions.cancelFromPayPal(subscriptionId);
        break;
      default:
        break;
    }
  }
}
