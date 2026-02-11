import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationMemory1700000000008 implements MigrationInterface {
  name = 'AddConversationMemory1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_memory" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" uuid NOT NULL,
        "path" varchar(255) NOT NULL,
        "content" text DEFAULT '',
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        CONSTRAINT "UQ_conversation_memory_conversation_path" UNIQUE ("conversationId", "path"),
        CONSTRAINT "FK_conversation_memory_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "IDX_conversation_memory_conversationId" ON "conversation_memory" ("conversationId");
      CREATE INDEX IF NOT EXISTS "IDX_conversation_memory_conversation_path" ON "conversation_memory" ("conversationId", "path");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_memory"`);
  }
}
