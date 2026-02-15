import { MigrationInterface, QueryRunner } from 'typeorm';

export class HacktivityTable1700000000016 implements MigrationInterface {
  name = 'HacktivityTable1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "hacktivity" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "conversationId" uuid,
        "domain" character varying(512),
        "aiAction" character varying(128) NOT NULL,
        "result" text,
        "reasoning" text,
        "toolArgs" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hacktivity" PRIMARY KEY ("id"),
        CONSTRAINT "FK_hacktivity_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_hacktivity_userId_createdAt" ON "hacktivity" ("userId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_hacktivity_conversationId_createdAt" ON "hacktivity" ("conversationId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_hacktivity_conversationId_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_hacktivity_userId_createdAt"`);
    await queryRunner.query(`DROP TABLE "hacktivity"`);
  }
}
