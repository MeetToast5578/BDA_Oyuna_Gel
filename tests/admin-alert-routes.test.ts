import { afterAll, beforeAll, expect, it, vi, describe } from 'vitest'
import type { Payload } from 'payload'
import { formatBakuDateKey, formatBakuTime } from '@/lib/game-backend'
import { POST as create } from '@/app/api/v1/games/route'
import { POST as join } from '@/app/api/v1/games/[id]/join/route'
import { POST as leave } from '@/app/api/v1/games/[id]/leave/route'
import { PATCH as edit, DELETE as remove } from '@/app/api/v1/games/[id]/route'

const alert = vi.hoisted(() => vi.fn())
vi.mock('@/lib/admin-alerts', () => ({ scheduleAdminAlert: alert }))
// Hold background player emails/audit work; assertions concern committed route actions only.
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('admin event hooks (local Postgres)', () => {
  let payload: Payload
  let arena: number
  let gameId: number | undefined
  const users: Array<{ id: number; token: string }> = []
  const request = (method: string, user: number, body?: unknown) => new Request('http://localhost/api/v1/games', {
    method, headers: { cookie: `payload-token=${users[user].token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const params = () => ({ params: Promise.resolve({ id: String(gameId) }) })
  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    for (const key of ['host', 'player']) {
      const email = `admin-events-${Date.now()}-${key}@oyunagel.test`
      const user = await payload.create({ collection: 'users', data: { email, fullName: key, password: 'test-event-password' } })
      const { token } = await payload.login({ collection: 'users', data: { email, password: 'test-event-password' } })
      users.push({ id: user.id, token: token! })
    }
    arena = (await payload.create({ collection: 'arenas', data: { name: 'Admin event test venue', location: 'Bakı', city: 'baku', sportTypes: ['football'] } })).id
  })
  afterAll(async () => {
    if (!payload) return
    if (gameId) await payload.delete({ collection: 'games', where: { id: { equals: gameId } } })
    if (arena) await payload.delete({ collection: 'arenas', id: arena })
    if (users.length) await payload.delete({ collection: 'users', where: { id: { in: users.map(u => u.id) } } })
    await payload.db.destroy?.()
  })
  it('emits create/join/leave/edit/delete only after success, never for rejected attempts', async () => {
    const future = new Date(Date.now() + 2 * 86400000)
    const body = { title: 'Admin alerts test game', sport: 'football', level: 'medium', venueId: arena, scheduledDate: formatBakuDateKey(future), scheduledTime: formatBakuTime(future), maxCount: 10, currentCount: 1, hostPhone: '+994502103456' }
    alert.mockClear()
    expect((await create(request('POST', 0, { ...body, sport: 'invalid' }))).status).toBe(400)
    expect(alert).not.toHaveBeenCalled()
    const created = await create(request('POST', 0, body))
    expect(created.status).toBe(201)
    gameId = Number((await created.json()).game.id)
    expect(alert).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ type: 'game_created', actorId: users[0].id, game: expect.objectContaining({ id: String(gameId) }) }))

    alert.mockClear()
    const joinBody = { name: 'Player', phone: '+994502103457', side: 'away' }
    expect((await join(request('POST', 1, joinBody), params())).status).toBe(200)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][1]).toMatchObject({ type: 'player_joined', actorId: users[1].id, game: { id: String(gameId) } })
    alert.mockClear()
    expect((await join(request('POST', 1, joinBody), params())).status).toBe(409)
    expect(alert).not.toHaveBeenCalled()

    expect((await leave(request('POST', 1), params())).status).toBe(200)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][1]).toMatchObject({ type: 'player_left', actorId: users[1].id })
    alert.mockClear()
    expect((await leave(request('POST', 1), params())).status).toBe(409)
    expect(alert).not.toHaveBeenCalled()

    expect((await edit(request('PATCH', 1, body), params()))?.status).toBe(403)
    expect(alert).not.toHaveBeenCalled()
    expect((await edit(request('PATCH', 0, { ...body, title: 'Updated alert game' }), params()))?.status).toBe(200)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][1]).toMatchObject({ type: 'game_updated', game: { title: 'Updated alert game' } })

    alert.mockClear()
    expect((await remove(request('DELETE', 0), params()))?.status).toBe(200)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][1]).toMatchObject({ type: 'game_deleted', game: { title: 'Updated alert game' } })
    expect((await remove(request('DELETE', 0), params()))?.status).toBe(404)
    expect(alert).toHaveBeenCalledTimes(1)
  })
})
