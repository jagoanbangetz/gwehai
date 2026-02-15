import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPlanId1700000000022 implements MigrationInterface {
  name = 'UserPlanId1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "planId" character varying(32) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "planId"
    `);
  }
}
