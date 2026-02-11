import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationMemoryJson1700000000010 implements MigrationInterface {
  name = 'ConversationMemoryJson1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOld = await queryRunner.hasTable('conversation_memory');
    if (hasOld) {
      await queryRunner.query(`ALTER TABLE "conversation_memory" RENAME TO "conversation_memory_old"`);
    }

    // Create new table: one row per conversation, data as JSON
    await queryRunner.query(`
      CREATE TABLE "conversation_memory" (
        "conversationId" uuid PRIMARY KEY,
        "data" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        CONSTRAINT "FK_conversation_memory_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
    `);

    if (hasOld) {
      await queryRunner.query(`
        INSERT INTO "conversation_memory" ("conversationId", "data", "createdAt", "updatedAt")
        SELECT "conversationId", jsonb_object_agg("path", "content"), MIN("createdAt"), MAX("updatedAt")
        FROM "conversation_memory_old"
        GROUP BY "conversationId"
      `);
      await queryRunner.query(`DROP TABLE "conversation_memory_old"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_memory_old" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" uuid NOT NULL,
        "path" varchar(255) NOT NULL,
        "content" text DEFAULT '',
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        CONSTRAINT "FK_conversation_memory_old_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
    `);
    // Expand json back to rows (one row per key in data)
    await queryRunner.query(`
      INSERT INTO "conversation_memory_old" ("conversationId", "path", "content", "createdAt", "updatedAt")
      SELECT "conversationId", key, value, "createdAt", "updatedAt"
      FROM "conversation_memory",
      LATERAL jsonb_each_text("data")
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_memory"`);
    await queryRunner.query(`ALTER TABLE "conversation_memory_old" RENAME TO "conversation_memory"`);
  }
}
