import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Rules the database itself enforces (migration 20261022_090732_schema_guards), so no code path, admin
 * edit or future bug can store a game the app can't reason about. Also watches the hand-set delete
 * rules: Payload's snapshot still says SET NULL, so a regenerated migration could quietly put it back.
 */
describe.skipIf(!process.env.DATABASE_URL)('schema guards (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let db: PostgresAdapter['drizzle']
  let userId: number
  let arenaId: number
  let gameId: number
  let teamId: number

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    db = (payload.db as unknown as PostgresAdapter).drizzle
    userId = (
      await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `guards-${suffix}@oyunagel.test`, password: 'guards-test-password', fullName: 'Guards' },
      })
    ).id
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Guards Arena ${suffix}`, location: 'Bakı' } })).id
    gameId = (
      await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Guards Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: userId,
          scheduledAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          maxPlayers: 10,
          availablePlayers: 9,
          status: 'scheduled',
        },
      })
    ).id
    await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: gameId, user: userId, side: 'home' } })
    teamId = (
      await payload.create({ collection: 'teams', overrideAccess: true, data: { name: `Guards Team ${suffix}`, sport: 'football', members: [userId], captain: userId } })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    await db.execute(sql`DELETE FROM games WHERE id = ${gameId}`)
    await payload.delete({ collection: 'teams', where: { id: { equals: teamId } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { equals: userId } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('keeps the hand-set delete rules', async () => {
    const { rows } = await db.execute<{ conname: string; confdeltype: string }>(sql`
      SELECT conname, confdeltype FROM pg_constraint
      WHERE conname IN ('game_participants_game_id_games_id_fk', 'game_participants_user_id_users_id_fk', 'games_arena_id_arenas_id_fk')
      ORDER BY conname
    `)
    // c = cascade, r = restrict
    expect(rows.map((row) => [row.conname, row.confdeltype])).toEqual([
      ['game_participants_game_id_games_id_fk', 'c'],
      ['game_participants_user_id_users_id_fk', 'c'],
      ['games_arena_id_arenas_id_fk', 'r'],
    ])
  })

  it('refuses impossible spots and scores', async () => {
    const refused = (change: ReturnType<typeof sql>) => expect(db.execute(sql`UPDATE games SET ${change} WHERE id = ${gameId}`)).rejects.toThrow()
    await refused(sql`available_players = 11`)
    await refused(sql`available_players = -1`)
    await refused(sql`available_players = 3.5`)
    await refused(sql`max_players = 1, available_players = 0`)
    await refused(sql`home_score = 2`)
    await refused(sql`home_score = -1, away_score = 0`)
    await refused(sql`result_status = 'confirmed'`)
    await refused(sql`home_team_id = ${teamId}, away_team_id = ${teamId}`)
    const { rows } = await db.execute<{ available_players: string }>(sql`SELECT available_players FROM games WHERE id = ${gameId}`)
    expect(Number(rows[0].available_players)).toBe(9)
  })

  it('refuses a second membership row for the same person', async () => {
    await expect(
      db.execute(sql`INSERT INTO teams_rels ("order", parent_id, path, users_id) VALUES (2, ${teamId}, 'members', ${userId})`),
    ).rejects.toThrow()
  })

  it('keeps a venue that has games, and takes participant rows with their game', async () => {
    await expect(db.execute(sql`DELETE FROM arenas WHERE id = ${arenaId}`)).rejects.toThrow()
    await db.execute(sql`DELETE FROM games WHERE id = ${gameId}`)
    const { rows } = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM game_participants WHERE game_id = ${gameId}`)
    expect(Number(rows[0].n)).toBe(0)
  })
})
