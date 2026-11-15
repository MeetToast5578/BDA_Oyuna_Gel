import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "games" ADD COLUMN "is_demo" boolean DEFAULT false;
  ALTER TABLE "games" ADD COLUMN "demo_key" varchar;
  CREATE UNIQUE INDEX "games_demo_key_idx" ON "games" USING btree ("demo_key");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "games_demo_key_idx";
  ALTER TABLE "games" DROP COLUMN "is_demo";
  ALTER TABLE "games" DROP COLUMN "demo_key";`)
}
