import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSettings1700000000001 implements MigrationInterface {
  name = 'AddUserSettings1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns exist before adding them
    const hasPasswordHash = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password_hash';
    `);

    if (hasPasswordHash.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "users" ADD COLUMN "password_hash" varchar;
      `);
    }

    const hasDefaultLanguage = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'defaultLanguage';
    `);

    if (hasDefaultLanguage.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "users" ADD COLUMN "defaultLanguage" varchar DEFAULT 'en';
      `);
    }

    const hasDefaultModelId = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'defaultModelId';
    `);

    if (hasDefaultModelId.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "users" ADD COLUMN "defaultModelId" uuid;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "defaultLanguage";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "defaultModelId";
    `);
  }
}
