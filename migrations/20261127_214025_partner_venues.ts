import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "arenas" ADD COLUMN "partner" boolean DEFAULT false;
  ALTER TABLE "arenas" ADD COLUMN "phone" varchar;
  ALTER TABLE "arenas" ADD COLUMN "booking_url" varchar;
  ALTER TABLE "arenas" ADD COLUMN "price_note" varchar;
  ALTER TABLE "arenas" ADD COLUMN "hours" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "arenas" DROP COLUMN "partner";
  ALTER TABLE "arenas" DROP COLUMN "phone";
  ALTER TABLE "arenas" DROP COLUMN "booking_url";
  ALTER TABLE "arenas" DROP COLUMN "price_note";
  ALTER TABLE "arenas" DROP COLUMN "hours";`)
}
