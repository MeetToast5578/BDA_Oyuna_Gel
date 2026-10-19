import { sql } from '@payloadcms/db-postgres'

import type { Db } from '@/lib/join-game'
import { AUTO_CONFIRM_HOURS, outcomeFor, type Outcome, type PlayedGame, type Side } from '@/lib/team-logic'

/**
 * Whether a game's score goes into anyone's record, on the games table aliased `g`. The SQL twin of
 * `resultCounts`: a cancelled game never counts, and a score counts once confirmed or once it has
 * gone `AUTO_CONFIRM_HOURS` undisputed. A database test builds a game in each state and checks the two agree.
 */
const counted = sql`
  g.status <> 'cancelled'
  AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
  AND (g.result_status = 'confirmed'
       OR (g.result_status = 'reported' AND g.result_reported_at <= now() - make_interval(hours => ${AUTO_CONFIRM_HOURS})))`

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
    WHERE t.id IN (${idList(teamIds)}) AND ${counted}
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
    WHERE (g.home_team_id = ${teamId} OR g.away_team_id = ${teamId}) AND ${counted}
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
