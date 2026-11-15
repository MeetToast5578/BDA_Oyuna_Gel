import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { DEMO_NAMES, demoPeople, demoStandings } from '@/lib/demo-players'
import { compareStandings } from '@/lib/team-logic'
import { playerStandings } from '@/lib/records'

describe('authored sample players', () => {
  it('uses distinct names and identities across all three sports with enough players for seeded games', () => {
    const people = demoPeople()
    expect(people).toHaveLength(48)
    expect(new Set(people.map((person) => person.fullName)).size).toBe(48)
    expect(new Set(people.map((person) => person.email)).size).toBe(48)
    expect(DEMO_NAMES.football.length).toBeGreaterThanOrEqual(14)
    expect(DEMO_NAMES.basketball.length).toBeGreaterThanOrEqual(10)
    expect(DEMO_NAMES.tennis.length).toBeGreaterThanOrEqual(4)
    // These are explicitly authored personas, not guesses about real users' genders.
    for (const name of ['Aysel Əliyeva', 'Nərmin Məmmədova', 'Leyla Hüseynova', 'Günel Quliyeva']) {
      expect(DEMO_NAMES.tennis).toContain(name)
      expect([...DEMO_NAMES.football, ...DEMO_NAMES.basketball]).not.toContain(name)
    }
  })
  it('keeps each sport sample separate, internally consistent and free of fake profile links', () => {
    for (const sport of ['football', 'basketball', 'tennis'] as const) {
      const rows = demoStandings(sport)
      expect(rows).toHaveLength(6)
      for (const [index, row] of rows.entries()) {
        expect(DEMO_NAMES[sport]).toContain(row.name)
        expect(row).not.toHaveProperty('href')
        expect(row.record.points).toBe(row.record.wins * 3 + row.record.draws)
        expect(row.record.played).toBe(row.record.wins + row.record.draws + row.record.losses)
        if (index) expect(compareStandings(rows[index - 1].record, row.record)).toBeLessThanOrEqual(0)
      }
      if (sport === 'tennis') expect(rows.every((row) => row.record.draws === 0)).toBe(true)
    }
  })
})

describe.skipIf(!process.env.DATABASE_URL)('real multi-sport players (Postgres)', () => {
  let payload: Payload
  let userId: number
  let arenaId: number
  const gameIds: number[] = []
  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    userId = (await payload.create({ collection: 'users', data: { email: `pools-real-${Date.now()}@oyunagel.test`, password: 'test-password', fullName: 'Nərmin · real test' } })).id
    arenaId = (await payload.create({ collection: 'arenas', data: { name: 'Multi-sport test venue', location: 'Bakı', city: 'baku' } })).id
    for (const sport of ['football', 'basketball'] as const) {
      const game = await payload.create({ collection: 'games', data: { title: 'Real multi-sport result', sport, level: 'medium', arena: arenaId, host: userId, scheduledAt: new Date(Date.now() - 86400000).toISOString(), maxPlayers: 10, availablePlayers: 9, status: 'finished', homeScore: 2, awayScore: 1, resultStatus: 'confirmed' } })
      gameIds.push(game.id)
      await payload.create({ collection: 'game-participants', data: { game: game.id, user: userId, side: 'home' } })
    }
  })
  afterAll(async () => {
    if (!payload) return
    if (gameIds.length) await payload.delete({ collection: 'games', where: { id: { in: gameIds } } })
    if (arenaId) await payload.delete({ collection: 'arenas', id: arenaId })
    if (userId) await payload.delete({ collection: 'users', id: userId })
    await payload.db.destroy?.()
  })
  it('retains real results in each sport without filtering names or gender', async () => {
    for (const sport of ['football', 'basketball']) {
      const rows = await playerStandings((payload.db as unknown as PostgresAdapter).drizzle, sport)
      expect(rows.find((row) => row.id === String(userId))?.record.wins).toBe(1)
    }
  })
})
