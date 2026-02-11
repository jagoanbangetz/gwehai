import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeepseekModel1700000000003 implements MigrationInterface {
  name = 'AddDeepseekModel1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "models" (
        "id",
        "name",
        "displayName",
        "provider",
        "pointsPer1kInputTokens",
        "pointsPer1kOutputTokens",
        "isActive",
        "isDefault",
        "metadata"
      )
      VALUES (
        gen_random_uuid(),
        'deepseek/deepseek-chat',
        'DeepSeek Chat',
        'custom',
        2.0,
        4.0,
        true,
        false,
        '{"api_model":"deepseek/deepseek-chat"}'::jsonb
      )
      ON CONFLICT ("name") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "models"
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }
}
