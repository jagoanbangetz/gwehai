import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionCollaboration1700000000011 implements MigrationInterface {
  name = 'AddSessionCollaboration1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD COLUMN IF NOT EXISTS "parentConversationId" uuid NULL,
      ADD COLUMN IF NOT EXISTS "agentRole" varchar(64) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_parent"
      FOREIGN KEY ("parentConversationId") REFERENCES "conversations"("id") ON DELETE SET NULL
    `).catch(() => {});
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "FK_conversations_parent"`);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP COLUMN IF EXISTS "parentConversationId",
      DROP COLUMN IF EXISTS "agentRole"
    `);
  }
}
