import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Edited from what Payload generated: an invite goes with its game or its player (both columns are
// NOT NULL, so the default ON DELETE SET NULL would make deleting either fail).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_game_invites_side" AS ENUM('home', 'away');
  CREATE TYPE "public"."enum_game_invites_status" AS ENUM('pending', 'accepted', 'declined');
  CREATE TABLE "game_invites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"game_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"invited_by_id" integer,
  	"side" "enum_game_invites_side" NOT NULL,
  	"status" "enum_game_invites_status" DEFAULT 'pending' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "game_invites_id" integer;
  ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "game_invites_game_idx" ON "game_invites" USING btree ("game_id");
  CREATE INDEX "game_invites_user_idx" ON "game_invites" USING btree ("user_id");
  CREATE INDEX "game_invites_invited_by_idx" ON "game_invites" USING btree ("invited_by_id");
  CREATE INDEX "game_invites_updated_at_idx" ON "game_invites" USING btree ("updated_at");
  CREATE INDEX "game_invites_created_at_idx" ON "game_invites" USING btree ("created_at");
  CREATE UNIQUE INDEX "game_user_1_idx" ON "game_invites" USING btree ("game_id","user_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_game_invites_fk" FOREIGN KEY ("game_invites_id") REFERENCES "public"."game_invites"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_game_invites_id_idx" ON "payload_locked_documents_rels" USING btree ("game_invites_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "game_invites" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "game_invites" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_game_invites_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_game_invites_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "game_invites_id";
  DROP TYPE "public"."enum_game_invites_side";
  DROP TYPE "public"."enum_game_invites_status";`)
}
