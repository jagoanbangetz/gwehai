import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminSettingsAndAbuseEvents1700000000024 implements MigrationInterface {
  name = 'AdminSettingsAndAbuseEvents1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_settings" (
        "key" character varying(128) NOT NULL,
        "value" text,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_settings" PRIMARY KEY ("key")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "abuse_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid,
        "ipAddress" character varying(45),
        "eventType" character varying(64) NOT NULL,
        "requestsPerMin" integer NOT NULL DEFAULT 0,
        "domainsTargeted" integer NOT NULL DEFAULT 0,
        "riskScore" decimal(5,2) NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_abuse_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_abuse_events_userId_createdAt" ON "abuse_events" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abuse_events_ipAddress_createdAt" ON "abuse_events" ("ipAddress", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abuse_events_createdAt" ON "abuse_events" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_abuse_events_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_abuse_events_ipAddress_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_abuse_events_userId_createdAt"`);
    await queryRunner.query(`DROP TABLE "abuse_events"`);
    await queryRunner.query(`DROP TABLE "admin_settings"`);
  }
}
