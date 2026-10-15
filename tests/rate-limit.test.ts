import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { POST as join } from '@/app/api/v1/games/[id]/join/route'
import { POST as leave } from '@/app/api/v1/games/[id]/leave/route'
import { tooManyRecentAttempts } from '@/lib/join-game'

/**
 * Join and leave answer 429 once a user or an IP has made 10 requests in the last minute, counted
 * from the `join-attempts` log. Runs against the database in DATABASE_URL; every record it creates
 * is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('join and leave rate limit (Postgres)', () => {
  const suffix = Date.now()
  const ip = `203.0.113.${suffix % 250}`
  let payload: Payload
  let userId: number
  let otherUserId: number
  let token: string
  let arenaId: number
  let gameId: number

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const email = `rate-${suffix}@oyunagel.test`
    userId = (
      await payload.create({ collection: 'users', data: { email, password: 'rate-test-password', fullName: 'Rate Test' } })
    ).id
    otherUserId = (
      await payload.create({
        collection: 'users',
        data: { email: `rate-${suffix}-other@oyunagel.test`, password: 'rate-test-password', fullName: 'Rate Other' },
      })
    ).id
    token = (await payload.login({ collection: 'users', data: { email, password: 'rate-test-password' } })).token ?? ''
    arenaId = (await payload.create({ collection: 'arenas', data: { name: `Rate Arena ${suffix}`, location: 'Bakı' } })).id
    gameId = (
      await payload.create({
        collection: 'games',
        data: {
          title: `Rate Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: otherUserId,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          maxPlayers: 10,
          availablePlayers: 5,
          status: 'scheduled',
        },
      })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    await clearLog()
    await payload.delete({ collection: 'games', where: { id: { equals: gameId } } })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } } })
    await payload.delete({ collection: 'users', where: { id: { in: [userId, otherUserId] } } })
    await payload.db.destroy?.()
  })

  const db = () => (payload.db as unknown as PostgresAdapter).drizzle

  async function clearLog() {
    await db().execute(sql`DELETE FROM join_attempts WHERE user_id IN (${userId}, ${otherUserId}) OR ip = ${ip}`)
  }

  async function logAttempts(count: number, entry: { userId: number | null; ip: string | null }) {
    for (let i = 0; i < count; i++) {
      await payload.create({
        collection: 'join-attempts',
        overrideAccess: true,
        data: { outcome: 'GAME_FULL', gameId, user: entry.userId, ip: entry.ip },
      })
    }
  }

  const call = (handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>) =>
    handler(
      new Request(`http://localhost/api/v1/games/${gameId}/x`, {
        method: 'POST',
        headers: { Cookie: `payload-token=${token}`, 'x-forwarded-for': ip, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Rate Test', phone: '+994501234567' }),
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    )

  async function spotsLeft() {
    return (await payload.findByID({ collection: 'games', id: gameId, depth: 0 })).availablePlayers
  }

  it('lets the tenth request in a minute through, and refuses the eleventh', async () => {
    await clearLog()
    await logAttempts(9, { userId, ip: null })
    expect(await tooManyRecentAttempts(payload, userId, ip)).toBe(false)
    await logAttempts(1, { userId, ip: null })
    expect(await tooManyRecentAttempts(payload, userId, ip)).toBe(true)
  })

  it('answers 429 on join and leave without touching the game', async () => {
    await clearLog()
    await logAttempts(10, { userId, ip: null })
    const before = await spotsLeft()

    for (const handler of [join, leave]) {
      const response = await call(handler)
      expect(response.status).toBe(429)
      expect((await response.json()).error.code).toBe('RATE_LIMITED')
    }
    expect(await spotsLeft()).toBe(before)
    const joined = await payload.count({
      collection: 'game-participants',
      where: { game: { equals: gameId }, user: { equals: userId } },
    })
    expect(joined.totalDocs).toBe(0)
  })

  it('counts an IP across accounts', async () => {
    await clearLog()
    await logAttempts(10, { userId: otherUserId, ip })
    expect(await tooManyRecentAttempts(payload, userId, ip)).toBe(true)
    expect(await tooManyRecentAttempts(payload, userId, '198.51.100.1')).toBe(false)
  })

  it('forgets attempts older than a minute', async () => {
    await clearLog()
    await logAttempts(10, { userId, ip })
    await db().execute(sql`UPDATE join_attempts SET created_at = now() - interval '61 seconds' WHERE user_id = ${userId}`)
    expect(await tooManyRecentAttempts(payload, userId, ip)).toBe(false)
  })
})
