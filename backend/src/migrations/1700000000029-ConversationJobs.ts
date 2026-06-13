import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationJobs1700000000029 implements MigrationInterface {
  name = 'ConversationJobs1700000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // conversation_jobs: tracks active/finished jobs per conversation
    await queryRunner.query(`
      CREATE TABLE "conversation_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversationId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'running',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conversation_jobs_jobId" UNIQUE ("jobId")
      )
    `);

    // FK to conversations
    await queryRunner.query(`
      ALTER TABLE "conversation_jobs"
      ADD CONSTRAINT "FK_conversation_jobs_conversation"
      FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE
    `);

    // Unique partial index: only 1 active (running) job per conversation
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_conversation_jobs_active"
      ON "conversation_jobs" ("conversationId")
      WHERE "status" = 'running'
    `);

    // Index for job lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_jobs_jobId"
      ON "conversation_jobs" ("jobId")
    `);

    // conversation_events: stores agent events per job for replay
    await queryRunner.query(`
      CREATE TABLE "conversation_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "jobId" uuid NOT NULL,
        "seq" integer NOT NULL DEFAULT 0,
        "eventType" varchar(64) NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ts" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_events" PRIMARY KEY ("id")
      )
    `);

    // FK to conversation_jobs
    await queryRunner.query(`
      ALTER TABLE "conversation_events"
      ADD CONSTRAINT "FK_conversation_events_job"
      FOREIGN KEY ("jobId") REFERENCES "conversation_jobs"("jobId") ON DELETE CASCADE
    `);

    // Index for efficient event replay (job + seq)
    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_events_job_seq"
      ON "conversation_events" ("jobId", "seq")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_events_job_seq"`);
    await queryRunner.query(`ALTER TABLE "conversation_events" DROP CONSTRAINT IF EXISTS "FK_conversation_events_job"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_events"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_jobs_jobId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_jobs_active"`);
    await queryRunner.query(`ALTER TABLE "conversation_jobs" DROP CONSTRAINT IF EXISTS "FK_conversation_jobs_conversation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_jobs"`);
  }
}
