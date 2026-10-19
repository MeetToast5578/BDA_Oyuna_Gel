import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { invalidateGamesCache } from '@/lib/cache-tags'
import { deriveAvailability } from '@/lib/game-backend'
import { readSides } from '@/lib/join-game'
import { nextResultStatus, type ResultAction, type ResultErrorCode, type ResultStatus, type Side } from '@/lib/team-logic'

export type ResultFailure = ResultErrorCode | 'GAME_NOT_FOUND'
export type SubmitResult = { ok: true; status: ResultStatus } | { ok: false; code: ResultFailure }

class ResultRejected extends Error {
  constructor(readonly code: ResultFailure) {
    super(code)
  }
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null)

/**
 * The host's report of a score, or a player's answer to it. The game is locked while the status
 * is read and written, so a confirm racing a re-report sees one or the other, never a mix, and the
 * state machine in `nextResultStatus` decides every step (who may act, and that the game is over).
 * A report starts the 48-hour clock over and clears who answered the last one; an answer records
 * who gave it. An admin's report settles the score and counts as their confirmation.
 */
export async function submitResult(
  payload: Payload,
  gameId: number,
  actor: { userId: number; isAdmin: boolean },
  action: ResultAction,
  scores?: { homeScore: number; awayScore: number },
): Promise<SubmitResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  try {
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx.execute<{
        status: string
        sport: string
        scheduled_at: Date | string
        max_players: number
        available_players: number
        host_id: number | null
        result_status: ResultStatus | null
        result_reported_at: Date | string | null
      }>(sql`
        SELECT status, sport, scheduled_at, max_players, available_players, host_id, result_status, result_reported_at
        FROM games WHERE id = ${gameId} FOR UPDATE
      `)
      const game = locked.rows[0]
      if (!game) throw new ResultRejected('GAME_NOT_FOUND')

      const finished =
        deriveAvailability({
          status: game.status,
          sport: game.sport,
          scheduledAt: iso(game.scheduled_at),
          maxPlayers: game.max_players,
          availablePlayers: game.available_players,
        }).status === 'finished'

      const { hostSide } = await readSides(tx, gameId)
      const mine = await tx.execute<{ side: Side }>(sql`
        SELECT side FROM game_participants WHERE game_id = ${gameId} AND user_id = ${actor.userId}
      `)
      const next = nextResultStatus(
        { status: game.result_status, reportedAt: iso(game.result_reported_at) },
        action,
        { isHost: Number(game.host_id) === actor.userId, isAdmin: actor.isAdmin, side: mine.rows[0]?.side ?? null, hostSide },
        finished,
      )
      if (!next.ok) throw new ResultRejected(next.code)

      if (action === 'report' && scores) {
        await tx.execute(sql`
          UPDATE games
          SET home_score = ${scores.homeScore}, away_score = ${scores.awayScore}, result_status = ${next.status},
              result_reported_at = now(), result_confirmed_by_id = ${next.status === 'confirmed' ? actor.userId : null},
              updated_at = now()
          WHERE id = ${gameId}
        `)
      } else {
        await tx.execute(sql`
          UPDATE games SET result_status = ${next.status}, result_confirmed_by_id = ${actor.userId}, updated_at = now()
          WHERE id = ${gameId}
        `)
      }
      return next.status
    })
    // The raw UPDATE skips the collection's hook, and the stats pages read through the games tag.
    invalidateGamesCache()
    return { ok: true, status: outcome }
  } catch (error) {
    if (error instanceof ResultRejected) return { ok: false, code: error.code }
    throw error
  }
}
