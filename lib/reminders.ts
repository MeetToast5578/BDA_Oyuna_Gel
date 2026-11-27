import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { ATTENDANCE_DAYS } from '@/lib/attendance'
import { noticeFor, notify, participantIds } from '@/lib/notify'

/** How far ahead "Oyununuz 2 saata başlayır" goes out. */
export const REMINDER_HOURS = 2

/**
 * Reminds everyone in each game that starts within `REMINDER_HOURS` and hasn't been reminded yet
 * (`/api/cron/reminders`). Each game is claimed in the same statement that marks it, so two runs at
 * once never remind twice. Returns how many games were reminded.
 */
export async function sendReminders(payload: Payload, now = new Date()) {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const until = new Date(now.getTime() + REMINDER_HOURS * 3_600_000)
  const { rows } = await db.execute<{ id: number; title: string }>(sql`
    UPDATE games SET reminded_at = ${now.toISOString()}
    WHERE status = 'scheduled' AND reminded_at IS NULL
      AND scheduled_at > ${now.toISOString()} AND scheduled_at <= ${until.toISOString()}
    RETURNING id, title`)
  for (const game of rows) {
    await notify(payload, await participantIds(payload, game.id, null), noticeFor('reminder', game))
  }
  return rows.length
}

/** How long after kick-off the host is asked to mark who came: long enough for the game to be over. */
export const ATTENDANCE_REMINDER_HOURS = 2

/**
 * "Oyun bitdi: kimin gəldiyini qeyd edin" to the host of each real game that kicked off at least
 * `ATTENDANCE_REMINDER_HOURS` ago, still inside the marking window, with at least one other player.
 * Claimed in the marking statement like `sendReminders`, so each host hears it once. Returns how many.
 */
export async function sendAttendanceReminders(payload: Payload, now = new Date()) {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const endedBy = new Date(now.getTime() - ATTENDANCE_REMINDER_HOURS * 3_600_000)
  const windowStart = new Date(now.getTime() - ATTENDANCE_DAYS * 24 * 3_600_000)
  const { rows } = await db.execute<{ id: number; title: string; host_id: number }>(sql`
    UPDATE games SET attendance_reminded_at = ${now.toISOString()}
    WHERE status <> 'cancelled' AND is_demo IS NOT TRUE AND attendance_reminded_at IS NULL AND host_id IS NOT NULL
      AND scheduled_at <= ${endedBy.toISOString()} AND scheduled_at > ${windowStart.toISOString()}
      AND EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = games.id AND p.user_id IS DISTINCT FROM games.host_id)
    RETURNING id, title, host_id`)
  for (const game of rows) await notify(payload, [Number(game.host_id)], noticeFor('markAttendance', game))
  return rows.length
}
