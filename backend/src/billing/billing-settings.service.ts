import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AdminSetting } from '../entities/admin-setting.entity';
import { PlanId, PLANS, getPlanTiers } from '../config/plans.config';

const BILLING_KEYS = [
  'paypalEnabled',
  'paypalClientId',
  'paypalClientSecret',
  'paypalMode',
  'paypalPlanPro',
  'paypalPlanProPlus',
  'paypalPlanUltra',
  'priceMonthlyPRO',
  'priceMonthlyPRO_PLUS',
  'priceMonthlyULTRA',
] as const;

export interface PaypalConfig {
  clientId: string;
  clientSecret: string;
  mode: string;
  planPro: string | null;
  planProPlus: string | null;
  planUltra: string | null;
}

export interface BillingSettingsPayload {
  paypalEnabled: boolean;
  paypalClientId: string;
  paypalClientSecretMasked: string;
  paypalMode: string;
  paypalPlanPro: string;
  paypalPlanProPlus: string;
  paypalPlanUltra: string;
  priceMonthlyPRO: number;
  priceMonthlyPRO_PLUS: number;
  priceMonthlyULTRA: number;
}

@Injectable()
export class BillingSettingsService {
  constructor(
    @InjectRepository(AdminSetting)
    private readonly settingsRepo: Repository<AdminSetting>,
    private readonly config: ConfigService,
  ) {}

  private getEnv(key: string, defaultValue = ''): string {
    return this.config.get<string>(key, defaultValue) || '';
  }

  private num(v: string | null | undefined, def: number): number {
    if (v == null || v === '') return def;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  }

  private bool(v: string | null | undefined): boolean {
    return v === 'true' || v === '1';
  }

  async getSettingsMap(): Promise<Map<string, string>> {
    const rows = await this.settingsRepo.find({
      where: { key: In([...BILLING_KEYS]) },
    });
    return new Map(rows.map((r) => [r.key, r.value]));
  }

  async getPaypalConfig(): Promise<PaypalConfig | null> {
    const map = await this.getSettingsMap();
    const enabled = this.bool(map.get('paypalEnabled')) || !!this.getEnv('PAYPAL_CLIENT_ID');
    const clientId = (map.get('paypalClientId') ?? this.getEnv('PAYPAL_CLIENT_ID')).trim();
    const clientSecret = (map.get('paypalClientSecret') ?? this.getEnv('PAYPAL_CLIENT_SECRET')).trim();
    if (!enabled || !clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      mode: map.get('paypalMode') ?? this.getEnv('PAYPAL_MODE', 'sandbox'),
      planPro: (map.get('paypalPlanPro') ?? this.getEnv('PAYPAL_PLAN_PRO')) || null,
      planProPlus: (map.get('paypalPlanProPlus') ?? this.getEnv('PAYPAL_PLAN_PRO_PLUS')) || null,
      planUltra: (map.get('paypalPlanUltra') ?? this.getEnv('PAYPAL_PLAN_ULTRA')) || null,
    };
  }

  async isPaypalConfigured(): Promise<boolean> {
    const c = await this.getPaypalConfig();
    return !!c && !!c.clientId && !!c.clientSecret;
  }

  async getPlanPrices(): Promise<Record<PlanId, number>> {
    const map = await this.getSettingsMap();
    return {
      FREE: 0,
      PRO: this.num(map.get('priceMonthlyPRO'), PLANS.PRO.monthlyPriceUsd ?? 19),
      PRO_PLUS: this.num(map.get('priceMonthlyPRO_PLUS'), PLANS.PRO_PLUS.monthlyPriceUsd ?? 49),
      ULTRA: this.num(map.get('priceMonthlyULTRA'), PLANS.ULTRA.monthlyPriceUsd ?? 99),
    };
  }

  async getPlanTiersWithPrices(): Promise<ReturnType<typeof getPlanTiers>> {
    const prices = await this.getPlanPrices();
    const tiers = getPlanTiers();
    return tiers.map((t) => ({
      ...t,
      priceMonthly: prices[t.id] ?? t.priceMonthly,
    }));
  }

  async getBillingSettings(): Promise<BillingSettingsPayload> {
    const map = await this.getSettingsMap();
    const secret = map.get('paypalClientSecret') ?? this.getEnv('PAYPAL_CLIENT_SECRET');
    return {
      paypalEnabled: this.bool(map.get('paypalEnabled')) || !!this.getEnv('PAYPAL_CLIENT_ID'),
      paypalClientId: (map.get('paypalClientId') ?? this.getEnv('PAYPAL_CLIENT_ID')).trim(),
      paypalClientSecretMasked: secret ? '••••••••' : '',
      paypalMode: map.get('paypalMode') ?? this.getEnv('PAYPAL_MODE', 'sandbox'),
      paypalPlanPro: (map.get('paypalPlanPro') ?? this.getEnv('PAYPAL_PLAN_PRO')).trim(),
      paypalPlanProPlus: (map.get('paypalPlanProPlus') ?? this.getEnv('PAYPAL_PLAN_PRO_PLUS')).trim(),
      paypalPlanUltra: (map.get('paypalPlanUltra') ?? this.getEnv('PAYPAL_PLAN_ULTRA')).trim(),
      priceMonthlyPRO: this.num(map.get('priceMonthlyPRO'), PLANS.PRO.monthlyPriceUsd ?? 19),
      priceMonthlyPRO_PLUS: this.num(map.get('priceMonthlyPRO_PLUS'), PLANS.PRO_PLUS.monthlyPriceUsd ?? 49),
      priceMonthlyULTRA: this.num(map.get('priceMonthlyULTRA'), PLANS.ULTRA.monthlyPriceUsd ?? 99),
    };
  }

  async updateBillingSettings(body: {
    paypalEnabled?: boolean;
    paypalClientId?: string;
    paypalClientSecret?: string;
    paypalMode?: string;
    paypalPlanPro?: string;
    paypalPlanProPlus?: string;
    paypalPlanUltra?: string;
    priceMonthlyPRO?: number;
    priceMonthlyPRO_PLUS?: number;
    priceMonthlyULTRA?: number;
  }): Promise<void> {
    const updates: Array<{ key: string; value: string }> = [];
    if (body.paypalEnabled != null) updates.push({ key: 'paypalEnabled', value: String(body.paypalEnabled) });
    if (body.paypalClientId !== undefined) updates.push({ key: 'paypalClientId', value: body.paypalClientId });
    if (body.paypalClientSecret !== undefined && body.paypalClientSecret !== '') updates.push({ key: 'paypalClientSecret', value: body.paypalClientSecret });
    if (body.paypalMode !== undefined) updates.push({ key: 'paypalMode', value: body.paypalMode });
    if (body.paypalPlanPro !== undefined) updates.push({ key: 'paypalPlanPro', value: body.paypalPlanPro });
    if (body.paypalPlanProPlus !== undefined) updates.push({ key: 'paypalPlanProPlus', value: body.paypalPlanProPlus });
    if (body.paypalPlanUltra !== undefined) updates.push({ key: 'paypalPlanUltra', value: body.paypalPlanUltra });
    if (body.priceMonthlyPRO != null) updates.push({ key: 'priceMonthlyPRO', value: String(body.priceMonthlyPRO) });
    if (body.priceMonthlyPRO_PLUS != null) updates.push({ key: 'priceMonthlyPRO_PLUS', value: String(body.priceMonthlyPRO_PLUS) });
    if (body.priceMonthlyULTRA != null) updates.push({ key: 'priceMonthlyULTRA', value: String(body.priceMonthlyULTRA) });

    for (const { key, value } of updates) {
      await this.settingsRepo.upsert(
        { key, value, updatedAt: new Date() },
        { conflictPaths: ['key'] },
      );
    }
  }
}
