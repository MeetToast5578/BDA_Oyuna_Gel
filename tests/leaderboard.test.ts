import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { playerStandings } from '@/lib/records'

const DAY_MS = 24 * 3600_000

/** The player leaderboard: league order from counted scores only, ties broken by goals. */
describe.skipIf(!process.env.DATABASE_URL)('player leaderboard (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const users: Record<'a' | 'b' | 'c', number> = { a: 0, b: 0, c: 0 }
  const gameIds: number[] = []
  const db = () => (payload.db as unknown as PostgresAdapter).drizzle

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    for (const name of ['a', 'b', 'c'] as const) {
      users[name] = (
        await payload.create({
          collection: 'users',
          overrideAccess: true,
          data: { email: `board-${suffix}-${name}@oyunagel.test`, password: 'board-test-password', fullName: `Board ${name.toUpperCase()}` },
        })
      ).id
    }
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Board Arena ${suffix}`, location: 'Bakı', city: 'baku' } })).id

    const game = async (home: number, away: number, score: [number, number], status: 'confirmed' | 'reported', daysAgo = 2) => {
      const id = (
        await payload.create({
          collection: 'games',
          overrideAccess: true,
          data: {
            title: `Board ${suffix}`, sport: 'football', level: 'medium', arena: arenaId, host: home,
            scheduledAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(), maxPlayers: 4, availablePlayers: 2,
          },
        })
      ).id
      gameIds.push(id)
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: id, user: home, side: 'home' } })
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: id, user: away, side: 'away' } })
      await db().execute(sql`
        UPDATE games SET home_score = ${score[0]}, away_score = ${score[1]}, result_status = ${status}, result_reported_at = now()
        WHERE id = ${id}`)
    }
    await game(users.a, users.b, [3, 1], 'confirmed')
    await game(users.a, users.c, [2, 0], 'confirmed')
    await game(users.b, users.c, [1, 1], 'confirmed')
    await game(users.b, users.a, [2, 0], 'reported') // nobody answered yet: not counted
    await game(users.c, users.a, [5, 0], 'confirmed', 40) // weeks ago: in "Hamısı", not in a recent window
  })

  afterAll(async () => {
    if (!payload) return
    await db().execute(sql`DELETE FROM games WHERE id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(users) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('ranks by points, then goal difference, then goals scored, from counted scores in the window', async () => {
    const ours = async (since: Date | null) =>
      (await playerStandings(db(), 'football', since)).filter((row) => Object.values(users).includes(Number(row.id)))
    expect((await ours(new Date(Date.now() - 10 * DAY_MS))).map((row) => [row.name, row.record.played, row.record.points])).toEqual([
      ['Board A', 2, 6],
      // Level on points and goal difference (-2); B scored 2, C scored 1.
      ['Board B', 2, 1],
      ['Board C', 2, 1],
    ])
    // All time, the old game counts: C's win lifts C (4 points) over B (1).
    expect((await ours(null)).map((row) => [row.name, row.record.played, row.record.points])).toEqual([
      ['Board A', 3, 6],
      ['Board C', 3, 4],
      ['Board B', 2, 1],
    ])
    expect(await playerStandings(db(), 'tennis')).not.toContainEqual(expect.objectContaining({ id: String(users.a) }))
  })
})
