import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportConversationAndDetail1700000000009 implements MigrationInterface {
  name = 'AddReportConversationAndDetail1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" ADD COLUMN "conversationId" uuid;`);
    await queryRunner.query(`ALTER TABLE "reports" ADD COLUMN "detail" text;`);
    await queryRunner.query(`
      ALTER TABLE "reports"
        ALTER COLUMN "jobId" DROP NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reports_conversationId" ON "reports" ("conversationId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reports_conversationId";`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN IF EXISTS "conversationId";`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN IF EXISTS "detail";`);
    await queryRunner.query(`ALTER TABLE "reports" ALTER COLUMN "jobId" SET NOT NULL;`);
  }
}
