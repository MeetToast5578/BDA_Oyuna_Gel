import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import type { CreateGameInput } from '@/lib/game-backend'
import { updateGame } from '@/lib/game-queries'
import { claimSpot, releaseSpot } from '@/lib/join-game'

const HOUR_MS = 60 * 60 * 1000

/**
 * An edit saved while players join or leave must keep their spots. The edit route reads the player
 * count first and saves later, so each test lets a join or leave land in between, the way a real
 * race would, and then saves the edit built from the stale count.
 */
describe.skipIf(!process.env.DATABASE_URL)('editing a game while players join (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    for (const n of [1, 2, 3]) {
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `edit-${suffix}-${n}@oyunagel.test`, password: 'edit-test-password', fullName: `Edit ${n}` },
      })
      userIds.push(user.id)
    }
    arenaId = (
      await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Edit Arena ${suffix}`, location: 'Bakı' } })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    if (gameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
      await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    }
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: userIds } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  /** A 10-player game with only its host in it. */
  async function makeGame(hoursFromNow = 3) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Edit Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: userIds[0],
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers: 10,
        availablePlayers: 9,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: userIds[0], side: 'home' } })
    gameIds.push(game.id)
    return game.id
  }

  /** The edit form's input as the route builds it, from a `currentCount` read before the save. */
  const edit = (maxCount: number, staleCount: number, scheduledAt = new Date(Date.now() + 3 * HOUR_MS)): CreateGameInput => ({
    title: `Edited ${suffix}`,
    sport: 'football',
    level: 'medium',
    venueId: arenaId,
    scheduledAt,
    maxCount,
    currentCount: staleCount,
    contactPhone: '+994501234567',
  })

  const available = async (gameId: number) =>
    (await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })).availablePlayers

  it('keeps a spot taken by a join that lands between the read and the save', async () => {
    const gameId = await makeGame()
    const staleCount = 1
    expect((await claimSpot(payload, gameId, userIds[1])).ok).toBe(true)

    const result = await updateGame(gameId, edit(12, staleCount))
    expect(result.ok).toBe(true)
    // 12 spots, the host and the player who just joined: 10 left, not 11.
    expect(await available(gameId)).toBe(10)
    expect(result.ok && result.game.title).toBe(`Edited ${suffix}`)
  })

  it('keeps a spot freed by a leave that lands between the read and the save', async () => {
    const gameId = await makeGame()
    expect((await claimSpot(payload, gameId, userIds[1])).ok).toBe(true)
    const staleCount = 2
    expect((await releaseSpot(payload, gameId, userIds[1])).ok).toBe(true)

    expect((await updateGame(gameId, edit(10, staleCount))).ok).toBe(true)
    expect(await available(gameId)).toBe(9)
  })

  it('refuses shrinking below the players who are in by the time it saves, and changes nothing', async () => {
    const gameId = await makeGame()
    const staleCount = 1
    expect((await claimSpot(payload, gameId, userIds[1])).ok).toBe(true)
    expect((await claimSpot(payload, gameId, userIds[2])).ok).toBe(true)

    const result = await updateGame(gameId, edit(2, staleCount))
    expect(result).toMatchObject({ ok: false, code: 'MAX_COUNT_BELOW_PLAYERS' })
    const game = await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })
    expect([game.maxPlayers, game.availablePlayers, game.title]).toEqual([10, 7, `Edit Game ${suffix}`])
  })

  it('refuses shrinking a side below the players already on it, and changes nothing', async () => {
    const gameId = await makeGame()
    expect(await claimSpot(payload, gameId, userIds[1], null, null, 'home')).toMatchObject({ ok: true, side: 'home' })
    expect(await claimSpot(payload, gameId, userIds[2], null, null, 'home')).toMatchObject({ ok: true, side: 'home' })

    // Four players fit three, but not three on one side of two.
    const result = await updateGame(gameId, edit(4, 3))
    expect(result).toMatchObject({ ok: false, code: 'SIDE_FULL' })
    const game = await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })
    expect([game.maxPlayers, game.availablePlayers, game.title]).toEqual([10, 7, `Edit Game ${suffix}`])
  })

  it('refuses an edit that saves after kick-off', async () => {
    const gameId = await makeGame(-0.1)
    expect(await updateGame(gameId, edit(10, 1))).toMatchObject({ ok: false, code: 'GAME_STARTED' })
    expect((await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })).title).toBe(`Edit Game ${suffix}`)
  })
})
