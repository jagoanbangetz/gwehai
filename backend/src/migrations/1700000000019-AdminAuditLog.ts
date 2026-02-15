import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminAuditLog1700000000019 implements MigrationInterface {
  name = 'AdminAuditLog1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "adminUserId" uuid NOT NULL,
        "action" character varying(128) NOT NULL,
        "resource" character varying(512),
        "details" text,
        "ipAddress" inet,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_adminUserId_createdAt" ON "admin_audit_logs" ("adminUserId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_action_createdAt" ON "admin_audit_logs" ("action", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_action_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_adminUserId_createdAt"`);
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
  }
}
