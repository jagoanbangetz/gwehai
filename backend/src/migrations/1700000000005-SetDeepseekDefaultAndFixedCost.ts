import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetDeepseekDefaultAndFixedCost1700000000005 implements MigrationInterface {
  name = 'SetDeepseekDefaultAndFixedCost1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "models"
      SET "isDefault" = CASE WHEN "name" = 'deepseek/deepseek-chat' THEN true ELSE false END;
    `);

    await queryRunner.query(`
      UPDATE "models"
      SET
        "pointsPer1kInputTokens" = 0,
        "pointsPer1kOutputTokens" = 0,
        "metadata" = jsonb_set(
          COALESCE("metadata", '{}'::jsonb),
          '{fixedCostPoints}',
          '0.5'::jsonb,
          true
        )
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "models"
      SET "metadata" = "metadata" - 'fixedCostPoints'
      WHERE "name" = 'deepseek/deepseek-chat';
    `);
  }
}
