import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { apiError } from '@/lib/api-response'

/** How often each action may run, per user and per IP, in a fixed window. */
export const RATE_LIMITS = {
  // Join, leave and the waitlist share one budget: they are the same "take or give back a spot".
  spot: { limit: 10, windowSeconds: 60 },
  createGame: { limit: 10, windowSeconds: 60 * 60 },
  // Above the 5-clubs cap, so a normal user meets that message first; this stops create-leave-create loops.
  createTeam: { limit: 10, windowSeconds: 60 * 60 },
  upload: { limit: 20, windowSeconds: 60 * 60 },
  // The player picker searches as the host types.
  userLookup: { limit: 120, windowSeconds: 60 },
  // Turning phone notifications on: a handful of devices, not a list of endpoints to send to.
  pushSubscribe: { limit: 10, windowSeconds: 60 * 60 },
} as const

export type RateLimitAction = keyof typeof RATE_LIMITS

/**
 * Counts this request and says whether the user or the IP is over the action's limit. The count is a
 * single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so parallel requests can't all read "9" and
 * pass together, and it holds across app instances. Requests over the limit count too, so a script
 * that keeps hammering stays out until it stops for a whole window.
 */
export async function isRateLimited(
  payload: Payload,
  action: RateLimitAction,
  who: { userId?: number | string | null; ip?: string | null },
) {
  const { limit, windowSeconds } = RATE_LIMITS[action]
  const keys = [who.userId != null ? `${action}:user:${who.userId}` : null, who.ip ? `${action}:ip:${who.ip}` : null].filter(
    (key): key is string => key !== null,
  )
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  let over = false
  for (const key of keys) {
    const { rows } = await db.execute<{ count: string }>(sql`
      INSERT INTO rate_limits (key, window_start, count, updated_at, created_at)
      VALUES (${key}, to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds}), 1, now(), now())
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1, updated_at = now()
      RETURNING count
    `)
    if (Number(rows[0].count) > limit) over = true
  }
  // Old windows are deleted by the daily cleanup (lib/cleanup.ts).
  return over
}

/** The 429 every limited route answers with. */
export const rateLimitedResponse = () =>
  apiError('RATE_LIMITED', 'Çox tez-tez cəhd edirsiniz. Bir az sonra yenidən yoxlayın.', 429)

/** The client's IP as Vercel forwards it; the first entry is the one the client connected from. */
export const clientIp = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
