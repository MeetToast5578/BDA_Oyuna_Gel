import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, Where } from 'payload'

import type { JoinOutcome } from '@/collections/JoinAttempts'

export type JoinErrorCode = 'GAME_NOT_FOUND' | 'GAME_NOT_JOINABLE' | 'GAME_FULL' | 'ALREADY_JOINED'

export type JoinResult =
  | { ok: true; remainingSpots: number; maxCount: number }
  | { ok: false; code: JoinErrorCode }

class JoinRejected extends Error {
  constructor(readonly code: JoinErrorCode) {
    super(code)
  }
}

/**
 * Claims one spot in a game for a user.
 *
 * The conditional UPDATE only decrements while a spot is left, and Postgres re-checks that
 * condition after waiting on the row lock, so two joins racing for the last spot can never both
 * succeed, however many app instances are running. The participant insert runs in the same
 * transaction, so a rejected join (including a duplicate) rolls the decrement back.
 */
export async function claimSpot(
  payload: Payload,
  gameId: number,
  userId: number,
  phone: string | null = null,
  name: string | null = null,
): Promise<JoinResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute<{ available_players: string; max_players: string }>(sql`
        UPDATE games
        SET available_players = available_players - 1, updated_at = now()
        WHERE id = ${gameId}
          AND status = 'scheduled'
          AND scheduled_at > now()
          AND available_players > 0
        RETURNING available_players, max_players
      `)
      const game = claimed.rows[0]
      if (!game) throw new JoinRejected(await rejectionReason(tx, gameId, userId))

      const inserted = await tx.execute(sql`
        INSERT INTO game_participants (game_id, user_id, phone, name, updated_at, created_at)
        VALUES (${gameId}, ${userId}, ${phone}, ${name}, now(), now())
        ON CONFLICT (game_id, user_id) DO NOTHING
        RETURNING id
      `)
      if (inserted.rows.length === 0) throw new JoinRejected('ALREADY_JOINED')

      return { ok: true as const, remainingSpots: Number(game.available_players), maxCount: Number(game.max_players) }
    })
  } catch (error) {
    if (error instanceof JoinRejected) return { ok: false, code: error.code }
    throw error
  }
}

type Tx = Parameters<Parameters<PostgresAdapter['drizzle']['transaction']>[0]>[0]

async function rejectionReason(tx: Tx, gameId: number, userId: number): Promise<JoinErrorCode> {
  const { rows } = await tx.execute<{ status: string; upcoming: boolean; joined: boolean }>(sql`
    SELECT g.status,
           g.scheduled_at > now() AS upcoming,
           EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = g.id AND p.user_id = ${userId}) AS joined
    FROM games g
    WHERE g.id = ${gameId}
  `)
  const game = rows[0]
  if (!game) return 'GAME_NOT_FOUND'
  if (game.joined) return 'ALREADY_JOINED'
  if (game.status !== 'scheduled' || !game.upcoming) return 'GAME_NOT_JOINABLE'
  return 'GAME_FULL'
}

const RATE_LIMIT_PER_MINUTE = 10

/**
 * True once a user, or an IP, has made `RATE_LIMIT_PER_MINUTE` join or leave requests in the last
 * minute. Counts the audit log, so it holds across app instances with no extra store. Refused
 * requests are not logged, so a script that stops hammering is let back in a minute later.
 */
export async function tooManyRecentAttempts(payload: Payload, userId: number, ip: string | null) {
  const since = new Date(Date.now() - 60_000).toISOString()
  const count = async (who: Where) =>
    (
      await payload.count({
        collection: 'join-attempts',
        overrideAccess: true,
        where: { and: [{ createdAt: { greater_than: since } }, who] },
      })
    ).totalDocs
  const [byUser, byIp] = await Promise.all([count({ user: { equals: userId } }), ip ? count({ ip: { equals: ip } }) : 0])
  return byUser >= RATE_LIMIT_PER_MINUTE || byIp >= RATE_LIMIT_PER_MINUTE
}

/** Writes the audit-log entry for a join attempt. Never throws: a logging failure must not fail the join. */
export async function recordJoinAttempt(
  payload: Payload,
  entry: { outcome: JoinOutcome; gameId: number | null; userId: number | null; remainingSpots?: number; ip: string | null },
) {
  try {
    await payload.create({
      collection: 'join-attempts',
      overrideAccess: true,
      data: {
        outcome: entry.outcome,
        gameId: entry.gameId,
        user: entry.userId,
        remainingSpots: entry.remainingSpots,
        ip: entry.ip,
      },
    })
  } catch (error) {
    console.error('Failed to record join attempt', error)
  }
}

export type LeaveErrorCode = 'GAME_NOT_FOUND' | 'GAME_STARTED' | 'HOST_CANNOT_LEAVE' | 'NOT_JOINED'

export type LeaveResult =
  | { ok: true; remainingSpots: number; maxCount: number }
  | { ok: false; code: LeaveErrorCode }

class LeaveRejected extends Error {
  constructor(readonly code: LeaveErrorCode) {
    super(code)
  }
}

/**
 * Gives a user's spot in a game back.
 *
 * The participant row is deleted first and the spot only returned when that DELETE actually removed
 * something. Without that check a client could call this repeatedly and push `available_players`
 * past `max_players`, inventing spots in a full game; `FOR UPDATE` on the game serialises two
 * concurrent leaves so only one of them can find the row. `LEAST` is a second belt: even a stray
 * row can never take availability above the game's size.
 */
export async function releaseSpot(payload: Payload, gameId: number, userId: number): Promise<LeaveResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  try {
    return await db.transaction(async (tx) => {
      const locked = await tx.execute<{ host_id: number | null; upcoming: boolean; status: string }>(sql`
        SELECT host_id, status, scheduled_at > now() AS upcoming
        FROM games
        WHERE id = ${gameId}
        FOR UPDATE
      `)
      const game = locked.rows[0]
      if (!game) throw new LeaveRejected('GAME_NOT_FOUND')
      // The host's spot is the game itself: they delete it rather than leaving it.
      if (Number(game.host_id) === userId) throw new LeaveRejected('HOST_CANNOT_LEAVE')
      if (game.status !== 'scheduled' || !game.upcoming) throw new LeaveRejected('GAME_STARTED')

      const removed = await tx.execute(sql`
        DELETE FROM game_participants
        WHERE game_id = ${gameId} AND user_id = ${userId}
        RETURNING id
      `)
      if (removed.rows.length === 0) throw new LeaveRejected('NOT_JOINED')

      const freed = await tx.execute<{ available_players: string; max_players: string }>(sql`
        UPDATE games
        SET available_players = LEAST(available_players + 1, max_players), updated_at = now()
        WHERE id = ${gameId}
        RETURNING available_players, max_players
      `)
      const row = freed.rows[0]
      return { ok: true as const, remainingSpots: Number(row.available_players), maxCount: Number(row.max_players) }
    })
  } catch (error) {
    if (error instanceof LeaveRejected) return { ok: false, code: error.code }
    throw error
  }
}
