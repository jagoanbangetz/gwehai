import { MigrationInterface, QueryRunner } from 'typeorm';

export class SignupAbusePrevention1700000000026 implements MigrationInterface {
  name = 'SignupAbusePrevention1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "signupIp" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "signupAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_signups" ADD "signup_ip" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pending_signups" DROP COLUMN "signup_ip"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "signupAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "signupIp"`);
  }
}
