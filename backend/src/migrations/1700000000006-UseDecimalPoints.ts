import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseDecimalPoints1700000000006 implements MigrationInterface {
  name = 'UseDecimalPoints1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "point_ledger"
      ALTER COLUMN "deltaPoints"
      TYPE decimal(10,2)
      USING "deltaPoints"::decimal;
    `);

    await queryRunner.query(`
      ALTER TABLE "user_point_balances"
      ALTER COLUMN "balance"
      TYPE decimal(10,2)
      USING "balance"::decimal;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_point_balances"
      ALTER COLUMN "balance"
      TYPE integer
      USING ROUND("balance")::integer;
    `);

    await queryRunner.query(`
      ALTER TABLE "point_ledger"
      ALTER COLUMN "deltaPoints"
      TYPE integer
      USING ROUND("deltaPoints")::integer;
    `);
  }
}
