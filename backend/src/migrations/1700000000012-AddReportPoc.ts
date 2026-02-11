import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportPoc1700000000012 implements MigrationInterface {
  name = 'AddReportPoc1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" ADD COLUMN "poc" text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN IF EXISTS "poc";`);
  }
}
