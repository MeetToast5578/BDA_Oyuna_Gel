import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { DEMO_HOST_EMAIL, planDemoGames, refreshDemoGames } from '@/lib/demo-games'
import { claimSpot } from '@/lib/join-game'
import { joinWaitlist } from '@/lib/waitlist'
import { normalizeGameRecord, toGameCard } from '@/lib/game-backend'
import { playerStandings } from '@/lib/records'
import type { PostgresAdapter } from '@payloadcms/db-postgres'

it('plans seven future Baku evenings per sport, with no duplicate keys', () => {
  const now = new Date('2036-05-11T22:30:00Z') // Already May 12 in Baku.
  const plan = planDemoGames(now)
  expect(plan).toHaveLength(21)
  expect(new Set(plan.map((game) => game.key)).size).toBe(21)
  expect(plan[0].date.toISOString()).toBe('2036-05-13T15:00:00.000Z')
  for (const sport of ['football', 'basketball', 'tennis']) expect(plan.filter((game) => game.sport === sport)).toHaveLength(7)
  expect(toGameCard(normalizeGameRecord({ isDemo: true })).isDemo).toBe(true)
  expect(toGameCard(normalizeGameRecord({})).isDemo).toBeUndefined()
})

describe.skipIf(!process.env.DATABASE_URL)('safe demo refresh (Postgres)', () => {
  let payload: Payload
  let userId: number
  let arenaId: number
  let canaryId: number
  let beforeUsers: number[]
  let beforeArenas: number[]
  let beforeGames: number[]
  const now = new Date('2036-05-11T22:30:00Z')
  const ids = async (table: string) => (await payload.db.pool.query(`SELECT id FROM ${table}`)).rows.map((row: { id: number }) => row.id)
  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    beforeUsers = await ids('users'); beforeArenas = await ids('arenas'); beforeGames = await ids('games')
    userId = (await payload.create({ collection: 'users', data: { email: `refresh-real-${Date.now()}@oyunagel.test`, password: 'test-password', fullName: 'Real canary' } })).id
    arenaId = (await payload.create({ collection: 'arenas', data: { name: 'Refresh canary venue', location: 'Bakı', city: 'baku' } })).id
    canaryId = (await payload.create({ collection: 'games', data: { title: 'Historical real game', sport: 'football', level: 'medium', host: userId, arena: arenaId, scheduledAt: '2025-01-01T15:00:00Z', maxPlayers: 10, availablePlayers: 3, status: 'finished', homeScore: 2, awayScore: 1, resultStatus: 'confirmed' } })).id
  })
  afterAll(async () => {
    if (!payload) return
    // Delete only this test's keys and resources, even if another client wrote unrelated rows.
    const keys = [...planDemoGames(now), ...planDemoGames(new Date(now.getTime() + 86400000))].map((game) => game.key)
    await payload.db.pool.query('DELETE FROM games WHERE (id=$1 OR demo_key=ANY($2::varchar[])) AND NOT (id=ANY($3::int[]))', [canaryId, keys, beforeGames])
    await payload.db.pool.query("DELETE FROM arenas WHERE (id=$1 OR name=ANY($2::varchar[])) AND NOT (id=ANY($3::int[]))", [arenaId, ['Nümunə meydança · Futbol', 'Nümunə meydança · Basketbol', 'Nümunə meydança · Tennis'], beforeArenas])
    await payload.db.pool.query('DELETE FROM users WHERE (id=$1 OR email=$2) AND NOT (id=ANY($3::int[]))', [userId, DEMO_HOST_EMAIL, beforeUsers])
    await payload.db.destroy?.()
  })
  it('previews without writes, serialises concurrent reruns, and preserves existing games', async () => {
    const counts = async () => Promise.all(['users', 'arenas', 'games', 'teams', 'game_participants'].map(async (table) => (await ids(table)).length))
    const before = await counts()
    const canary = (await payload.db.pool.query('SELECT * FROM games WHERE id=$1', [canaryId])).rows[0]
    expect(await refreshDemoGames(payload, { now })).toMatchObject({ applied: false, wouldCreate: 21, created: 0 })
    expect(await counts()).toEqual(before)
    const runs = await Promise.all([refreshDemoGames(payload, { now, apply: true }), refreshDemoGames(payload, { now, apply: true })])
    expect(runs.map((run) => run.created).sort((a, b) => a - b)).toEqual([0, 21])
    const demo = await payload.db.pool.query('SELECT * FROM games WHERE demo_key = ANY($1::varchar[]) ORDER BY demo_key', [planDemoGames(now).map((game) => game.key)])
    expect(demo.rows).toHaveLength(21)
    expect(demo.rows.every((game) => game.is_demo && game.home_score === null && game.away_score === null && game.contact_phone === null)).toBe(true)
    const next = await refreshDemoGames(payload, { now: new Date(now.getTime() + 86400000), apply: true })
    expect(next.created).toBe(3)
    expect((await payload.db.pool.query('SELECT * FROM games WHERE id=$1', [canaryId])).rows[0]).toEqual(canary)
    expect((await payload.db.pool.query('SELECT * FROM games WHERE demo_key = ANY($1::varchar[]) ORDER BY demo_key', [planDemoGames(now).map((game) => game.key)])).rows).toEqual(demo.rows)
    expect((await payload.find({ collection: 'users', where: { email: { equals: DEMO_HOST_EMAIL } }, overrideAccess: true })).totalDocs).toBe(1)
    expect(await claimSpot(payload, demo.rows[0].id, userId)).toEqual({ ok: false, code: 'GAME_NOT_JOINABLE' })
    expect(await joinWaitlist(payload, demo.rows[0].id, userId, '+994502103456', 'Test')).toEqual({ ok: false, code: 'GAME_NOT_JOINABLE' })
    expect((await payload.db.pool.query('SELECT available_players FROM games WHERE id=$1', [demo.rows[0].id])).rows[0].available_players).toBe(demo.rows[0].available_players)
    // Even an administrator supplying a demo score must not invent a real player's ranking.
    const football = demo.rows.find((game) => game.sport === 'football')!
    await payload.db.pool.query("UPDATE games SET home_score=3, away_score=1, result_status='confirmed' WHERE id=$1", [football.id])
    await payload.create({ collection: 'game-participants', data: { game: football.id, user: userId, side: 'home' } })
    expect((await playerStandings((payload.db as unknown as PostgresAdapter).drizzle, 'football')).some((player) => player.id === String(userId))).toBe(false)
  })
})
