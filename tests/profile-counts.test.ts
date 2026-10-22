import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { getMyProfile } from '@/lib/profile-queries'

const DAY_MS = 24 * 3600_000

/** The profile's counts and per-sport stats, from one query, against a known mix of games. */
describe.skipIf(!process.env.DATABASE_URL)('profile counts (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let me: number
  let other: number
  let arenaId: number
  const gameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    const user = async (name: string) =>
      (await payload.create({ collection: 'users', overrideAccess: true, data: { email: `counts-${suffix}-${name}@oyunagel.test`, password: 'counts-test-password', fullName: name } })).id
    me = await user('me')
    other = await user('other')
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Counts Arena ${suffix}`, location: 'Bakı' } })).id

    const game = async (host: number | null, days: number, sport: 'football' | 'tennis', players: number[], cancelled = false) => {
      const id = (
        await payload.create({
          collection: 'games',
          overrideAccess: true,
          data: {
            title: `Counts ${suffix}`, sport, level: 'medium', arena: arenaId, host: host ?? other,
            scheduledAt: new Date(Date.now() + days * DAY_MS).toISOString(), maxPlayers: 4, availablePlayers: 4 - players.length,
            status: cancelled ? 'cancelled' : 'scheduled',
          },
        })
      ).id
      gameIds.push(id)
      for (const player of players) await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: id, user: player, side: 'home' } })
      // A host whose account is gone: the game stays with no host.
      if (host === null) await (payload.db as unknown as PostgresAdapter).drizzle.execute(sql`UPDATE games SET host_id = NULL WHERE id = ${id}`)
    }
    await game(me, 2, 'football', [me]) // hosting upcoming
    await game(me, -2, 'tennis', [me]) // hosted past
    await game(me, -3, 'football', [me], true) // hosted, cancelled: not played
    await game(other, 3, 'football', [other, me]) // joined upcoming
    await game(other, -4, 'football', [other, me]) // played
    await game(null, -5, 'tennis', [me]) // played, host deleted
    await game(other, -6, 'football', [other, me], true) // joined, cancelled: not played
    await game(other, -7, 'football', [other]) // someone else's game
  })

  afterAll(async () => {
    if (!payload) return
    await (payload.db as unknown as PostgresAdapter).drizzle.execute(sql`DELETE FROM games WHERE id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: [me, other] } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('counts hosted and joined games, upcoming and played, and played per sport', async () => {
    const profile = await getMyProfile(me)
    expect(profile?.counts).toEqual({ hostingUpcoming: 1, hostedPast: 1, joinedUpcoming: 1, played: 2 })
    expect(profile?.stats.totalPlayed).toBe(3)
    expect(Object.fromEntries(profile!.stats.playedBySport.map((row) => [row.sport, row.playedCount]))).toEqual({ football: 1, tennis: 2, basketball: 0 })
  })
})
