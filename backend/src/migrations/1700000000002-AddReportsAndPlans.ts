import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportsAndPlans1700000000002 implements MigrationInterface {
  name = 'AddReportsAndPlans1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar UNIQUE NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "monthlyPriceUsd" decimal(10,2),
        "pointsIncluded" integer,
        "reportsIncluded" integer,
        "isRecurring" boolean DEFAULT false,
        "isActive" boolean DEFAULT true,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "IDX_plans_code" ON "plans" ("code");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "planId" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'active',
        "startedAt" timestamptz NOT NULL,
        "expiresAt" timestamptz,
        "cancelledAt" timestamptz,
        "pointsGranted" integer DEFAULT 0,
        "pointsUsed" integer DEFAULT 0,
        "reportsGenerated" integer DEFAULT 0,
        "messagesSent" integer DEFAULT 0,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        CONSTRAINT "FK_user_plans_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_plans_plan" FOREIGN KEY ("planId") REFERENCES "plans" ("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "IDX_user_plans_user_status" ON "user_plans" ("userId", "status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plan_usage_daily" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "planId" uuid NOT NULL,
        "date" date NOT NULL,
        "pointsUsed" integer DEFAULT 0,
        "messagesSent" integer DEFAULT 0,
        "reportsGenerated" integer DEFAULT 0,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        CONSTRAINT "FK_plan_usage_daily_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_plan_usage_daily_plan" FOREIGN KEY ("planId") REFERENCES "plans" ("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "IDX_plan_usage_daily_user_date" ON "plan_usage_daily" ("userId", "date");
      CREATE INDEX IF NOT EXISTS "IDX_plan_usage_daily_plan_date" ON "plan_usage_daily" ("planId", "date");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "jobId" varchar UNIQUE NOT NULL,
        "target" varchar,
        "status" varchar NOT NULL DEFAULT 'queued',
        "fileUrl" varchar,
        "metadata" jsonb,
        "startedAt" timestamptz,
        "finishedAt" timestamptz,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        CONSTRAINT "FK_reports_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "IDX_reports_user_createdAt" ON "reports" ("userId", "createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reports" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_usage_daily" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_plans" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plans" CASCADE;`);
  }
}

