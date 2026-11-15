import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { DELETE, PATCH } from '@/app/api/v1/games/[id]/route'
import { formatBakuDateKey } from '@/lib/game-backend'

const HOUR_MS = 60 * 60 * 1000

/**
 * A game that has started belongs to its players' history, so its host can no longer edit or delete
 * it. The route handlers are called directly with a real session cookie, against the database in
 * DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('started games are frozen (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []
  const tokens: Record<'host' | 'admin', string> = { host: '', admin: '' }
  let hostId: number

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    for (const role of ['host', 'admin'] as const) {
      const email = `freeze-${suffix}-${role}@oyunagel.test`
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email, password: 'freeze-test-password', fullName: `Freeze ${role}`, role: role === 'admin' ? 'admin' : 'user' },
      })
      userIds.push(user.id)
      if (role === 'host') hostId = user.id
      const { token } = await payload.login({ collection: 'users', data: { email, password: 'freeze-test-password' } })
      tokens[role] = token ?? ''
    }
    arenaId = (
      await payload.create({
        collection: 'arenas',
        overrideAccess: true,
        data: { name: `Freeze Arena ${suffix}`, location: 'Bakı', city: 'baku' },
      })
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

  async function makeGame(hoursFromNow: number) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Freeze Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: hostId,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers: 10,
        availablePlayers: 9,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    gameIds.push(game.id)
    return game.id
  }

  type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response | undefined>
  const call = (handler: Handler, as: 'host' | 'admin', gameId: number, body?: unknown): Promise<Response> =>
    handler(
      new Request(`http://localhost/api/v1/games/${gameId}`, {
        method: handler === PATCH ? 'PATCH' : 'DELETE',
        headers: { Cookie: `payload-token=${tokens[as]}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    ) as Promise<Response>

  /** The edit form's body, moving the game to three days from now. */
  const editBody = () => ({
    sport: 'football',
    level: 'high',
    venueId: arenaId,
    scheduledDate: formatBakuDateKey(new Date(Date.now() + 72 * HOUR_MS)),
    scheduledTime: '18:00',
    maxCount: 10,
    hostPhone: '+994501234567',
  })

  it("won't let the host move a finished game into the future", async () => {
    const past = await makeGame(-48)
    const response = await call(PATCH, 'host', past, editBody())
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('GAME_STARTED')
    const game = await payload.findByID({ collection: 'games', id: past, overrideAccess: true })
    expect(new Date(game.scheduledAt).getTime()).toBeLessThan(Date.now())
  })

  it('freezes a game from the moment it starts, not only once it is over', async () => {
    const live = await makeGame(-0.5)
    expect((await call(PATCH, 'host', live, editBody())).status).toBe(409)
  })

  it('still lets the host edit an upcoming game', async () => {
    const upcoming = await makeGame(24)
    const response = await call(PATCH, 'host', upcoming, editBody())
    expect(response.status).toBe(200)
    expect((await response.json()).game.level).toBe('high')
  })

  it('keeps a played game from its host, but not from an admin', async () => {
    const past = await makeGame(-48)
    const refused = await call(DELETE, 'host', past)
    expect(refused.status).toBe(409)
    expect((await refused.json()).error.code).toBe('GAME_STARTED')
    expect(await payload.findByID({ collection: 'games', id: past, overrideAccess: true, disableErrors: true })).toBeTruthy()

    expect((await call(DELETE, 'admin', past)).status).toBe(200)
    expect(await payload.findByID({ collection: 'games', id: past, overrideAccess: true, disableErrors: true })).toBeFalsy()
  })

  it('still lets the host delete an upcoming game', async () => {
    const upcoming = await makeGame(24)
    expect((await call(DELETE, 'host', upcoming)).status).toBe(200)
  })
})
