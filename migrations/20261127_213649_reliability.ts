import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_notifications_kind" ADD VALUE 'markAttendance';
  ALTER TABLE "users" ADD COLUMN "late_cancellations" numeric DEFAULT 0;
  ALTER TABLE "games" ADD COLUMN "attendance_reminded_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The old enum has no 'markAttendance', so those notices go before the type is rebuilt.
  await db.execute(sql`
   DELETE FROM "notifications" WHERE "kind" = 'markAttendance';
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_notifications_kind";
  CREATE TYPE "public"."enum_notifications_kind" AS ENUM('invited', 'promoted', 'changed', 'cancelled', 'removed', 'resultReported', 'resultConfirmed', 'resultDisputed', 'markedAbsent', 'reminder');
  ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_notifications_kind" USING "kind"::"public"."enum_notifications_kind";
  ALTER TABLE "users" DROP COLUMN "late_cancellations";
  ALTER TABLE "games" DROP COLUMN "attendance_reminded_at";`)
}
