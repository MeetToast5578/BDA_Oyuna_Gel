import { sql } from '@payloadcms/db-postgres'

import type { Db } from '@/lib/join-game'

/** How long data that is only kept for a while stays. */
export const RETENTION = {
  /** The join/leave audit log, with IP addresses. */
  joinAttemptsDays: 90,
  /** Phone numbers on a game, its players and its waitlist, counted from the game's start. */
  phonesDays: 30,
  /** Notices already seen; unseen ones stay for `noticesUnreadDays`. */
  noticesReadDays: 90,
  noticesUnreadDays: 180,
} as const

/**
 * The daily cleanup (`/api/cron/cleanup`): drops what the site no longer needs and personal data it
 * no longer has a reason to keep. Every step is idempotent, so a repeated or late run does no harm.
 * Returns how many rows each step touched, for the cron log.
 */
export async function cleanUpOldData(db: Db) {
  const count = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rowCount ?? 0
  return {
    joinAttempts: await count(sql`
      DELETE FROM join_attempts WHERE created_at < now() - make_interval(days => ${RETENTION.joinAttemptsDays})`),
    // Windows are a minute or an hour long; a day back nothing reads them.
    rateLimits: await count(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`),
    // Nobody can join a game that has started, so its waitlist (names and numbers) has no use.
    waitlist: await count(sql`
      DELETE FROM game_waitlist w USING games g WHERE g.id = w.game_id AND g.scheduled_at < now()`),
    participantPhones: await count(sql`
      UPDATE game_participants p SET phone = NULL, updated_at = now() FROM games g
      WHERE g.id = p.game_id AND p.phone IS NOT NULL AND g.scheduled_at < now() - make_interval(days => ${RETENTION.phonesDays})`),
    notices: await count(sql`
      DELETE FROM notifications
      WHERE created_at < now() - make_interval(days => ${RETENTION.noticesUnreadDays})
         OR (read_at IS NOT NULL AND created_at < now() - make_interval(days => ${RETENTION.noticesReadDays}))`),
    hostPhones: await count(sql`
      UPDATE games SET contact_phone = NULL, updated_at = now()
      WHERE contact_phone IS NOT NULL AND scheduled_at < now() - make_interval(days => ${RETENTION.phonesDays})`),
    // A group chat is contact details too, kept as long as the phones.
    groupLinks: await count(sql`
      UPDATE games SET group_link = NULL, updated_at = now()
      WHERE group_link IS NOT NULL AND scheduled_at < now() - make_interval(days => ${RETENTION.phonesDays})`),
  }
}
