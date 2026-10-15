import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { checkSides, type Side } from '../lib/team-logic'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_games_result_status" AS ENUM('reported', 'confirmed', 'disputed');
  CREATE TYPE "public"."enum_game_participants_side" AS ENUM('home', 'away');
  ALTER TABLE "games" ALTER COLUMN "home_score" DROP DEFAULT;
  ALTER TABLE "games" ALTER COLUMN "away_score" DROP DEFAULT;
  ALTER TABLE "teams" ADD COLUMN "captain_id" integer;
  ALTER TABLE "teams" ADD COLUMN "invite_code" varchar;
  ALTER TABLE "games" ADD COLUMN "result_status" "enum_games_result_status";
  ALTER TABLE "games" ADD COLUMN "result_reported_at" timestamp(3) with time zone;
  ALTER TABLE "games" ADD COLUMN "result_confirmed_by_id" integer;
  ALTER TABLE "game_participants" ADD COLUMN "side" "enum_game_participants_side";
  ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_id_users_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "games" ADD CONSTRAINT "games_result_confirmed_by_id_users_id_fk" FOREIGN KEY ("result_confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "teams_captain_idx" ON "teams" USING btree ("captain_id");
  CREATE UNIQUE INDEX "teams_invite_code_idx" ON "teams" USING btree ("invite_code");
  CREATE INDEX "games_result_confirmed_by_idx" ON "games" USING btree ("result_confirmed_by_id");`)

  // No user has ever entered a score or picked a game's clubs (only the seed wrote them), and the
  // seed's players aren't members of those clubs, so both start empty: every side is open.
  await db.execute(sql`
  UPDATE "games" SET "home_score" = NULL, "away_score" = NULL, "home_team_id" = NULL, "away_team_id" = NULL;`)

  // The host plays home; everyone else alternates away, home, ... in the order they joined.
  await db.execute(sql`
  UPDATE "game_participants" SET "side" = 'home';
  UPDATE "game_participants" p
  SET "side" = CASE WHEN o.n % 2 = 1 THEN 'away' ELSE 'home' END::"enum_game_participants_side"
  FROM (
    SELECT p.id, row_number() OVER (PARTITION BY p.game_id ORDER BY p.created_at, p.id) AS n
    FROM "game_participants" p JOIN "games" g ON g.id = p.game_id
    WHERE p.user_id IS DISTINCT FROM g.host_id
  ) o
  WHERE p.id = o.id;
  ALTER TABLE "game_participants" ALTER COLUMN "side" SET NOT NULL;`)

  // Prove the backfill keeps the one invariant on every game; any failure rolls the migration back.
  const { rows } = await db.execute<{
    id: number
    max_players: number
    available_players: number
    host_id: number | null
    players: { userId: number; side: Side }[] | null
  }>(sql`
  SELECT g.id, g.max_players, g.available_players, g.host_id,
         json_agg(json_build_object('userId', p.user_id, 'side', p.side)) FILTER (WHERE p.id IS NOT NULL) AS players
  FROM "games" g LEFT JOIN "game_participants" p ON p.game_id = g.id
  GROUP BY g.id`)
  for (const game of rows) {
    const players = (game.players ?? []).map((player) => ({ ...player, memberOf: [] }))
    const guests = game.max_players - game.available_players - players.length
    const check = checkSides({ maxPlayers: game.max_players, homeTeamId: null, awayTeamId: null }, players, guests, game.host_id)
    if (!check.ok) throw new Error(`Game ${game.id} fails checkSides after the backfill: ${check.code}`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "teams" DROP CONSTRAINT "teams_captain_id_users_id_fk";
  
  ALTER TABLE "games" DROP CONSTRAINT "games_result_confirmed_by_id_users_id_fk";
  
  DROP INDEX "teams_captain_idx";
  DROP INDEX "teams_invite_code_idx";
  DROP INDEX "games_result_confirmed_by_idx";
  ALTER TABLE "games" ALTER COLUMN "home_score" SET DEFAULT 0;
  ALTER TABLE "games" ALTER COLUMN "away_score" SET DEFAULT 0;
  ALTER TABLE "teams" DROP COLUMN "captain_id";
  ALTER TABLE "teams" DROP COLUMN "invite_code";
  ALTER TABLE "games" DROP COLUMN "result_status";
  ALTER TABLE "games" DROP COLUMN "result_reported_at";
  ALTER TABLE "games" DROP COLUMN "result_confirmed_by_id";
  ALTER TABLE "game_participants" DROP COLUMN "side";
  DROP TYPE "public"."enum_games_result_status";
  DROP TYPE "public"."enum_game_participants_side";`)
}
