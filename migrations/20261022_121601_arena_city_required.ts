import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Venues from before the city field had none, and the app read that as the default city.
  await db.execute(sql`
   UPDATE "arenas" SET "city" = 'baku' WHERE "city" IS NULL;
   ALTER TABLE "arenas" ALTER COLUMN "city" SET NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "arenas" ALTER COLUMN "city" DROP NOT NULL;`)
}
