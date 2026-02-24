import { MigrationInterface, QueryRunner } from 'typeorm';

const BILLING_CONFIG_STATE_ID = 'a0000000-0000-0000-0000-000000000001';

export class DynamicBillingConfig1700000000027 implements MigrationInterface {
  name = 'DynamicBillingConfig1700000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "llm_models" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(128) NOT NULL,
        "provider" character varying(32) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "supportsPromptCache" boolean NOT NULL DEFAULT false,
        "priceInPer1M" decimal(12,6) NOT NULL DEFAULT 0,
        "priceOutPer1M" decimal(12,6) NOT NULL DEFAULT 0,
        "priceCachedInPer1M" decimal(12,6) NULL,
        "toolCallFeeUsd" decimal(10,4) NULL,
        "minCostCredits" integer NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_llm_models" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_llm_models_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing_policies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "isActive" boolean NOT NULL DEFAULT true,
        "creditUsd" decimal(10,4) NOT NULL,
        "defaultRetryFactor" decimal(6,2) NOT NULL DEFAULT 1.10,
        "defaultPlatformFeeUsd" decimal(10,4) NOT NULL DEFAULT 0.002,
        "minCreditsPerOp" jsonb NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_policies" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "plan_billing_rules" (
        "planId" character varying(32) NOT NULL,
        "planMarkup" decimal(6,2) NOT NULL DEFAULT 3.0,
        "maxCreditsPerRun" integer NOT NULL DEFAULT 100000,
        "maxTokensPerRun" integer NOT NULL DEFAULT 500000,
        "maxStepsPerRun" integer NOT NULL DEFAULT 500,
        "allowedModels" jsonb NOT NULL,
        "opMultipliers" jsonb NOT NULL,
        "modelMultiplierOverrides" jsonb NULL,
        "opRetryFactorOverrides" jsonb NULL,
        "opPlatformFeeOverrides" jsonb NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plan_billing_rules" PRIMARY KEY ("planId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing_config_state" (
        "id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_config_state" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `INSERT INTO "billing_config_state" ("id", "version", "updatedAt") VALUES ('${BILLING_CONFIG_STATE_ID}', 1, now())`,
    );

    await queryRunner.query(`
      INSERT INTO "llm_models" ("key", "provider", "enabled", "supportsPromptCache", "priceInPer1M", "priceOutPer1M", "priceCachedInPer1M", "toolCallFeeUsd", "minCostCredits")
      VALUES
        ('deepseek-chat', 'deepseek', true, false, 0.14, 0.28, NULL, NULL, NULL),
        ('gpt-4o', 'openai', false, false, 2.50, 10.00, NULL, NULL, NULL),
        ('claude-sonnet', 'anthropic', false, false, 3.00, 15.00, NULL, NULL, NULL)
    `);

    await queryRunner.query(`
      INSERT INTO "billing_policies" ("isActive", "creditUsd", "defaultRetryFactor", "defaultPlatformFeeUsd", "minCreditsPerOp")
      VALUES (true, 0.01, 1.10, 0.002, '{"chat_turn":1,"agent_step":2,"scan_start":10,"report":20}')
    `);

    const planRules = [
      { planId: 'FREE', planMarkup: 3.0, maxCreditsPerRun: 5000, maxTokensPerRun: 50000, maxStepsPerRun: 100, allowedModels: '["deepseek-chat"]', opMultipliers: '{"chat_turn":1.0,"agent_step":1.8,"multi_agent":2.5,"exploit_refine":3.5}' },
      { planId: 'PRO', planMarkup: 3.2, maxCreditsPerRun: 50000, maxTokensPerRun: 300000, maxStepsPerRun: 300, allowedModels: '["deepseek-chat","gpt-4o"]', opMultipliers: '{"chat_turn":1.0,"agent_step":1.8,"multi_agent":2.5,"exploit_refine":3.5}' },
      { planId: 'PRO_PLUS', planMarkup: 3.4, maxCreditsPerRun: 200000, maxTokensPerRun: 1000000, maxStepsPerRun: 500, allowedModels: '["deepseek-chat","gpt-4o","claude-sonnet"]', opMultipliers: '{"chat_turn":1.0,"agent_step":1.8,"multi_agent":2.5,"exploit_refine":3.5}' },
      { planId: 'ULTRA', planMarkup: 3.6, maxCreditsPerRun: 1000000, maxTokensPerRun: 5000000, maxStepsPerRun: 1000, allowedModels: '["deepseek-chat","gpt-4o","claude-sonnet"]', opMultipliers: '{"chat_turn":1.0,"agent_step":1.8,"multi_agent":2.5,"exploit_refine":3.5}' },
    ];
    for (const r of planRules) {
      await queryRunner.query(
        `INSERT INTO "plan_billing_rules" ("planId", "planMarkup", "maxCreditsPerRun", "maxTokensPerRun", "maxStepsPerRun", "allowedModels", "opMultipliers", "modelMultiplierOverrides", "updatedAt")
         VALUES ('${r.planId}', ${r.planMarkup}, ${r.maxCreditsPerRun}, ${r.maxTokensPerRun}, ${r.maxStepsPerRun}, '${r.allowedModels}'::jsonb, '${r.opMultipliers}'::jsonb, NULL, now())`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "pentest_jobs"
      ADD COLUMN IF NOT EXISTS "billingConfigVersion" integer NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pentest_jobs" DROP COLUMN IF EXISTS "billingConfigVersion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_billing_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_config_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "llm_models"`);
  }
}
