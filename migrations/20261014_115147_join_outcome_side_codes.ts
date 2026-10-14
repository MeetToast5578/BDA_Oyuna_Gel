import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_join_attempts_outcome" ADD VALUE 'SIDE_FULL' BEFORE 'UNAUTHENTICATED';
  ALTER TYPE "public"."enum_join_attempts_outcome" ADD VALUE 'NOT_A_MEMBER' BEFORE 'UNAUTHENTICATED';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "join_attempts" ALTER COLUMN "outcome" SET DATA TYPE text;
  DROP TYPE "public"."enum_join_attempts_outcome";
  CREATE TYPE "public"."enum_join_attempts_outcome" AS ENUM('JOINED', 'GAME_FULL', 'GAME_NOT_JOINABLE', 'GAME_NOT_FOUND', 'ALREADY_JOINED', 'UNAUTHENTICATED', 'INVALID_REQUEST', 'ERROR', 'LEFT', 'NOT_JOINED', 'HOST_CANNOT_LEAVE', 'GAME_STARTED');
  ALTER TABLE "join_attempts" ALTER COLUMN "outcome" SET DATA TYPE "public"."enum_join_attempts_outcome" USING "outcome"::"public"."enum_join_attempts_outcome";`)
}
