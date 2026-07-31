import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1785532995857 implements MigrationInterface {
    name = 'InitialSchema1785532995857';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // TypeORM bunu bağlantı kurarken otomatik oluşturuyor, ama migration
        // başka bir yolla (farklı bir araç/DataSource) çalıştırılırsa
        // uuid_generate_v4() bu extension olmadan başarısız olur.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(
            `CREATE TABLE "flag_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "flag_id" uuid NOT NULL, "version" integer NOT NULL, "snapshot" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_by" character varying(256) NOT NULL, CONSTRAINT "UQ_d994284739a5b9037c9448608e3" UNIQUE ("flag_id", "version"), CONSTRAINT "PK_1e7baf27f1a5bbfa343ed1b705e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_key" character varying(256) NOT NULL, "flag_key" character varying(256) NOT NULL, "description" text NOT NULL DEFAULT '', "enabled" boolean NOT NULL DEFAULT false, "rules" json NOT NULL DEFAULT '[]', "current_version" integer NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_612123add0b79a1c5065820563d" UNIQUE ("project_key", "flag_key"), CONSTRAINT "PK_ea7e333c92a55de9e9b8d0b9afd" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(512) NOT NULL, "key" character varying(256) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_63e67599567b2126cfef14e1474" UNIQUE ("key"), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "request_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "resource_id" character varying(512) NOT NULL, "code" character varying(32) NOT NULL DEFAULT 'ok', "state" integer NOT NULL DEFAULT '0', "iv" integer NOT NULL DEFAULT '0', "principal_id" character varying(256) NOT NULL DEFAULT '', "request" text NOT NULL DEFAULT '', "action" character varying(128) NOT NULL, "service_id" character varying(128) NOT NULL, "created_at" bigint NOT NULL, CONSTRAINT "PK_1edd3815ae37a9b9511f5a26dca" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_7accbc3b458f8dce7481b2c87a" ON "request_logs" ("resource_id", "created_at", "id") `,
        );
        await queryRunner.query(
            `ALTER TABLE "flag_versions" ADD CONSTRAINT "FK_069aee6fb15860590f08e8fa91a" FOREIGN KEY ("flag_id") REFERENCES "flags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "flag_versions" DROP CONSTRAINT "FK_069aee6fb15860590f08e8fa91a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7accbc3b458f8dce7481b2c87a"`);
        await queryRunner.query(`DROP TABLE "request_logs"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP TABLE "flags"`);
        await queryRunner.query(`DROP TABLE "flag_versions"`);
    }
}
