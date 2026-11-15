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
export async function cleanUpOldData(db: Db, dryRun = false) {
  // Each operation supplies one shared predicate for both preview and mutation.
  const remove = async (table: ReturnType<typeof sql>, where: ReturnType<typeof sql>) => {
    if (dryRun) return Number((await db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM ${table} WHERE ${where}`)).rows[0].count)
    return (await db.execute(sql`DELETE FROM ${table} WHERE ${where}`)).rowCount ?? 0
  }
  const clear = async (table: ReturnType<typeof sql>, column: ReturnType<typeof sql>, where: ReturnType<typeof sql>) => {
    if (dryRun) return Number((await db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM ${table} WHERE ${where}`)).rows[0].count)
    return (await db.execute(sql`UPDATE ${table} SET ${column} = NULL, updated_at = now() WHERE ${where}`)).rowCount ?? 0
  }
  return {
    joinAttempts: await remove(sql`join_attempts`, sql`created_at < now() - make_interval(days => ${RETENTION.joinAttemptsDays})`),
    // Windows are a minute or an hour long; a day back nothing reads them.
    rateLimits: await remove(sql`rate_limits`, sql`window_start < now() - interval '1 day'`),
    // Nobody can join a game that has started, so its waitlist (names and numbers) has no use.
    waitlist: await remove(sql`game_waitlist`, sql`game_id IN (SELECT id FROM games WHERE scheduled_at < now())`),
    participantPhones: await clear(sql`game_participants`, sql`phone`, sql`phone IS NOT NULL AND game_id IN (SELECT id FROM games WHERE scheduled_at < now() - make_interval(days => ${RETENTION.phonesDays}))`),
    notices: await remove(sql`notifications`, sql`created_at < now() - make_interval(days => ${RETENTION.noticesUnreadDays})
         OR (read_at IS NOT NULL AND created_at < now() - make_interval(days => ${RETENTION.noticesReadDays}))`),
    hostPhones: await clear(sql`games`, sql`contact_phone`, sql`contact_phone IS NOT NULL AND scheduled_at < now() - make_interval(days => ${RETENTION.phonesDays})`),
    // A group chat is contact details too, kept as long as the phones.
    groupLinks: await clear(sql`games`, sql`group_link`, sql`group_link IS NOT NULL AND scheduled_at < now() - make_interval(days => ${RETENTION.phonesDays})`),
  }
}
