import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clean "Error: command is required" noise from hacktivity backlog.
 *
 * Root cause: before the isNoiseEntry() filter was added to hacktivity.service.ts,
 * raw error messages like "Error: command is required" were saved to the DB.
 * This migration deletes those entries.
 *
 * Matches:
 * - "Error: command is required" (exact noise from empty exec calls)
 * - "Error: exec requires a non-empty command" (variant)
 * - Any plain-text result starting with "Error:" that is NOT JSON
 */
export class CleanHacktivityNoise1700000000030 implements MigrationInterface {
  name = 'CleanHacktivityNoise1700000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Count noise entries first for logging
    const countResult = await queryRunner.query(`
      SELECT COUNT(*) as count FROM hacktivity
      WHERE result IS NOT NULL
        AND result NOT LIKE '{%'
        AND result ~* '^Error:\\s'
    `);
    const noiseCount = countResult[0]?.count ?? 0;
    console.log(`[CleanHacktivityNoise] Found ${noiseCount} noise entries to clean`);

    // Delete noise entries: plain-text starting with "Error:" (not JSON)
    const deleteResult = await queryRunner.query(`
      DELETE FROM hacktivity
      WHERE result IS NOT NULL
        AND result NOT LIKE '{%'
        AND result ~* '^Error:\\s'
    `);
    console.log(`[CleanHacktivityNoise] Deleted ${deleteResult[1] ?? noiseCount} noise entries`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: deleted noise entries cannot be restored (they had no useful data)
    console.log('[CleanHacktivityNoise] Down migration: no-op (noise entries were worthless)');
  }
}
