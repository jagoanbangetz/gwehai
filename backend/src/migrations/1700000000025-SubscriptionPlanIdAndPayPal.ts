import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionPlanIdAndPayPal1700000000025 implements MigrationInterface {
  name = 'SubscriptionPlanIdAndPayPal1700000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "planId" character varying(32) NULL
    `);
    /* subscriptions uses varchar for plan/status (no enums in this schema) */
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "planId"
    `);
  }
}
