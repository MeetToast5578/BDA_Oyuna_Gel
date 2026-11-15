import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

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
