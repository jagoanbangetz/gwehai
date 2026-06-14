import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add toolName, action, and parsedResult columns to hacktivity table.
 *
 * - toolName: which tool was executed (nmap, sqlmap, ffuf, nuclei, gobuster, nikto)
 * - action: action type (scan, enumerate, fuzz, etc.)
 * - parsedResult: structured JSON output from tool output parser
 */
export class HacktivityToolParsedResult1700000000032 implements MigrationInterface {
  name = 'HacktivityToolParsedResult1700000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add toolName column
    await queryRunner.query(`
      ALTER TABLE "hacktivity"
      ADD COLUMN IF NOT EXISTS "toolName" character varying(128)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_hacktivity_toolName"
      ON "hacktivity" ("toolName")
    `);

    // Add action column
    await queryRunner.query(`
      ALTER TABLE "hacktivity"
      ADD COLUMN IF NOT EXISTS "action" character varying(64)
    `);

    // Add parsedResult column (jsonb)
    await queryRunner.query(`
      ALTER TABLE "hacktivity"
      ADD COLUMN IF NOT EXISTS "parsedResult" jsonb
    `);

    console.log('[HacktivityToolParsedResult] Added toolName, action, parsedResult columns');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN IF EXISTS "parsedResult"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN IF EXISTS "action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_hacktivity_toolName"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN IF EXISTS "toolName"`);
    console.log('[HacktivityToolParsedResult] Removed toolName, action, parsedResult columns');
  }
}
