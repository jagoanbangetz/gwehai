import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanQuotaUsage1700000000023 implements MigrationInterface {
  name = 'PlanQuotaUsage1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plan_quota_usage_daily" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "date" date NOT NULL,
        "sessionsStarted" integer NOT NULL DEFAULT 0,
        "tokensUsed" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plan_quota_usage_daily" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_plan_quota_usage_daily_user_date" UNIQUE ("userId", "date")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_plan_quota_usage_daily_user_date" ON "plan_quota_usage_daily" ("userId", "date")
    `);

    await queryRunner.query(`
      CREATE TABLE "plan_quota_usage_session" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "conversationId" uuid NOT NULL,
        "stepsUsed" integer NOT NULL DEFAULT 0,
        "tokensUsed" integer NOT NULL DEFAULT 0,
        "lastStepAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plan_quota_usage_session" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_plan_quota_usage_session_user_conv" UNIQUE ("userId", "conversationId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_plan_quota_usage_session_user_conv" ON "plan_quota_usage_session" ("userId", "conversationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_quota_usage_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_quota_usage_daily"`);
  }
}
