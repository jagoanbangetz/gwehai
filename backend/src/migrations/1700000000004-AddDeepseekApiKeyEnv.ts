import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeepseekApiKeyEnv1700000000004 implements MigrationInterface {
  name = 'AddDeepseekApiKeyEnv1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "models"
      SET "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{apiKeyEnv}',
        '"DEEPSEEK_API_KEY"',
        true
      )
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "models"
      SET "metadata" = "metadata" - 'apiKeyEnv'
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }
}
