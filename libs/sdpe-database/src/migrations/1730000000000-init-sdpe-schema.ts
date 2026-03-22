import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSdpeSchema1730000000000 implements MigrationInterface {
  name = 'InitSdpeSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS sdpe`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS sdpe CASCADE`);
  }
}
