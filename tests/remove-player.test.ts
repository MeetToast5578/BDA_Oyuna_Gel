import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { DELETE } from '@/app/api/v1/games/[id]/players/[userId]/route'
import { claimSpot } from '@/lib/join-game'

const HOUR_MS = 60 * 60 * 1000

/**
 * The host takes a player out of a game that hasn't started. Route handlers are called with real
 * session cookies, against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('the host removing a player (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []
  const who = {} as Record<'host' | 'player' | 'other' | 'stranger' | 'admin', { id: number; token: string }>

  const makeUser = async (name: string, role: 'user' | 'admin' = 'user') => {
    const email = `remove-${suffix}-${name}@oyunagel.test`
    const user = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'remove-test-password', fullName: `Remove ${name}`, role } })
    userIds.push(user.id)
    const { token } = await payload.login({ collection: 'users', data: { email, password: 'remove-test-password' } })
    return { id: user.id, token: token ?? '' }
  }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    for (const name of ['host', 'player', 'other', 'stranger'] as const) who[name] = await makeUser(name)
    who.admin = await makeUser('admin', 'admin')
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Remove Arena ${suffix}`, location: 'Bakı' } })).id
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

  /** A 4-player game with the host and `player` (and `other`) in it. */
  async function makeGame({ hoursFromNow = 5, withOther = false } = {}) {
    const members = [who.host.id, who.player.id, ...(withOther ? [who.other.id] : [])]
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Remove Game ${suffix}`,
        sport: 'tennis',
        level: 'medium',
        arena: arenaId,
        host: who.host.id,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers: 4,
        availablePlayers: 4 - members.length,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    gameIds.push(game.id)
    for (const [i, user] of members.entries()) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user, side: i % 2 === 0 ? 'home' : 'away' } })
    }
    return game.id
  }

  const remove = (gameId: number, userId: number | string, as: keyof typeof who | null) =>
    DELETE(
      new Request(`http://localhost/api/v1/games/${gameId}/players/${userId}`, {
        method: 'DELETE',
        headers: as ? { Cookie: `payload-token=${who[as].token}` } : {},
      }),
      { params: Promise.resolve({ id: String(gameId), userId: String(userId) }) },
    ) as Promise<Response>

  const state = async (gameId: number) => {
    const game = await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })
    const rows = await payload.find({ collection: 'game-participants', where: { game: { equals: gameId } }, depth: 0, pagination: false, overrideAccess: true })
    return { free: game.availablePlayers, users: rows.docs.map((row) => Number(row.user)) }
  }

  it('takes the player out, gives the spot back, and answers with the players list', async () => {
    const gameId = await makeGame()
    const response = await remove(gameId, who.player.id, 'host')
    expect(response.status).toBe(200)
    expect((await response.json()).players).toEqual([])
    expect(await state(gameId)).toEqual({ free: 3, users: [who.host.id] })
    // The freed spot is really free: someone else can take it.
    expect((await claimSpot(payload, gameId, who.other.id)).ok).toBe(true)
  })

  it('refuses a stranger, a player and a signed-out caller, and lets an admin through', async () => {
    const gameId = await makeGame({ withOther: true })
    expect((await remove(gameId, who.player.id, null)).status).toBe(401)
    for (const as of ['stranger', 'other', 'player'] as const) {
      const response = await remove(gameId, who.player.id, as)
      expect(response.status, as).toBe(403)
      expect((await response.json()).error.code).toBe('NOT_GAME_HOST')
    }
    expect((await state(gameId)).users).toContain(who.player.id)
    expect((await remove(gameId, who.player.id, 'admin')).status).toBe(200)
    expect((await state(gameId)).users).not.toContain(who.player.id)
  })

  it('refuses removing the host, someone not in the game, and a second removal, changing no count', async () => {
    const gameId = await makeGame()
    const host = await remove(gameId, who.host.id, 'host')
    expect(host.status).toBe(409)
    expect((await host.json()).error.code).toBe('HOST_CANNOT_LEAVE')
    expect((await remove(gameId, who.stranger.id, 'host')).status).toBe(409)
    expect((await remove(gameId, who.player.id, 'host')).status).toBe(200)
    const again = await remove(gameId, who.player.id, 'host')
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('NOT_JOINED')
    expect(await state(gameId)).toEqual({ free: 3, users: [who.host.id] })
  })

  it('refuses after kick-off and a malformed user id', async () => {
    const started = await makeGame({ hoursFromNow: -1 })
    const response = await remove(started, who.player.id, 'host')
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('GAME_STARTED')
    expect((await state(started)).users).toContain(who.player.id)

    const gameId = await makeGame()
    expect((await remove(gameId, 'abc', 'host')).status).toBe(400)
    expect((await remove(gameId, 0, 'host')).status).toBe(400)
  })
})
