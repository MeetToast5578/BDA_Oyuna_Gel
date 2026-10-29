import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { ELO_K, ELO_START } from '@/lib/elo'
import { getMyProfile, getPublicProfile } from '@/lib/profile-queries'

const HOUR_MS = 3_600_000

/** Elo, the played-games history and the stats, on both kinds of profile, from the real database. */
describe.skipIf(!process.env.DATABASE_URL)('profile Elo and history (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const ids: Record<'a' | 'b' | 'c', number> = { a: 0, b: 0, c: 0 }
  const games: Record<'counted' | 'reported' | 'cancelled' | 'upcoming', number> = { counted: 0, reported: 0, cancelled: 0, upcoming: 0 }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    for (const who of ['a', 'b', 'c'] as const) {
      ids[who] = (await payload.create({ collection: 'users', overrideAccess: true, data: { email: `elo-${suffix}-${who}@oyunagel.test`, password: 'elo-test-password', fullName: `Elo ${who}` } })).id
    }
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Elo Arena ${suffix}`, location: 'Bakı', city: 'baku' } })).id
    const game = async (key: keyof typeof games, hours: number, away: number, score: [number, number] | null, result: string | null, status = 'scheduled') => {
      games[key] = (
        await payload.create({
          collection: 'games',
          overrideAccess: true,
          data: {
            title: `Elo ${key} ${suffix}`, sport: 'tennis', level: 'medium', arena: arenaId, host: ids.a,
            scheduledAt: new Date(Date.now() + hours * HOUR_MS).toISOString(), maxPlayers: 4, availablePlayers: 2,
            status: status as 'scheduled' | 'cancelled',
          },
        })
      ).id
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: games[key], user: ids.a, side: 'home' } })
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: games[key], user: away, side: 'away' } })
      if (score) await db.execute(sql`UPDATE games SET home_score = ${score[0]}, away_score = ${score[1]}, result_status = ${result}, result_reported_at = now() WHERE id = ${games[key]}`)
    }
    await game('counted', -48, ids.b, [2, 1], 'confirmed')
    await game('reported', -24, ids.c, [0, 3], 'reported')
    await game('cancelled', -12, ids.c, null, null, 'cancelled')
    await game('upcoming', 24, ids.b, null, null)
  })

  afterAll(async () => {
    if (!payload) return
    await (payload.db as unknown as PostgresAdapter).drizzle.execute(sql`DELETE FROM games WHERE id IN (${sql.join(Object.values(games).map((id) => sql`${id}`), sql`, `)})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(ids) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('rates the counted game, and lists played games newest first with the score from each side', async () => {
    const a = (await getMyProfile(ids.a))!
    expect(a.elo).toEqual([expect.objectContaining({ sport: 'tennis', label: 'Tennis', rating: ELO_START + ELO_K / 2, peak: ELO_START + ELO_K / 2, games: 1 })])
    expect(a.elo[0].history).toEqual([expect.objectContaining({ gameId: String(games.counted), rating: ELO_START + ELO_K / 2 })])
    // Not the cancelled game, not the upcoming one; the reported score shows, but no result until it counts.
    expect(a.history.map((game) => [game.id, game.score, game.outcome, game.eloDelta])).toEqual([
      [String(games.reported), { mine: 0, theirs: 3 }, null, null],
      [String(games.counted), { mine: 2, theirs: 1 }, 'win', ELO_K / 2],
    ])

    const b = (await getPublicProfile(ids.b))!
    expect(b.elo[0]).toMatchObject({ rating: ELO_START - ELO_K / 2 })
    expect(b.history).toEqual([expect.objectContaining({ id: String(games.counted), score: { mine: 1, theirs: 2 }, outcome: 'loss', eloDelta: -ELO_K / 2 })])
    expect(b.stats).toMatchObject({ totalPlayed: 1, upcoming: 1 })
    expect(b.stats.playedByMonth).toHaveLength(6)

    // Nobody on C's side counted yet: no rating, but the played game is in the history.
    const c = (await getPublicProfile(ids.c))!
    expect(c.elo).toEqual([])
    expect(c.history.map((game) => game.id)).toEqual([String(games.reported)])
  })
})
