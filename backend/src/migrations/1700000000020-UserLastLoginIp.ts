import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLastLoginIp1700000000020 implements MigrationInterface {
  name = 'UserLastLoginIp1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "lastLoginIp" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLoginIp"`);
  }
}
