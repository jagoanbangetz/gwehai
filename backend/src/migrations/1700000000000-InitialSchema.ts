import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar UNIQUE,
        "name" varchar,
        "googleId" varchar,
        "avatarUrl" varchar,
        "role" varchar DEFAULT 'user',
        "isActive" boolean DEFAULT true,
        "password_hash" varchar,
        "defaultLanguage" varchar DEFAULT 'en',
        "defaultModelId" uuid,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_users_email" ON "users" ("email");
      CREATE INDEX "IDX_users_googleId" ON "users" ("googleId");
    `);

    // Models table
    await queryRunner.query(`
      CREATE TABLE "models" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar UNIQUE NOT NULL,
        "displayName" varchar NOT NULL,
        "provider" varchar NOT NULL,
        "pointsPer1kInputTokens" decimal(10,2) DEFAULT 0,
        "pointsPer1kOutputTokens" decimal(10,2) DEFAULT 0,
        "isActive" boolean DEFAULT true,
        "isDefault" boolean DEFAULT false,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
    `);

    // Conversations table
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" varchar,
        "modelId" uuid,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_conversations_userId" ON "conversations" ("userId");
      CREATE INDEX "IDX_conversations_createdAt" ON "conversations" ("userId", "createdAt");
    `);

    // Messages table
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
        "role" varchar NOT NULL,
        "content" text,
        "createdAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_messages_conversationId" ON "messages" ("conversationId");
      CREATE INDEX "IDX_messages_createdAt" ON "messages" ("conversationId", "createdAt");
    `);

    // Message parts table
    await queryRunner.query(`
      CREATE TABLE "message_parts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "messageId" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
        "type" varchar DEFAULT 'text',
        "content" text NOT NULL,
        "order" integer DEFAULT 0,
        "metadata" jsonb
      );
      CREATE INDEX "IDX_message_parts_messageId" ON "message_parts" ("messageId", "order");
    `);

    // Files table
    await queryRunner.query(`
      CREATE TABLE "files" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "filename" varchar NOT NULL,
        "originalName" varchar NOT NULL,
        "mimeType" varchar NOT NULL,
        "size" bigint NOT NULL,
        "storagePath" varchar NOT NULL,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_files_userId" ON "files" ("userId", "createdAt");
    `);

    // Message files table
    await queryRunner.query(`
      CREATE TABLE "message_files" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "messageId" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
        "fileId" uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_message_files_messageId" ON "message_files" ("messageId");
      CREATE INDEX "IDX_message_files_fileId" ON "message_files" ("fileId");
    `);

    // Usage events table
    await queryRunner.query(`
      CREATE TABLE "usage_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "modelId" uuid NOT NULL REFERENCES "models"("id"),
        "messageId" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
        "inputTokens" integer DEFAULT 0,
        "outputTokens" integer DEFAULT 0,
        "costPoints" decimal(10,2) NOT NULL,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_usage_events_userId" ON "usage_events" ("userId", "createdAt");
      CREATE INDEX "IDX_usage_events_modelId" ON "usage_events" ("modelId", "createdAt");
    `);

    // Credit packs table
    await queryRunner.query(`
      CREATE TABLE "credit_packs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar UNIQUE,
        "priceCents" integer NOT NULL,
        "points" integer NOT NULL,
        "currency" varchar DEFAULT 'USD',
        "active" boolean DEFAULT true,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
    `);

    // Credit orders table
    await queryRunner.query(`
      CREATE TABLE "credit_orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "creditPackId" uuid NOT NULL REFERENCES "credit_packs"("id"),
        "status" varchar DEFAULT 'pending',
        "provider" varchar NOT NULL,
        "providerPaymentIntentId" varchar,
        "providerChargeId" varchar,
        "idempotencyKey" varchar UNIQUE NOT NULL,
        "amountCents" integer NOT NULL,
        "pointsGranted" integer NOT NULL,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_credit_orders_userId" ON "credit_orders" ("userId", "createdAt");
      CREATE UNIQUE INDEX "IDX_credit_orders_idempotencyKey" ON "credit_orders" ("idempotencyKey");
    `);

    // Point ledger table
    await queryRunner.query(`
      CREATE TABLE "point_ledger" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "deltaPoints" integer NOT NULL,
        "type" varchar NOT NULL,
        "reason" varchar NOT NULL,
        "refTable" varchar,
        "refId" uuid,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_point_ledger_userId" ON "point_ledger" ("userId", "createdAt");
      CREATE INDEX "IDX_point_ledger_ref" ON "point_ledger" ("refTable", "refId");
    `);

    // User point balances table (cached)
    await queryRunner.query(`
      CREATE TABLE "user_point_balances" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "balance" integer DEFAULT 0,
        "version" integer DEFAULT 0,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
      CREATE UNIQUE INDEX "IDX_user_point_balances_userId" ON "user_point_balances" ("userId");
    `);

    // Subscriptions table
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "plan" varchar NOT NULL,
        "status" varchar DEFAULT 'active',
        "monthlyPointsGrant" integer DEFAULT 0,
        "providerSubscriptionId" varchar,
        "providerCustomerId" varchar,
        "currentPeriodStart" timestamp,
        "currentPeriodEnd" timestamp,
        "cancelledAt" timestamp,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
      CREATE INDEX "IDX_subscriptions_userId" ON "subscriptions" ("userId", "status");
    `);

    // Insert default credit pack ($20 => 100 points)
    await queryRunner.query(`
      INSERT INTO "credit_packs" ("id", "priceCents", "points", "currency", "active")
      VALUES (gen_random_uuid(), 2000, 100, 'USD', true);
    `);

    // Insert default models
    await queryRunner.query(`
      INSERT INTO "models" ("id", "name", "displayName", "provider", "pointsPer1kInputTokens", "pointsPer1kOutputTokens", "isActive", "isDefault")
      VALUES 
        (gen_random_uuid(), 'claude-opus-4.5', 'Claude Opus 4.5', 'anthropic', 5.0, 15.0, true, true),
        (gen_random_uuid(), 'chatgpt-5.2', 'ChatGPT 5.2', 'openai', 3.0, 6.0, true, false),
        (gen_random_uuid(), 'gemini-3', 'Gemini 3', 'google', 2.0, 4.0, true, false),
        (gen_random_uuid(), 'grok-4', 'Grok 4', 'custom', 4.0, 8.0, true, false);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_point_balances" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "point_ledger" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_orders" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_packs" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usage_events" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "message_files" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "files" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "message_parts" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "models" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE;`);
  }
}
