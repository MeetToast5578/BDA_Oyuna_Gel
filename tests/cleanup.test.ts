import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { GET as cleanupRoute } from '@/app/api/cron/cleanup/route'
import { cleanUpOldData } from '@/lib/cleanup'

const DAY_MS = 24 * 3600_000

/** The daily cleanup: old logs go, and phone numbers leave games that ended a month ago. */
describe.skipIf(!process.env.DATABASE_URL)('daily cleanup (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let db: PostgresAdapter['drizzle']
  let userId: number
  let arenaId: number
  const games: Record<'old' | 'recent' | 'upcoming', number> = { old: 0, recent: 0, upcoming: 0 }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    db = (payload.db as unknown as PostgresAdapter).drizzle
    userId = (
      await payload.create({ collection: 'users', overrideAccess: true, data: { email: `cleanup-${suffix}@oyunagel.test`, password: 'cleanup-test-password', fullName: 'Cleanup' } })
    ).id
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Cleanup Arena ${suffix}`, location: 'Bakı', city: 'baku' } })).id
    for (const [key, offset] of [['old', -40 * DAY_MS], ['recent', -10 * DAY_MS], ['upcoming', 2 * DAY_MS]] as const) {
      games[key] = (
        await payload.create({
          collection: 'games',
          overrideAccess: true,
          data: {
            title: `Cleanup ${key} ${suffix}`, sport: 'football', level: 'medium', arena: arenaId, host: userId,
            scheduledAt: new Date(Date.now() + offset).toISOString(), maxPlayers: 10, availablePlayers: 9,
            status: 'scheduled', contactPhone: '+994501234567',
          },
        })
      ).id
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: games[key], user: userId, side: 'home', phone: '+994501234567' } })
    }
    await payload.create({ collection: 'game-waitlist', overrideAccess: true, data: { game: games.recent, user: userId, name: 'Cleanup', phone: '+994501234567' } })
    await payload.create({ collection: 'game-waitlist', overrideAccess: true, data: { game: games.upcoming, user: userId, name: 'Cleanup', phone: '+994501234567' } })
    for (const daysAgo of [100, 1]) {
      await db.execute(sql`INSERT INTO join_attempts (outcome, user_id, ip, created_at, updated_at) VALUES ('JOINED', ${userId}, ${`cleanup-${suffix}`}, now() - make_interval(days => ${daysAgo}), now())`)
    }
    await db.execute(sql`INSERT INTO rate_limits (key, window_start, count, created_at, updated_at) VALUES (${`cleanup:${suffix}`}, now() - interval '2 days', 1, now(), now())`)
  })

  afterAll(async () => {
    if (!payload) return
    await db.execute(sql`DELETE FROM join_attempts WHERE ip = ${`cleanup-${suffix}`}`)
    await db.execute(sql`DELETE FROM games WHERE id IN (${games.old}, ${games.recent}, ${games.upcoming})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { equals: userId } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('needs the cron secret', async () => {
    const before = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'cleanup-secret'
    try {
      expect((await cleanupRoute(new Request('http://localhost/api/cron/cleanup'))).status).toBe(401)
      expect((await cleanupRoute(new Request('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401)
      delete process.env.CRON_SECRET
      expect((await cleanupRoute(new Request('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer ' } }))).status).toBe(401)
    } finally {
      if (before === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = before
    }
  })

  it('removes old logs and numbers, and keeps what is still needed', async () => {
    await cleanUpOldData(db)

    const attempts = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM join_attempts WHERE ip = ${`cleanup-${suffix}`}`)
    expect(Number(attempts.rows[0].n)).toBe(1)
    const windows = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM rate_limits WHERE key = ${`cleanup:${suffix}`}`)
    expect(Number(windows.rows[0].n)).toBe(0)

    const phones = await db.execute<{ id: number; contact_phone: string | null; phone: string | null }>(sql`
      SELECT g.id, g.contact_phone, p.phone FROM games g JOIN game_participants p ON p.game_id = g.id
      WHERE g.id IN (${games.old}, ${games.recent}, ${games.upcoming}) ORDER BY g.scheduled_at`)
    expect(phones.rows.map((row) => [row.contact_phone, row.phone])).toEqual([
      [null, null],
      ['+994501234567', '+994501234567'],
      ['+994501234567', '+994501234567'],
    ])

    const waiting = await db.execute<{ game_id: number }>(sql`SELECT game_id FROM game_waitlist WHERE user_id = ${userId}`)
    expect(waiting.rows.map((row) => row.game_id)).toEqual([games.upcoming])
  })
})
