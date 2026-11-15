import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "rate_limits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"count" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "rate_limits_id" integer;
  CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits" USING btree ("window_start");
  CREATE INDEX "rate_limits_updated_at_idx" ON "rate_limits" USING btree ("updated_at");
  CREATE INDEX "rate_limits_created_at_idx" ON "rate_limits" USING btree ("created_at");
  CREATE UNIQUE INDEX "key_windowStart_idx" ON "rate_limits" USING btree ("key","window_start");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rate_limits_fk" FOREIGN KEY ("rate_limits_id") REFERENCES "public"."rate_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_rate_limits_id_idx" ON "payload_locked_documents_rels" USING btree ("rate_limits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "rate_limits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "rate_limits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_rate_limits_fk";
  
  DROP INDEX "payload_locked_documents_rels_rate_limits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "rate_limits_id";`)
}
