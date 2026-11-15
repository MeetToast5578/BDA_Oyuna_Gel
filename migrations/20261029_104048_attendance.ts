import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_game_participants_attendance" AS ENUM('came', 'absent');
  ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'markedAbsent';
  ALTER TABLE "game_participants" ADD COLUMN "attendance" "enum_game_participants_attendance";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_notifications_kind";
  CREATE TYPE "public"."enum_notifications_kind" AS ENUM('invited', 'promoted', 'changed', 'cancelled', 'removed', 'resultReported', 'resultConfirmed', 'resultDisputed');
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_notifications_kind" USING "kind"::"public"."enum_notifications_kind";
  ALTER TABLE "game_participants" DROP COLUMN "attendance";
  DROP TYPE "public"."enum_game_participants_attendance";`)
}
