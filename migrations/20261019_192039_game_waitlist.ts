import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Edited from what Payload generated: a waitlist row goes with its game or its player (both columns
// are NOT NULL, so the default ON DELETE SET NULL would make deleting either fail), and `down` no
// longer drops a constraint that DROP TABLE ... CASCADE already removed.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "game_waitlist" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"game_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "game_participants" ADD COLUMN "promoted_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "game_waitlist_id" integer;
  ALTER TABLE "game_waitlist" ADD CONSTRAINT "game_waitlist_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "game_waitlist" ADD CONSTRAINT "game_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "game_waitlist_game_idx" ON "game_waitlist" USING btree ("game_id");
  CREATE INDEX "game_waitlist_user_idx" ON "game_waitlist" USING btree ("user_id");
  CREATE INDEX "game_waitlist_updated_at_idx" ON "game_waitlist" USING btree ("updated_at");
  CREATE INDEX "game_waitlist_created_at_idx" ON "game_waitlist" USING btree ("created_at");
  CREATE UNIQUE INDEX "game_user_2_idx" ON "game_waitlist" USING btree ("game_id","user_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_game_waitlist_fk" FOREIGN KEY ("game_waitlist_id") REFERENCES "public"."game_waitlist"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_game_waitlist_id_idx" ON "payload_locked_documents_rels" USING btree ("game_waitlist_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "game_waitlist" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "game_waitlist" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_game_waitlist_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_game_waitlist_id_idx";
  ALTER TABLE "game_participants" DROP COLUMN "promoted_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "game_waitlist_id";`)
}
