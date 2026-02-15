import { MigrationInterface, QueryRunner } from 'typeorm';

export class HacktivityDropAction1700000000018 implements MigrationInterface {
  name = 'HacktivityDropAction1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN IF EXISTS "action"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN IF EXISTS "reasoning"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hacktivity" ADD COLUMN IF NOT EXISTS "action" text`);
  }
}
