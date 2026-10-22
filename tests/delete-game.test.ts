import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { deleteGame, getGameDetail, getGameHostId } from '@/lib/game-queries'
import { claimSpot } from '@/lib/join-game'

/**
 * `game_participants.game_id` is ON DELETE SET NULL, so dropping a game on its own would leave its
 * participant rows behind pointing at nothing — and those orphans then turn up in participant
 * lookups. These tests are what keep the explicit cleanup in `deleteGame` honest.
 *
 * Runs against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('deleteGame (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let userIds: number[]
  let arenaId: number
  const strayGameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const users = await Promise.all(
      [1, 2].map((n) =>
        payload.create({
          collection: 'users',
          overrideAccess: true,
          data: {
            email: `delete-test-${suffix}-${n}@oyunagel.test`,
            password: 'delete-test-password',
            fullName: `Delete Test ${n}`,
          },
        }),
      ),
    )
    userIds = users.map((user) => user.id)
    arenaId = (
      await payload.create({
        collection: 'arenas',
        overrideAccess: true,
        data: { name: `Delete Test Arena ${suffix}`, location: 'Bakı', city: 'baku' },
      })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    if (strayGameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: strayGameIds } } })
      await payload.delete({ collection: 'games', where: { id: { in: strayGameIds } } })
    }
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } } })
    await payload.delete({ collection: 'users', where: { id: { in: userIds } } })
    await payload.db.destroy?.()
  })

  async function createGame() {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Delete Test Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: userIds[0],
        scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        maxPlayers: 10,
        availablePlayers: 5,
        status: 'scheduled',
      },
    })
    strayGameIds.push(game.id)
    return game.id
  }

  /** Participant rows whose game is gone — what the SET NULL foreign key would leave behind. */
  async function orphanCount() {
    const { totalDocs } = await payload.count({
      collection: 'game-participants',
      where: { game: { exists: false } },
      overrideAccess: true,
    })
    return totalDocs
  }

  it('removes the game and every participant, leaving no orphan rows', async () => {
    const gameId = await createGame()
    expect(await claimSpot(payload, gameId, userIds[0], null, 'Host')).toMatchObject({ ok: true })
    expect(await claimSpot(payload, gameId, userIds[1], null, 'Player')).toMatchObject({ ok: true })

    const orphansBefore = await orphanCount()

    await deleteGame(gameId)

    expect(await getGameDetail(gameId, null)).toBeNull()
    const { totalDocs: left } = await payload.count({
      collection: 'game-participants',
      where: { game: { equals: gameId } },
      overrideAccess: true,
    })
    expect(left).toBe(0)
    // The real regression: participants detached instead of deleted.
    expect(await orphanCount()).toBe(orphansBefore)
  })

  it('deletes a game nobody joined', async () => {
    const gameId = await createGame()
    await deleteGame(gameId)
    expect(await getGameDetail(gameId, null)).toBeNull()
  })

  it('reports the host so the API can refuse everyone else', async () => {
    const gameId = await createGame()
    expect(await getGameHostId(gameId)).toBe(userIds[0])
    expect(await getGameHostId(2_000_000_000)).toBeNull()
  })
})
