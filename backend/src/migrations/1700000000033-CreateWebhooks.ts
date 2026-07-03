import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhooks1700000000033 implements MigrationInterface {
  name = 'CreateWebhooks1700000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "label" varchar(128),
        "url" text NOT NULL,
        "secret" varchar(128) NOT NULL,
        "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "isActive" boolean NOT NULL DEFAULT true,
        "failureCount" integer NOT NULL DEFAULT 0,
        "lastDeliveryAt" TIMESTAMP,
        "lastStatusCode" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhooks_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_webhooks_userId" ON "webhooks" ("userId")
    `);

    await queryRunner.query(`
      ALTER TABLE "webhooks"
      ADD CONSTRAINT "FK_webhooks_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "webhooks" DROP CONSTRAINT "FK_webhooks_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_webhooks_userId"`);
    await queryRunner.query(`DROP TABLE "webhooks"`);
  }
}
