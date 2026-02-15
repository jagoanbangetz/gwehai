import { MigrationInterface, QueryRunner } from 'typeorm';

export class VerificationCodeAndPendingSignup1700000000021 implements MigrationInterface {
  name = 'VerificationCodeAndPendingSignup1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "verification_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "code" character varying(256) NOT NULL,
        "purpose" character varying(32) NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verification_codes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_codes_email_purpose" ON "verification_codes" ("email", "purpose")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_codes_expiresAt" ON "verification_codes" ("expiresAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "pending_signups" (
        "email" character varying NOT NULL,
        "name" character varying NOT NULL,
        "password_hash" character varying NOT NULL,
        "otp_code" character varying(8) NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_signups" PRIMARY KEY ("email")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pending_signups"`);
    await queryRunner.query(`DROP INDEX "IDX_verification_codes_expiresAt"`);
    await queryRunner.query(`DROP INDEX "IDX_verification_codes_email_purpose"`);
    await queryRunner.query(`DROP TABLE "verification_codes"`);
  }
}
