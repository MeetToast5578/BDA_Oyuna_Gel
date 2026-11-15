import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_venue_suggestions_sports" AS ENUM('football', 'basketball', 'tennis');
  CREATE TYPE "public"."enum_venue_suggestions_status" AS ENUM('pending', 'added', 'rejected');
  CREATE TABLE "venue_suggestions_sports" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_venue_suggestions_sports",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "venue_suggestions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"district" varchar,
  	"address" varchar,
  	"note" varchar,
  	"submitted_by_id" integer,
  	"status" "enum_venue_suggestions_status" DEFAULT 'pending' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "venue_suggestions_id" integer;
  ALTER TABLE "venue_suggestions_sports" ADD CONSTRAINT "venue_suggestions_sports_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."venue_suggestions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "venue_suggestions" ADD CONSTRAINT "venue_suggestions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "venue_suggestions_sports_order_idx" ON "venue_suggestions_sports" USING btree ("order");
  CREATE INDEX "venue_suggestions_sports_parent_idx" ON "venue_suggestions_sports" USING btree ("parent_id");
  CREATE INDEX "venue_suggestions_submitted_by_idx" ON "venue_suggestions" USING btree ("submitted_by_id");
  CREATE INDEX "venue_suggestions_updated_at_idx" ON "venue_suggestions" USING btree ("updated_at");
  CREATE INDEX "venue_suggestions_created_at_idx" ON "venue_suggestions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_venue_suggestions_fk" FOREIGN KEY ("venue_suggestions_id") REFERENCES "public"."venue_suggestions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_venue_suggestions_id_idx" ON "payload_locked_documents_rels" USING btree ("venue_suggestions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "venue_suggestions_sports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "venue_suggestions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "venue_suggestions_sports" CASCADE;
  DROP TABLE "venue_suggestions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_venue_suggestions_fk";
  
  DROP INDEX "payload_locked_documents_rels_venue_suggestions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "venue_suggestions_id";
  DROP TYPE "public"."enum_venue_suggestions_sports";
  DROP TYPE "public"."enum_venue_suggestions_status";`)
}
