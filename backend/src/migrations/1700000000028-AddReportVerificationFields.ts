import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportVerificationFields1700000000028 implements MigrationInterface {
  name = 'AddReportVerificationFields1700000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add verification_status column with default PENDING
    await queryRunner.query(`
      ALTER TABLE "reports" 
      ADD COLUMN "verificationStatus" varchar(16) NOT NULL DEFAULT 'PENDING'
    `);

    // Add verified_at timestamp (nullable)
    await queryRunner.query(`
      ALTER TABLE "reports" 
      ADD COLUMN "verifiedAt" TIMESTAMPTZ
    `);

    // Add verification_attempts counter
    await queryRunner.query(`
      ALTER TABLE "reports" 
      ADD COLUMN "verificationAttempts" int NOT NULL DEFAULT 0
    `);

    // Create index for efficient querying of pending findings
    await queryRunner.query(`
      CREATE INDEX "IDX_reports_verification_status" 
      ON "reports" ("verificationStatus") 
      WHERE "verificationStatus" IN ('PENDING', 'FAILED')
    `);

    // Create index for finding re-verification queries
    await queryRunner.query(`
      CREATE INDEX "IDX_reports_user_conversation_verification" 
      ON "reports" ("userId", "conversationId", "verificationStatus")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reports_user_conversation_verification"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reports_verification_status"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "verificationAttempts"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "verifiedAt"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "verificationStatus"`);
  }
}
