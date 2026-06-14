import { MigrationInterface, QueryRunner } from 'typeorm';

export class HacktivityToolNameAction1700000000031 implements MigrationInterface {
  name = 'HacktivityToolNameAction1700000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add toolName column
    await queryRunner.query(`ALTER TABLE "hacktivity" ADD "toolName" character varying(128)`);
    await queryRunner.query(`CREATE INDEX "IDX_hacktivity_toolName" ON "hacktivity" ("toolName")`);

    // Add action column
    await queryRunner.query(`ALTER TABLE "hacktivity" ADD "action" character varying(64)`);

    // Backfill toolName from toolArgs->__tool_name for existing rows
    await queryRunner.query(`
      UPDATE "hacktivity"
      SET "toolName" = "toolArgs"->>'__tool_name'
      WHERE "toolArgs" IS NOT NULL
        AND "toolArgs" ? '__tool_name'
        AND "toolName" IS NULL
    `);

    // Backfill action based on toolName for existing rows
    await queryRunner.query(`
      UPDATE "hacktivity" SET "action" = CASE
        WHEN "toolName" IN ('nmap', 'nuclei', 'sslyze', 'nikto', 'sqlmap', 'whatweb') THEN 'scan'
        WHEN "toolName" IN ('ffuf', 'gobuster', 'dirsearch', 'feroxbuster') THEN 'fuzz'
        WHEN "toolName" IN ('dig', 'whois', 'subfinder', 'amass', 'dnsx') THEN 'enumerate'
        WHEN "toolName" IN ('exec') THEN 'execute'
        WHEN "toolName" IN ('craft_payload') THEN 'craft_payload'
        WHEN "toolName" IN ('browser_action') THEN 'browser'
        WHEN "toolName" IN ('web_search', 'research_search', 'research_browse') THEN 'research'
        WHEN "toolName" IN ('report_finding') THEN 'report'
        WHEN "toolName" IN ('jwt_analyze') THEN 'analyze'
        WHEN "toolName" IN ('memory_search', 'memory_get', 'global_memory') THEN 'memory'
        WHEN "toolName" IN ('write_file', 'write_script') THEN 'write'
        WHEN "toolName" IN ('create_pentest_plan') THEN 'plan'
        WHEN "toolName" IN ('re_verify_findings') THEN 'verify'
        WHEN "toolName" IN ('sessions_spawn', 'sessions_send', 'sessions_list', 'sessions_history', 'session_status') THEN 'session'
        WHEN "toolName" IN ('git_search') THEN 'search'
        WHEN "toolName" IN ('oob_test') THEN 'oob_test'
        WHEN "toolName" IN ('attack_chain') THEN 'attack_chain'
        WHEN "toolName" IN ('update_pentest_phase') THEN 'phase_update'
        WHEN "toolName" IN ('download_skill', 'download_agent', 'add_skill') THEN 'download'
        WHEN "toolName" IN ('agents_list') THEN 'list'
        ELSE NULL
      END
      WHERE "toolName" IS NOT NULL AND "action" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_hacktivity_toolName"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN "action"`);
    await queryRunner.query(`ALTER TABLE "hacktivity" DROP COLUMN "toolName"`);
  }
}
