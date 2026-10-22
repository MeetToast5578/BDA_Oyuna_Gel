import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { POST as join } from '@/app/api/v1/games/[id]/join/route'
import { POST as leave } from '@/app/api/v1/games/[id]/leave/route'
import { isRateLimited } from '@/lib/rate-limit'

/**
 * Join and leave answer 429 once a user or an IP has made 10 requests in a minute, counted in
 * `rate_limits`. Runs against the database in DATABASE_URL; every record it creates is removed afterwards.
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
    await clearCounts()
    await payload.delete({ collection: 'games', where: { id: { equals: gameId } } })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } } })
    await payload.delete({ collection: 'users', where: { id: { in: [userId, otherUserId] } } })
    await payload.db.destroy?.()
  })

  const db = () => (payload.db as unknown as PostgresAdapter).drizzle

  async function clearCounts() {
    await db().execute(sql`DELETE FROM rate_limits WHERE key LIKE ${`%:user:${userId}`} OR key LIKE ${`%:user:${otherUserId}`} OR key LIKE ${`%:ip:${ip}`}`)
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
    await clearCounts()
    for (let i = 0; i < 10; i++) expect(await isRateLimited(payload, 'spot', { userId })).toBe(false)
    expect(await isRateLimited(payload, 'spot', { userId })).toBe(true)
  })

  it('lets exactly ten of twenty parallel requests through', async () => {
    await clearCounts()
    const answers = await Promise.all(Array.from({ length: 20 }, () => isRateLimited(payload, 'spot', { userId })))
    expect(answers.filter((limited) => !limited)).toHaveLength(10)
  })

  it('answers 429 on join and leave without touching the game', async () => {
    await clearCounts()
    for (let i = 0; i < 10; i++) await isRateLimited(payload, 'spot', { userId })
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

  it('counts an IP across accounts, and keeps actions apart', async () => {
    await clearCounts()
    for (let i = 0; i < 10; i++) await isRateLimited(payload, 'spot', { userId: otherUserId, ip })
    expect(await isRateLimited(payload, 'spot', { userId, ip })).toBe(true)
    expect(await isRateLimited(payload, 'spot', { userId, ip: '198.51.100.1' })).toBe(false)
    expect(await isRateLimited(payload, 'createGame', { userId, ip })).toBe(false)
  })

  it('starts afresh in the next window', async () => {
    await clearCounts()
    for (let i = 0; i < 11; i++) await isRateLimited(payload, 'spot', { userId })
    await db().execute(sql`UPDATE rate_limits SET window_start = window_start - interval '1 minute' WHERE key = ${`spot:user:${userId}`}`)
    expect(await isRateLimited(payload, 'spot', { userId })).toBe(false)
  })
})
