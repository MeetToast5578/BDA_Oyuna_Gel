import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatBakuShortDate, formatBakuTime, SPORT_META } from '@/lib/game-backend'
import type { Db } from '@/lib/join-game'

// The waitlist of a full game (docs/fixes-and-ux-plan.md, stage 5). Signing up and leaving the list
// are here; handing a free spot to the first person waiting is `promoteWaiting` in lib/join-game.ts,
// which runs wherever a spot comes back.

export type WaitlistErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_JOINABLE'
  | 'GAME_NOT_FULL'
  | 'ALREADY_JOINED'
  | 'ALREADY_WAITING'
  | 'HOST_CANNOT_WAIT'
  | 'WAITLIST_FULL'
export type WaitlistResult = { ok: true; position: number } | { ok: false; code: WaitlistErrorCode }

/** A list this long is plenty for a game of at most 22; it stops the table being used as a dumping ground. */
export const MAX_WAITLIST = 30
/** How long "you got a spot" stays on the profile and in the header's count. */
export const PROMOTION_NOTICE_DAYS = 3

class Rejected extends Error {
  constructor(readonly code: WaitlistErrorCode) {
    super(code)
  }
}

const drizzle = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/**
 * Puts someone on a full game's list. Only while the game is upcoming and has no free spot, and not
 * for the host or someone already playing. Under the game's row lock, so a spot freeing up at the
 * same moment is either seen (and the sign-up refused as `GAME_NOT_FULL`) or promoted afterwards.
 */
export async function joinWaitlist(payload: Payload, gameId: number, userId: number, phone: string, name: string): Promise<WaitlistResult> {
  try {
    return await drizzle(payload).transaction(async (tx) => {
      const locked = await tx.execute<{ status: string; upcoming: boolean; available_players: number; host_id: number | null }>(sql`
        SELECT status, scheduled_at > now() AS upcoming, available_players, host_id FROM games WHERE id = ${gameId} FOR UPDATE
      `)
      const game = locked.rows[0]
      if (!game) throw new Rejected('GAME_NOT_FOUND')
      if (game.status !== 'scheduled' || !game.upcoming) throw new Rejected('GAME_NOT_JOINABLE')
      if (Number(game.host_id) === userId) throw new Rejected('HOST_CANNOT_WAIT')
      const playing = await tx.execute(sql`SELECT 1 FROM game_participants WHERE game_id = ${gameId} AND user_id = ${userId}`)
      if (playing.rows.length > 0) throw new Rejected('ALREADY_JOINED')
      if (Number(game.available_players) > 0) throw new Rejected('GAME_NOT_FULL')

      const size = await tx.execute<{ n: string }>(sql`SELECT count(*) AS n FROM game_waitlist WHERE game_id = ${gameId}`)
      if (Number(size.rows[0].n) >= MAX_WAITLIST) throw new Rejected('WAITLIST_FULL')
      const inserted = await tx.execute<{ id: number }>(sql`
        INSERT INTO game_waitlist (game_id, user_id, name, phone, updated_at, created_at)
        VALUES (${gameId}, ${userId}, ${name}, ${phone}, now(), now())
        ON CONFLICT (game_id, user_id) DO NOTHING
        RETURNING id
      `)
      if (inserted.rows.length === 0) throw new Rejected('ALREADY_WAITING')
      return { ok: true as const, position: Number(size.rows[0].n) + 1 }
    })
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, code: error.code }
    throw error
  }
}

/** Takes someone off a game's list. False when they weren't on it. */
export async function leaveWaitlist(payload: Payload, gameId: number, userId: number) {
  const { rows } = await drizzle(payload).execute(sql`DELETE FROM game_waitlist WHERE game_id = ${gameId} AND user_id = ${userId} RETURNING id`)
  return rows.length > 0
}

/** Joining directly answers a sign-up for the same game (a spot opened on a side nobody waiting could take). Never throws. */
export async function dropWaitlistEntry(payload: Payload, gameId: number, userId: number) {
  try {
    await leaveWaitlist(payload, gameId, userId)
  } catch (error) {
    console.error('Failed to clear a waitlist entry', error)
  }
}

/** How many are waiting for a game, and where the viewer stands (1 is next), for the join panel. */
export async function waitlistInfo(db: Db, gameId: number, viewerId: number | null) {
  const { rows } = await db.execute<{ total: string; position: string | null }>(sql`
    SELECT count(*) AS total,
           (SELECT count(*) FROM game_waitlist m JOIN game_waitlist w ON w.game_id = m.game_id AND (w.created_at, w.id) <= (m.created_at, m.id)
            WHERE m.game_id = ${gameId} AND m.user_id = ${viewerId}) AS position
    FROM game_waitlist WHERE game_id = ${gameId}
  `)
  const position = Number(rows[0]?.position ?? 0)
  return { count: Number(rows[0]?.total ?? 0), yourPosition: viewerId !== null && position > 0 ? position : null }
}

type GameLine = { game_id: number; title: string; sport: string; scheduled_at: Date | string; venue: string | null }
const line = (row: GameLine) => {
  const startsAt = new Date(row.scheduled_at).toISOString()
  return {
    gameId: String(row.game_id),
    title: row.title,
    sportLabel: SPORT_META[row.sport]?.label ?? row.sport,
    dateLabel: formatBakuShortDate(startsAt),
    timeLabel: formatBakuTime(startsAt),
    venueName: row.venue,
  }
}

/**
 * What the waitlist means to one person: the full games they wait for (with their place), and the
 * spots they were handed in the last few days, for games that haven't started.
 */
export async function myWaitlist(payload: Payload, userId: number) {
  const db = drizzle(payload)
  const waiting = await db.execute<GameLine & { position: string }>(sql`
    SELECT g.id AS game_id, g.title, g.sport, g.scheduled_at, a.name AS venue,
           (SELECT count(*) FROM game_waitlist x WHERE x.game_id = w.game_id AND (x.created_at, x.id) <= (w.created_at, w.id)) AS position
    FROM game_waitlist w
    JOIN games g ON g.id = w.game_id
    LEFT JOIN arenas a ON a.id = g.arena_id
    WHERE w.user_id = ${userId} AND g.status = 'scheduled' AND g.scheduled_at > now()
    ORDER BY g.scheduled_at, w.id
  `)
  const promoted = await db.execute<GameLine>(sql`
    SELECT g.id AS game_id, g.title, g.sport, g.scheduled_at, a.name AS venue
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
    LEFT JOIN arenas a ON a.id = g.arena_id
    WHERE p.user_id = ${userId} AND g.status = 'scheduled' AND g.scheduled_at > now()
      AND p.promoted_at > now() - make_interval(days => ${PROMOTION_NOTICE_DAYS})
    ORDER BY p.promoted_at DESC
  `)
  return {
    waiting: waiting.rows.map((row) => ({ ...line(row), position: Number(row.position) })),
    promoted: promoted.rows.map(line),
  }
}

