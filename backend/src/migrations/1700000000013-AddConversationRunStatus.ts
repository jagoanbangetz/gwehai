import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationRunStatus1700000000013 implements MigrationInterface {
  name = 'AddConversationRunStatus1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN IF NOT EXISTS "runStatus" varchar(32) NOT NULL DEFAULT 'finished'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP COLUMN IF EXISTS "runStatus"
    `);
  }
}

