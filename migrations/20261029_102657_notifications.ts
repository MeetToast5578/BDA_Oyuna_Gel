import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_notifications_kind" AS ENUM('invited', 'promoted', 'changed', 'cancelled', 'removed', 'resultReported', 'resultConfirmed', 'resultDisputed');
  CREATE TABLE "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"kind" "enum_notifications_kind" NOT NULL,
  	"game_id" integer,
  	"game_title" varchar NOT NULL,
  	"read_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notifications_id" integer;
  -- A deleted account takes its notices with it (the generated "set null" would fail on a NOT NULL column).
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");
  CREATE INDEX "notifications_game_idx" ON "notifications" USING btree ("game_id");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "user_readAt_idx" ON "notifications" USING btree ("user_id","read_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "notifications" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_notifications_fk";
  
  DROP INDEX "payload_locked_documents_rels_notifications_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notifications_id";
  DROP TYPE "public"."enum_notifications_kind";`)
}
