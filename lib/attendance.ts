import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** How long after kick-off the host can still mark who came. */
export const ATTENDANCE_DAYS = 7

export type Attendance = 'came' | 'absent'

/** Whether the host may mark attendance now: from kick-off until `ATTENDANCE_DAYS` later, never on a cancelled game. */
export function attendanceOpen(game: { status: string; scheduledAt: string | Date }, now = new Date()) {
  const start = new Date(game.scheduledAt).getTime()
  return game.status !== 'cancelled' && start <= now.getTime() && now.getTime() - start <= ATTENDANCE_DAYS * 24 * 3_600_000
}

type MarkResult = { ok: true } | { ok: false; code: 'GAME_NOT_FOUND' | 'ATTENDANCE_CLOSED' | 'NOT_A_PLAYER' }

/**
 * The host marks whether one player came ("Gəldi" / "Gəlmədi"), or clears it with null. Only between
 * kick-off and a week later, and only for a player in the game other than the host themselves.
 */
export async function markAttendance(payload: Payload, gameId: number, playerId: number, value: Attendance | null, now = new Date()): Promise<MarkResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<{ status: string; scheduled_at: string; host_id: number | null }>(sql`
    SELECT status, scheduled_at, host_id FROM games WHERE id = ${gameId}`)
  const game = rows[0]
  if (!game) return { ok: false, code: 'GAME_NOT_FOUND' }
  if (!attendanceOpen({ status: game.status, scheduledAt: game.scheduled_at }, now)) return { ok: false, code: 'ATTENDANCE_CLOSED' }
  if (game.host_id === playerId) return { ok: false, code: 'NOT_A_PLAYER' }

  const updated = await db.execute(sql`
    UPDATE game_participants SET attendance = ${value}, updated_at = now()
    WHERE game_id = ${gameId} AND user_id = ${playerId}`)
  return (updated.rowCount ?? 0) > 0 ? { ok: true } : { ok: false, code: 'NOT_A_PLAYER' }
}

/** How often a player came to games whose host marked them; shown once `RELIABILITY_MIN` are marked. */
export const RELIABILITY_MIN = 3

export async function reliability(payload: Payload, userId: number) {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<{ marked: string; came: string }>(sql`
    SELECT count(*) FILTER (WHERE attendance IS NOT NULL) AS marked, count(*) FILTER (WHERE attendance = 'came') AS came
    FROM game_participants WHERE user_id = ${userId}`)
  const marked = Number(rows[0]?.marked ?? 0)
  return marked >= RELIABILITY_MIN ? { marked, came: Number(rows[0]?.came ?? 0) } : null
}
