import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "join_attempts_outcome_idx";
  DROP INDEX "join_attempts_game_id_idx";
  CREATE INDEX "games_scheduled_at_idx" ON "games" USING btree ("scheduled_at");`)

  // Hand-written below: rules the app relies on but Payload can't express. Each is preceded by a repair,
  // so a row that already breaks it is fixed rather than failing the deploy.

  // Deleting a game or an account must take its participant rows with it. These columns are NOT NULL,
  // so the generated ON DELETE SET NULL could only ever fail; deleteGame and deleteMyAccount worked
  // around it by deleting the rows first. A venue with games can't be deleted (RESTRICT), instead of
  // failing on the NOT NULL arena column. Payload's snapshot still says SET NULL, so a later generated
  // migration that touches these keys would put it back: tests/schema-guards.test.ts watches for that.
  await db.execute(sql`
   ALTER TABLE "game_participants" DROP CONSTRAINT "game_participants_game_id_games_id_fk",
     ADD CONSTRAINT "game_participants_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "game_participants" DROP CONSTRAINT "game_participants_user_id_users_id_fk",
     ADD CONSTRAINT "game_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "games" DROP CONSTRAINT "games_arena_id_arenas_id_fk",
     ADD CONSTRAINT "games_arena_id_arenas_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE restrict ON UPDATE no action;`)

  // Spots: a whole number of places, at least one per side, and free spots between none and all.
  await db.execute(sql`
   UPDATE "games" SET "max_players" = GREATEST(2, round("max_players")) WHERE "max_players" < 2 OR "max_players" <> trunc("max_players");
   UPDATE "games" SET "available_players" = LEAST(GREATEST(0, round("available_players")), "max_players")
     WHERE "available_players" < 0 OR "available_players" > "max_players" OR "available_players" <> trunc("available_players");
   ALTER TABLE "games"
     ADD CONSTRAINT "games_max_players_check" CHECK ("max_players" >= 2 AND "max_players" = trunc("max_players")),
     ADD CONSTRAINT "games_available_players_check" CHECK ("available_players" >= 0 AND "available_players" <= "max_players" AND "available_players" = trunc("available_players"));`)

  // Scores: both or neither, never negative, and a result status only with a score. Two different clubs.
  await db.execute(sql`
   UPDATE "games" SET "home_score" = NULL, "away_score" = NULL, "result_status" = NULL
     WHERE ("home_score" IS NULL) <> ("away_score" IS NULL) OR "home_score" < 0 OR "away_score" < 0;
   UPDATE "games" SET "result_status" = NULL WHERE "result_status" IS NOT NULL AND "home_score" IS NULL;
   UPDATE "games" SET "away_team_id" = NULL WHERE "home_team_id" = "away_team_id";
   ALTER TABLE "games"
     ADD CONSTRAINT "games_scores_check" CHECK (("home_score" IS NULL) = ("away_score" IS NULL) AND coalesce("home_score", 0) >= 0 AND coalesce("away_score", 0) >= 0),
     ADD CONSTRAINT "games_result_check" CHECK ("result_status" IS NULL OR "home_score" IS NOT NULL),
     ADD CONSTRAINT "games_distinct_teams_check" CHECK ("home_team_id" <> "away_team_id");`)

  // A person is a club's member once. Only joinTeam's row lock prevented duplicates; the admin panel skipped it.
  await db.execute(sql`
   DELETE FROM "teams_rels" a USING "teams_rels" b
     WHERE a."path" = 'members' AND b."path" = 'members' AND a."parent_id" = b."parent_id" AND a."users_id" = b."users_id" AND a."id" > b."id";
   CREATE UNIQUE INDEX "teams_rels_member_unique" ON "teams_rels" ("parent_id", "users_id") WHERE "path" = 'members';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "teams_rels_member_unique";
   ALTER TABLE "games"
     DROP CONSTRAINT "games_max_players_check",
     DROP CONSTRAINT "games_available_players_check",
     DROP CONSTRAINT "games_scores_check",
     DROP CONSTRAINT "games_result_check",
     DROP CONSTRAINT "games_distinct_teams_check";
   ALTER TABLE "game_participants" DROP CONSTRAINT "game_participants_game_id_games_id_fk",
     ADD CONSTRAINT "game_participants_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "game_participants" DROP CONSTRAINT "game_participants_user_id_users_id_fk",
     ADD CONSTRAINT "game_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "games" DROP CONSTRAINT "games_arena_id_arenas_id_fk",
     ADD CONSTRAINT "games_arena_id_arenas_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE set null ON UPDATE no action;`)
  await db.execute(sql`
   DROP INDEX "games_scheduled_at_idx";
  CREATE INDEX "join_attempts_outcome_idx" ON "join_attempts" USING btree ("outcome");
  CREATE INDEX "join_attempts_game_id_idx" ON "join_attempts" USING btree ("game_id");`)
}
