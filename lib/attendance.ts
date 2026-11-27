import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Db } from '@/lib/join-game'

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

/** Leaving a game this close to kick-off is a late cancellation: half a no-show in "Etibarlılıq". */
export const LATE_LEAVE_HOURS = 3

/** How often a player came to games whose host marked them; shown once `RELIABILITY_MIN` count. */
export const RELIABILITY_MIN = 3

export type Reliability = { marked: number; came: number; late: number }

/** Share of games the player kept, a late cancellation counting as half a missed game. */
export function reliabilityPercent({ marked, came, late }: Reliability) {
  const weight = marked + late / 2
  return weight > 0 ? Math.round((100 * came) / weight) : 0
}

/** Each listed player's reliability, in one query; players under `RELIABILITY_MIN` are absent from the map. */
export async function reliabilityFor(db: Db, userIds: number[]): Promise<Map<number, Reliability>> {
  const result = new Map<number, Reliability>()
  if (userIds.length === 0) return result
  const { rows } = await db.execute<{ id: number; marked: string; came: string; late: string }>(sql`
    SELECT u.id,
      count(p.id) FILTER (WHERE p.attendance IS NOT NULL) AS marked,
      count(p.id) FILTER (WHERE p.attendance = 'came') AS came,
      COALESCE(u.late_cancellations, 0) AS late
    FROM users u
    LEFT JOIN game_participants p ON p.user_id = u.id
    WHERE u.id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY u.id`)
  for (const row of rows) {
    const value = { marked: Number(row.marked), came: Number(row.came), late: Number(row.late) }
    if (value.marked + value.late >= RELIABILITY_MIN) result.set(Number(row.id), value)
  }
  return result
}

export async function reliability(payload: Payload, userId: number) {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  return (await reliabilityFor(db, [userId])).get(userId) ?? null
}

/**
 * After a player left a game themselves: counts it as a late cancellation when the game starts within
 * `LATE_LEAVE_HOURS`. Host removals never come here. Returns whether it counted.
 */
export async function recordLateLeave(payload: Payload, gameId: number, userId: number, now = new Date()) {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const until = new Date(now.getTime() + LATE_LEAVE_HOURS * 3_600_000)
  const updated = await db.execute(sql`
    UPDATE users SET late_cancellations = COALESCE(late_cancellations, 0) + 1
    WHERE id = ${userId}
      AND EXISTS (SELECT 1 FROM games WHERE id = ${gameId} AND scheduled_at <= ${until.toISOString()})`)
  return (updated.rowCount ?? 0) > 0
}
