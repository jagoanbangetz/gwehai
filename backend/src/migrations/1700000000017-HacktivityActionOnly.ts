import { MigrationInterface, QueryRunner } from 'typeorm';

export class HacktivityActionOnly1700000000017 implements MigrationInterface {
  name = 'HacktivityActionOnly1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN IF EXISTS "aiAction"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" RENAME COLUMN "reasoning" TO "action"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hacktivity" RENAME COLUMN "action" TO "reasoning"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" ADD COLUMN "aiAction" character varying(128)`);
  }
}
