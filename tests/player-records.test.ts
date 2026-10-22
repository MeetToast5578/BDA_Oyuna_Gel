import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { playerRecords } from '@/lib/records'

const HOUR_MS = 60 * 60 * 1000

/** The SQL twin of `resultCounts`: which finished games go into a player's record. */
describe.skipIf(!process.env.DATABASE_URL)('playerRecords (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  let userId: number
  let rivalId: number
  const gameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    userId = (
      await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `records-${suffix}@oyunagel.test`, password: 'records-test-password', fullName: 'Records' },
      })
    ).id
    rivalId = (
      await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `records-${suffix}-rival@oyunagel.test`, password: 'records-test-password', fullName: 'Rival' },
      })
    ).id
    arenaId = (
      await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Records Arena ${suffix}`, location: 'Bakı' } })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
    await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: [userId, rivalId] } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  async function played(
    resultStatus: 'reported' | 'confirmed' | 'disputed' | undefined,
    { status = 'scheduled', reportedHoursAgo = 1, rival = true }: { status?: 'scheduled' | 'cancelled'; reportedHoursAgo?: number; rival?: boolean } = {},
  ) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Records Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: userId,
        scheduledAt: new Date(Date.now() - 72 * HOUR_MS).toISOString(),
        maxPlayers: 10,
        availablePlayers: 9,
        contactPhone: '+994501234567',
        status,
        homeScore: 2,
        awayScore: 1,
        resultStatus,
        resultReportedAt: new Date(Date.now() - reportedHoursAgo * HOUR_MS).toISOString(),
      },
    })
    gameIds.push(game.id)
    await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: userId, side: 'home' } })
    if (rival) await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: rivalId, side: 'away' } })
  }

  it('counts confirmed scores and old undisputed reports someone could have disputed, and nothing else', async () => {
    await played('confirmed')
    await played('reported', { reportedHoursAgo: 49 })
    // Nobody with an account on the other side: the report waits for an admin.
    await played('reported', { reportedHoursAgo: 49, rival: false })
    await played('reported', { reportedHoursAgo: 1 })
    await played('disputed')
    await played('confirmed', { status: 'cancelled' })
    await played(undefined)

    const records = await playerRecords((payload.db as unknown as PostgresAdapter).drizzle, [userId])
    expect(records.get(userId)).toHaveLength(2)
    expect(records.get(userId)?.[0]).toMatchObject({ side: 'home', homeScore: 2, awayScore: 1 })
  })
})
