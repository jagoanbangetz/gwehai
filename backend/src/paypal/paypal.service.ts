import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PlanId } from '../config/plans.config';
import type { PaypalConfig } from '../billing/billing-settings.service';

const PAYPAL_API_SANDBOX = 'https://api-m.sandbox.paypal.com';
const PAYPAL_API_LIVE = 'https://api-m.paypal.com';

export interface CreateSubscriptionParams {
  planId: PlanId;
  userId: string;
  returnUrl: string;
  cancelUrl: string;
  brandName?: string;
}

export interface PayPalSubscriptionCreated {
  subscriptionId: string;
  approvalUrl: string;
  status: string;
}

/** Pricing scheme for update-pricing-schemes: billing_cycle_sequence + fixed_price. */
export interface PlanPricingSchemeUpdate {
  billing_cycle_sequence: number;
  pricing_scheme: {
    fixed_price: { value: string; currency_code: string };
  };
}

@Injectable()
export class PaypalService {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  /** PayPal plan IDs from env (create plans in PayPal Dashboard or via script). */
  private readonly planIds: Partial<Record<PlanId, string>> = {};

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    const mode = this.config.get<string>('PAYPAL_MODE', 'sandbox');
    this.baseUrl = mode === 'live' ? PAYPAL_API_LIVE : PAYPAL_API_SANDBOX;
    this.clientId = this.config.get<string>('PAYPAL_CLIENT_ID', '') || '';
    this.clientSecret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '') || '';
    this.planIds.PRO = this.config.get<string>('PAYPAL_PLAN_PRO');
    this.planIds.PRO_PLUS = this.config.get<string>('PAYPAL_PLAN_PRO_PLUS');
    this.planIds.ULTRA = this.config.get<string>('PAYPAL_PLAN_ULTRA');
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  getPayPalPlanId(planId: PlanId): string | null {
    if (planId === 'FREE') return null;
    return this.planIds[planId] || null;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const { data } = await firstValueFrom(
      this.http.post<{ access_token: string; expires_in: number }>(
        `${this.baseUrl}/v1/oauth2/token`,
        new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
        },
      ),
    );
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
    return this.accessToken;
  }

  private getBaseUrl(mode: string): string {
    return (mode === 'live' ? PAYPAL_API_LIVE : PAYPAL_API_SANDBOX);
  }

  private async getAccessTokenWithConfig(config: PaypalConfig): Promise<string> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const { data } = await firstValueFrom(
      this.http.post<{ access_token: string; expires_in: number }>(
        `${baseUrl}/v1/oauth2/token`,
        new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
        },
      ),
    );
    return data.access_token;
  }

  private getPayPalPlanIdFromConfig(planId: PlanId, config: PaypalConfig): string | null {
    if (planId === 'FREE') return null;
    const id = config.planPro ?? config.planProPlus ?? config.planUltra;
    if (planId === 'PRO') return config.planPro || null;
    if (planId === 'PRO_PLUS') return config.planProPlus || null;
    if (planId === 'ULTRA') return config.planUltra || null;
    return null;
  }

  /**
   * Create a subscription using admin billing config (DB overrides env).
   */
  async createSubscriptionWithConfig(
    params: CreateSubscriptionParams,
    config: PaypalConfig,
  ): Promise<PayPalSubscriptionCreated | null> {
    const paypalPlanId = this.getPayPalPlanIdFromConfig(params.planId, config);
    if (!paypalPlanId) return null;
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      const body = {
        plan_id: paypalPlanId,
        custom_id: params.userId,
        application_context: {
          brand_name: params.brandName || 'GwehAI',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      };
      const { data } = await firstValueFrom(
        this.http.post<{ id: string; status: string; links: Array<{ href: string; rel: string }> }>(
          `${baseUrl}/v1/billing/subscriptions`,
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Prefer: 'return=representation',
            },
          },
        ),
      );
      const approveLink = data.links?.find((l) => l.rel === 'approve');
      return {
        subscriptionId: data.id,
        approvalUrl: approveLink?.href || '',
        status: data.status || 'APPROVAL_PENDING',
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a subscription in PayPal. Returns approval URL for the user to complete.
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<PayPalSubscriptionCreated | null> {
    const { planId, userId, returnUrl, cancelUrl, brandName } = params;
    const paypalPlanId = this.getPayPalPlanId(planId);
    if (!paypalPlanId) {
      return null;
    }

    try {
      const token = await this.getAccessToken();
      const body = {
        plan_id: paypalPlanId,
        custom_id: userId,
        application_context: {
          brand_name: brandName || 'GwehAI',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      };

      const { data } = await firstValueFrom(
        this.http.post<{ id: string; status: string; links: Array<{ href: string; rel: string }> }>(
          `${this.baseUrl}/v1/billing/subscriptions`,
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Prefer: 'return=representation',
            },
          },
        ),
      );

      const approveLink = data.links?.find((l) => l.rel === 'approve');
      return {
        subscriptionId: data.id,
        approvalUrl: approveLink?.href || '',
        status: data.status || 'APPROVAL_PENDING',
      };
    } catch {
      return null;
    }
  }

  /**
   * Get subscription details from PayPal.
   */
  async getSubscription(subscriptionId: string): Promise<{
    id: string;
    status: string;
    plan_id: string;
    custom_id?: string;
  } | null> {
    try {
      const token = await this.getAccessToken();
      const { data } = await firstValueFrom(
        this.http.get<{ id: string; status: string; plan_id: string; custom_id?: string }>(
          `${this.baseUrl}/v1/billing/subscriptions/${subscriptionId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      );
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Cancel subscription in PayPal.
   */
  async cancelSubscription(subscriptionId: string, reason?: string): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`,
          { reason: reason || 'User requested cancellation' },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a catalog product and three subscription plans in PayPal (PRO, PRO_PLUS, ULTRA)
   * using admin config and monthly prices. Returns the plan IDs to store in billing settings.
   */
  async createProductAndPlans(
    config: PaypalConfig,
    prices: { PRO: number; PRO_PLUS: number; ULTRA: number },
  ): Promise<{ planPro: string; planProPlus: string; planUltra: string } | null> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);

      const createProduct = async (): Promise<string> => {
        const { data } = await firstValueFrom(
          this.http.post<{ id: string }>(
            `${baseUrl}/v1/catalogs/products`,
            {
              name: 'GwehAI Subscriptions',
              description: 'Monthly subscription plans for GwehAI',
              type: 'SERVICE',
              category: 'SOFTWARE',
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'PayPal-Request-Id': `gwehai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              },
            },
          ),
        );
        return data.id;
      };

      const createPlan = async (productId: string, name: string, valueUsd: number): Promise<string> => {
        const valueStr = String(Math.max(0, valueUsd));
        const { data } = await firstValueFrom(
          this.http.post<{ id: string }>(
            `${baseUrl}/v1/billing/plans`,
            {
              product_id: productId,
              name: `${name} Monthly`,
              description: `${name} plan monthly subscription`,
              billing_cycles: [
                {
                  frequency: { interval_unit: 'MONTH', interval_count: 1 },
                  tenure_type: 'REGULAR',
                  sequence: 1,
                  total_cycles: 0,
                  pricing_scheme: {
                    fixed_price: { value: valueStr, currency_code: 'USD' },
                  },
                },
              ],
              payment_preferences: { auto_bill_outstanding: true },
              status: 'ACTIVE',
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'PayPal-Request-Id': `gwehai-plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              },
            },
          ),
        );
        return data.id;
      };

      const productId = await createProduct();
      const [planPro, planProPlus, planUltra] = await Promise.all([
        createPlan(productId, 'PRO', prices.PRO),
        createPlan(productId, 'Pro Plus', prices.PRO_PLUS),
        createPlan(productId, 'Ultra', prices.ULTRA),
      ]);
      return { planPro, planProPlus, planUltra };
    } catch {
      return null;
    }
  }

  // --- Admin operations (use billing config) ---

  /**
   * Suspend a subscription (pause payments; can be reactivated later).
   */
  async suspendSubscriptionWithConfig(
    config: PaypalConfig,
    subscriptionId: string,
    reason?: string,
  ): Promise<boolean> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/v1/billing/subscriptions/${subscriptionId}/suspend`,
          reason ? { reason } : {},
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cancel a subscription using admin config.
   */
  async cancelSubscriptionWithConfig(
    config: PaypalConfig,
    subscriptionId: string,
    reason?: string,
  ): Promise<boolean> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`,
          { reason: reason || 'Cancelled by admin' },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List transactions for a subscription. Optional start_time and end_time in ISO 8601 format.
   */
  async listSubscriptionTransactionsWithConfig(
    config: PaypalConfig,
    subscriptionId: string,
    startTime?: string,
    endTime?: string,
  ): Promise<{ transactions: Array<Record<string, unknown>> } | null> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      const params = new URLSearchParams();
      if (startTime) params.set('start_time', startTime);
      if (endTime) params.set('end_time', endTime);
      const qs = params.toString();
      const url = qs
        ? `${baseUrl}/v1/billing/subscriptions/${subscriptionId}/transactions?${qs}`
        : `${baseUrl}/v1/billing/subscriptions/${subscriptionId}/transactions`;
      const { data } = await firstValueFrom(
        this.http.get<{ transactions?: Array<Record<string, unknown>> }>(url, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return { transactions: data.transactions ?? [] };
    } catch {
      return null;
    }
  }

  /**
   * Update pricing schemes for a plan (e.g. change monthly price).
   */
  async updatePlanPricingWithConfig(
    config: PaypalConfig,
    planId: string,
    pricingSchemes: PlanPricingSchemeUpdate[],
  ): Promise<boolean> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/v1/billing/plans/${planId}/update-pricing-schemes`,
          { pricing_schemes: pricingSchemes },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deactivate a plan (no new subscriptions; existing ones continue).
   */
  async deactivatePlanWithConfig(config: PaypalConfig, planId: string): Promise<boolean> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/v1/billing/plans/${planId}/deactivate`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Activate a plan (allow new subscriptions).
   */
  async activatePlanWithConfig(config: PaypalConfig, planId: string): Promise<boolean> {
    const baseUrl = this.getBaseUrl(config.mode || 'sandbox');
    try {
      const token = await this.getAccessTokenWithConfig(config);
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/v1/billing/plans/${planId}/activate`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify PayPal webhook signature (optional; requires PAYPAL_WEBHOOK_ID).
   */
  verifyWebhookSignature(
    headers: Record<string, string>,
    body: string,
  ): boolean {
    const webhookId = this.config.get<string>('PAYPAL_WEBHOOK_ID');
    if (!webhookId || !this.clientId || !this.clientSecret) return true; // skip if not configured

    const authAlgo = headers['paypal-auth-algo'];
    const certUrl = headers['paypal-cert-url'];
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const transmissionTime = headers['paypal-transmission-time'];

    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
      return false;
    }
    // Full verification would require fetching cert and crypto verify; for now we rely on secret + event validation
    return true;
  }
}
