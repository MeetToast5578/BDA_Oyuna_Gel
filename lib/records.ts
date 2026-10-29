import { sql } from '@payloadcms/db-postgres'

import type { Db } from '@/lib/join-game'
import { AUTO_CONFIRM_HOURS, compareStandings, outcomeFor, summarize, type Outcome, type PlayedGame, type Side } from '@/lib/team-logic'

/**
 * Whether a game's score goes into a player's record, on the games table aliased `g`. The SQL twin of
 * `resultCounts`: a cancelled game never counts, and a score counts once confirmed or once it has
 * gone `AUTO_CONFIRM_HOURS` undisputed while someone with an account stood on the side opposite the
 * host (the host's side as `readSides` finds it, home when the host has no row). A database test
 * builds a game in each state and checks the two agree.
 */
const counted = sql`
  g.status <> 'cancelled'
  AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
  AND (g.result_status = 'confirmed'
       OR (g.result_status = 'reported' AND g.result_reported_at <= now() - make_interval(hours => ${AUTO_CONFIRM_HOURS})
           AND EXISTS (
             SELECT 1 FROM game_participants rival
             WHERE rival.game_id = g.id
               AND rival.side <> coalesce((SELECT h.side FROM game_participants h WHERE h.game_id = g.id AND h.user_id = g.host_id), 'home'))))`

/**
 * Whether a game's score goes into a club's record and the standings: only a score stored as
 * confirmed, i.e. a player on the other side pressed "Təsdiqlə" (a club's side admits only its
 * members, so that club agreed) or an admin settled it. Never by the 48-hour rule: otherwise a host
 * could name any club as the opponent and give themselves wins nobody answered.
 */
const clubCounted = sql`
  g.status <> 'cancelled'
  AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
  AND g.result_status = 'confirmed'`

const idList = (ids: number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `)
const iso = (value: Date | string) => new Date(value).toISOString()

export type RecordGame = PlayedGame & { sport: string }

type Row = { id: number; side: Side; home_score: number; away_score: number; scheduled_at: Date | string; sport: string }

const toGame = (row: Row): RecordGame => ({
  side: row.side,
  homeScore: Number(row.home_score),
  awayScore: Number(row.away_score),
  scheduledAt: iso(row.scheduled_at),
  sport: row.sport,
})

/** Each player's counted games, as the side they stood on and the score. Players with none are absent from the map. */
export async function playerRecords(db: Db, userIds: number[]): Promise<Map<number, RecordGame[]>> {
  const records = new Map<number, RecordGame[]>()
  if (userIds.length === 0) return records

  const { rows } = await db.execute<Row & { user_id: number }>(sql`
    SELECT p.user_id, p.side, g.home_score, g.away_score, g.scheduled_at, g.sport
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
    WHERE p.user_id IN (${idList(userIds)}) AND ${counted}
  `)
  for (const row of rows) records.set(row.user_id, [...(records.get(row.user_id) ?? []), toGame(row)])
  return records
}

/**
 * The player leaderboard of one sport: everyone with a counted game in it, in league-table order
 * (points, goal difference, goals scored), the same rule as the club standings. Players level on all
 * three: fewer games first (the same points from fewer games), then by name.
 * shortcut: reads every counted row of the sport, fine for thousands of games; past that, aggregate in SQL.
 */
export async function playerStandings(db: Db, sport: string) {
  const { rows } = await db.execute<Row & { user_id: number; full_name: string | null }>(sql`
    SELECT p.user_id, u.full_name, p.side, g.home_score, g.away_score, g.scheduled_at, g.sport
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
    JOIN users u ON u.id = p.user_id
    WHERE g.sport = ${sport} AND ${counted}
  `)
  const players = new Map<number, { name: string; games: RecordGame[] }>()
  for (const row of rows) {
    const player = players.get(row.user_id) ?? { name: row.full_name?.trim() || 'OyunaGəl istifadəçisi', games: [] }
    player.games.push(toGame(row))
    players.set(row.user_id, player)
  }
  return [...players]
    .map(([id, player]) => ({ id: String(id), name: player.name, record: summarize(player.games) }))
    .sort((a, b) => compareStandings(a.record, b.record) || a.record.played - b.record.played || a.name.localeCompare(b.name, 'az'))
}

/**
 * Each club's counted games, from the side the club stood on. A club's record is the games it was
 * named in, whoever turned up to play them. Clubs with none are absent from the map.
 */
export async function teamRecords(db: Db, teamIds: number[]): Promise<Map<number, RecordGame[]>> {
  const records = new Map<number, RecordGame[]>()
  if (teamIds.length === 0) return records

  const { rows } = await db.execute<Row & { team_id: number }>(sql`
    SELECT t.id AS team_id,
           CASE WHEN g.home_team_id = t.id THEN 'home' ELSE 'away' END AS side,
           g.home_score, g.away_score, g.scheduled_at, g.sport
    FROM teams t
    JOIN games g ON g.home_team_id = t.id OR g.away_team_id = t.id
    WHERE t.id IN (${idList(teamIds)}) AND ${clubCounted}
  `)
  for (const row of rows) records.set(row.team_id, [...(records.get(row.team_id) ?? []), toGame(row)])
  return records
}

export type RecentResult = {
  id: string
  title: string
  startsAt: string
  homeScore: number
  awayScore: number
  /** From the club's side: win, draw or loss. */
  outcome: Outcome
  /** The other club, null when that side was open. */
  opponent: string | null
}

/** A club's latest counted games, newest first. */
export async function recentTeamResults(db: Db, teamId: number, limit = 5): Promise<RecentResult[]> {
  const { rows } = await db.execute<{
    id: number
    title: string
    scheduled_at: Date | string
    home_score: number
    away_score: number
    is_home: boolean
    opponent: string | null
  }>(sql`
    SELECT g.id, g.title, g.scheduled_at, g.home_score, g.away_score, (g.home_team_id = ${teamId}) AS is_home,
           CASE WHEN g.home_team_id = ${teamId} THEN away.name ELSE home.name END AS opponent
    FROM games g
    LEFT JOIN teams home ON home.id = g.home_team_id
    LEFT JOIN teams away ON away.id = g.away_team_id
    WHERE (g.home_team_id = ${teamId} OR g.away_team_id = ${teamId}) AND ${clubCounted}
    ORDER BY g.scheduled_at DESC
    LIMIT ${limit}
  `)
  return rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    startsAt: iso(row.scheduled_at),
    homeScore: Number(row.home_score),
    awayScore: Number(row.away_score),
    outcome: outcomeFor(row.is_home ? 'home' : 'away', Number(row.home_score), Number(row.away_score)),
    opponent: row.opponent,
  }))
}
