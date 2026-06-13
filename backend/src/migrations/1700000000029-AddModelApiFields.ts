import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModelApiFields1700000000029 implements MigrationInterface {
  name = 'AddModelApiFields1700000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add apiModelId column (nullable — the actual model ID sent to provider API)
    await queryRunner.query(`
      ALTER TABLE "models"
      ADD COLUMN "apiModelId" varchar NULL
    `);

    // Add apiKey column (nullable — provider API key, should be encrypted at rest)
    await queryRunner.query(`
      ALTER TABLE "models"
      ADD COLUMN "apiKey" text NULL
    `);

    // Add DEEPSEEK to the ModelProvider enum if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'models_provider_enum' AND e.enumlabel = 'deepseek') THEN
          ALTER TYPE "models_provider_enum" ADD VALUE 'deepseek';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "apiKey"`);
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "apiModelId"`);
    // Note: cannot remove enum values in PostgreSQL without recreating the type
  }
}
