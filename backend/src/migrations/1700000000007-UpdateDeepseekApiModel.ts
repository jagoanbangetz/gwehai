import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDeepseekApiModel1700000000007 implements MigrationInterface {
  name = 'UpdateDeepseekApiModel1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "models"
      SET "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{api_model}',
        '"deepseek-chat"',
        true
      )
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "models"
      SET "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{api_model}',
        '"deepseek/deepseek-chat"',
        true
      )
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }
}
