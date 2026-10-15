import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { GET } from '@/app/api/v1/games/[id]/participants/route'
import type { GamePlayers } from '@/lib/api-types'

const HOUR_MS = 60 * 60 * 1000

/**
 * `GET /api/v1/games/{id}/participants`, the "İştirakçılar" list the avatar row opens. The route
 * handler is called directly, against the database in DATABASE_URL. Every record it creates is
 * removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('the players list (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  let gameId: number
  const users: Record<'host' | 'first' | 'second', { id: number; token: string }> = {
    host: { id: 0, token: '' },
    first: { id: 0, token: '' },
    second: { id: 0, token: '' },
  }
  const names = { host: 'Elvin Abbasov', first: 'Aysel Quliyeva', second: 'Bəhruz Nəsirov' }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    for (const key of ['host', 'first', 'second'] as const) {
      const email = `players-${suffix}-${key}@oyunagel.test`
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email, password: 'players-test-password', fullName: names[key] },
      })
      const { token } = await payload.login({ collection: 'users', data: { email, password: 'players-test-password' } })
      users[key] = { id: user.id, token: token ?? '' }
    }
    arenaId = (
      await payload.create({
        collection: 'arenas',
        overrideAccess: true,
        data: { name: `Players Arena ${suffix}`, location: 'Bakı' },
      })
    ).id
    // Five in: the host, two friends they said were coming, and the two players who joined below.
    gameId = (
      await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Players Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: users.host.id,
          scheduledAt: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
          maxPlayers: 10,
          availablePlayers: 5,
          contactPhone: '+994501234567',
          status: 'scheduled',
        },
      })
    ).id
    // One at a time, so the join order is certain. The first typed a nickname into the join form.
    for (const [key, typed] of [
      ['first', 'Aysel (qapıçı)'],
      ['second', names.second],
    ] as const) {
      await payload.create({
        collection: 'game-participants',
        overrideAccess: true,
        data: { game: gameId, user: users[key].id, name: typed, phone: '+994551112233', side: 'away' },
      })
    }
  })

  afterAll(async () => {
    if (!payload) return
    if (gameId) {
      await payload.delete({ collection: 'game-participants', where: { game: { equals: gameId } }, overrideAccess: true })
      await payload.delete({ collection: 'games', where: { id: { equals: gameId } }, overrideAccess: true })
    }
    if (arenaId) await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    const ids = Object.values(users).map((user) => user.id).filter(Boolean)
    await payload.delete({ collection: 'users', where: { id: { in: ids } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  const list = (id: number | string, token?: string): Promise<Response> =>
    GET(
      new Request(`http://localhost/api/v1/games/${id}/participants`, {
        headers: token ? { Cookie: `payload-token=${token}` } : {},
      }),
      { params: Promise.resolve({ id: String(id) }) },
    )

  it('lists the host first, then the players in the order they joined, each linkable', async () => {
    const response = await list(gameId)
    expect(response.status).toBe(200)
    const body: GamePlayers = await response.json()

    expect(body.game).toMatchObject({ id: String(gameId), currentCount: 5, maxCount: 10 })
    expect(body.host).toMatchObject({ id: String(users.host.id), name: names.host, initials: 'EA', you: false })
    expect(body.players.map((player) => [player.id, player.name])).toEqual([
      [String(users.first.id), names.first],
      [String(users.second.id), names.second],
    ])
  })

  it("uses the account's name over the one typed into the join form, and never sends phones", async () => {
    const body: GamePlayers = await (await list(gameId)).json()
    expect(body.players[0].name).toBe('Aysel Quliyeva')
    expect(JSON.stringify(body)).not.toContain('+994')
  })

  it('counts the players the host brought, who have no account to list', async () => {
    const body: GamePlayers = await (await list(gameId)).json()
    // 5 in the game − 2 listed players − the host.
    expect(body.others).toBe(2)
  })

  it("marks the viewer's own row, and nobody's when signed out", async () => {
    const asPlayer: GamePlayers = await (await list(gameId, users.second.token)).json()
    expect(asPlayer.players.map((player) => player.you)).toEqual([false, true])
    expect(asPlayer.host.you).toBe(false)

    const asHost: GamePlayers = await (await list(gameId, users.host.token)).json()
    expect(asHost.host.you).toBe(true)
    expect(asHost.players.some((player) => player.you)).toBe(false)

    const signedOut: GamePlayers = await (await list(gameId)).json()
    expect([signedOut.host, ...signedOut.players].some((person) => person.you)).toBe(false)
  })

  it('answers 404 for a game that does not exist and 400 for a bad id', async () => {
    expect((await list(999_999_999)).status).toBe(404)
    expect((await list('abc')).status).toBe(400)
  })
})
