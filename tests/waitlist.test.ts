import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { DELETE as dropRoute, POST as waitRoute } from '@/app/api/v1/games/[id]/waitlist/route'
import { POST as joinRoute } from '@/app/api/v1/games/[id]/join/route'
import { POST as leaveRoute } from '@/app/api/v1/games/[id]/leave/route'
import { DELETE as removeRoute } from '@/app/api/v1/games/[id]/players/[userId]/route'
import { getGameDetail } from '@/lib/game-queries'
import { type CreateGameInput } from '@/lib/game-backend'
import { updateGame } from '@/lib/game-queries'
import { deleteMyAccount } from '@/lib/profile-queries'
import { MAX_WAITLIST, myWaitlist, promotionCount } from '@/lib/waitlist'

// `after()` only exists inside a request; here it just runs the task, so the routes can be called directly.
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: (task: () => unknown) => void task() }))

const HOUR_MS = 60 * 60 * 1000

/**
 * A full game's waitlist: signing up, and the spot going to the first person waiting wherever one
 * comes back (a leave, the host removing someone, a bigger game, a deleted account). Route handlers
 * run with real session cookies, against the database in DATABASE_URL.
 */
describe.skipIf(!process.env.DATABASE_URL)('the waitlist (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []
  const teamIds: number[] = []
  const keys = ['host', 'p1', 'p2', 'p3', 'w1', 'w2', 'w3', 'outsider'] as const
  const who = {} as Record<(typeof keys)[number], { id: number; token: string }>

  const makeUser = async (key: string, phone?: string) => {
    const email = `wait-${suffix}-${key}@oyunagel.test`
    const user = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'wait-test-password', fullName: `Wait ${key}`, ...(phone ? { phoneNumber: phone } : {}) } })
    userIds.push(user.id)
    const { token } = await payload.login({ collection: 'users', data: { email, password: 'wait-test-password' } })
    return { id: user.id, token: token ?? '' }
  }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    for (const [i, key] of keys.entries()) who[key] = await makeUser(key, `+99450123${String(4000 + i)}`)
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Wait Arena ${suffix}`, location: 'Bakı' } })).id
  })

  afterAll(async () => {
    if (!payload) return
    if (gameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
      await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    }
    if (teamIds.length) await payload.delete({ collection: 'teams', where: { id: { in: teamIds } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: userIds } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  type Key = (typeof keys)[number]
  /** A 4-player football game, full by default: the host on home and the listed players on the sides given. */
  async function makeGame({ players = [['p1', 'home'], ['p2', 'away'], ['p3', 'away']] as [Key, 'home' | 'away'][], hoursFromNow = 5, homeTeam = null as number | null, maxPlayers = 4 } = {}) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Wait Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: who.host.id,
        homeTeam,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers,
        availablePlayers: maxPlayers - 1 - players.length,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    gameIds.push(game.id)
    for (const [key, side] of [['host', 'home'], ...players] as [Key, 'home' | 'away'][]) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: who[key].id, side } })
    }
    return game.id
  }

  const cookie = (as: Key | null): Record<string, string> => (as ? { Cookie: `payload-token=${who[as].token}` } : {})
  const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
  const wait = (gameId: number, as: Key | null, body: unknown = {}) =>
    waitRoute(new Request(`http://localhost/api/v1/games/${gameId}/waitlist`, { method: 'POST', headers: { ...cookie(as), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), ctx(gameId)) as Promise<Response>
  const drop = (gameId: number, as: Key | null) => dropRoute(new Request(`http://localhost/api/v1/games/${gameId}/waitlist`, { method: 'DELETE', headers: cookie(as) }), ctx(gameId)) as Promise<Response>
  const leave = (gameId: number, as: Key | null) => leaveRoute(new Request(`http://localhost/api/v1/games/${gameId}/leave`, { method: 'POST', headers: cookie(as) }), ctx(gameId)) as Promise<Response>
  const code = async (response: Response) => (await response.json()).error.code

  const state = async (gameId: number) => {
    const game = await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })
    const rows = await payload.find({ collection: 'game-participants', where: { game: { equals: gameId } }, depth: 0, pagination: false, overrideAccess: true })
    const waiting = await payload.find({ collection: 'game-waitlist', where: { game: { equals: gameId } }, depth: 0, pagination: false, overrideAccess: true, sort: 'createdAt' })
    return {
      free: game.availablePlayers,
      players: rows.docs.map((row) => Number(row.user)),
      rows: rows.docs,
      waiting: waiting.docs.map((row) => Number(row.user)),
    }
  }

  it('signs people up for a full game, in order, and takes them off again', async () => {
    const gameId = await makeGame()
    expect((await wait(gameId, null)).status).toBe(401)
    const first = await wait(gameId, 'w1')
    expect(first.status).toBe(200)
    expect((await first.json()).position).toBe(1)
    expect((await (await wait(gameId, 'w2')).json()).position).toBe(2)
    expect((await state(gameId)).waiting).toEqual([who.w1.id, who.w2.id])

    expect(await code(await wait(gameId, 'w1'))).toBe('ALREADY_WAITING')
    expect(await code(await wait(gameId, 'p1'))).toBe('ALREADY_JOINED')
    expect(await code(await wait(gameId, 'host'))).toBe('HOST_CANNOT_WAIT')

    expect((await drop(gameId, null)).status).toBe(401)
    expect((await drop(gameId, 'w1')).status).toBe(200)
    expect(await code(await drop(gameId, 'w1'))).toBe('NOT_WAITING')
    expect((await state(gameId)).waiting).toEqual([who.w2.id])
    // Someone who signs up again goes to the back.
    await wait(gameId, 'w1')
    expect((await state(gameId)).waiting).toEqual([who.w2.id, who.w1.id])
  })

  it('refuses a game that has room, one that has started, and a missing number', async () => {
    const open = await makeGame({ players: [['p1', 'home']] })
    const notFull = await wait(open, 'w1')
    expect(notFull.status).toBe(409)
    expect(await code(notFull)).toBe('GAME_NOT_FULL')

    const started = await makeGame({ hoursFromNow: -1 })
    expect(await code(await wait(started, 'w1'))).toBe('GAME_NOT_JOINABLE')
    expect((await wait(2_000_000_000, 'w1')).status).toBe(404)

    // A user with no number on the profile must give one.
    const bare = await payload.create({ collection: 'users', overrideAccess: true, data: { email: `wait-${suffix}-bare@oyunagel.test`, password: 'wait-test-password', fullName: 'Bare' } })
    userIds.push(bare.id)
    const token = (await payload.login({ collection: 'users', data: { email: `wait-${suffix}-bare@oyunagel.test`, password: 'wait-test-password' } })).token ?? ''
    const full = await makeGame()
    const response = (await waitRoute(new Request('http://localhost/x', { method: 'POST', headers: { Cookie: `payload-token=${token}`, 'Content-Type': 'application/json' }, body: '{}' }), ctx(full))) as Response
    expect(response.status).toBe(400)
    expect(await code(response)).toBe('INVALID_PHONE')
  })

  it('stops at a list\'s limit', async () => {
    const gameId = await makeGame()
    const fillers: number[] = []
    for (let i = 0; i < MAX_WAITLIST; i++) {
      const user = await payload.create({ collection: 'users', overrideAccess: true, data: { email: `wait-${suffix}-f${i}@oyunagel.test`, password: 'wait-test-password', fullName: `Filler ${i}` } })
      fillers.push(user.id)
      userIds.push(user.id)
    }
    const { sql } = await import('@payloadcms/db-postgres')
    for (const id of fillers) {
      await payload.db.drizzle.execute(sql`INSERT INTO game_waitlist (game_id, user_id, name, phone, updated_at, created_at) VALUES (${gameId}, ${id}, 'F', '+994501234567', now(), now())`)
    }
    const response = await wait(gameId, 'w1')
    expect(response.status).toBe(409)
    expect(await code(response)).toBe('WAITLIST_FULL')
  })

  it('hands a spot someone gives back to the first person waiting, and the game stays full', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1', { name: 'Wait One' })
    await wait(gameId, 'w2')
    const response = await leave(gameId, 'p1')
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe('full')

    const after = await state(gameId)
    expect(after.free).toBe(0)
    expect(after.players).toContain(who.w1.id)
    expect(after.players).not.toContain(who.p1.id)
    expect(after.waiting).toEqual([who.w2.id])
    const row = after.rows.find((item) => Number(item.user) === who.w1.id)
    expect(row).toMatchObject({ name: 'Wait One', side: 'home' })
    expect(row?.promotedAt).toBeTruthy()
    // The host's side keeps its size: p1 left home, so the newcomer took the side with room.
    expect(after.rows.filter((item) => item.side === 'home')).toHaveLength(2)
    expect(after.rows.filter((item) => item.side === 'away')).toHaveLength(2)
  })

  it('promotes two different people when two players leave at once', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1')
    await wait(gameId, 'w2')
    await wait(gameId, 'w3')
    const [a, b] = await Promise.all([leave(gameId, 'p1'), leave(gameId, 'p2')])
    expect([a.status, b.status]).toEqual([200, 200])
    const after = await state(gameId)
    expect(after.free).toBe(0)
    expect(after.players.sort()).toEqual([who.host.id, who.p3.id, who.w1.id, who.w2.id].sort())
    expect(after.waiting).toEqual([who.w3.id])
    expect(new Set(after.players).size).toBe(after.players.length)
  })

  it('returns the spot when nobody is waiting', async () => {
    const gameId = await makeGame()
    expect((await leave(gameId, 'p1')).status).toBe(200)
    const after = await state(gameId)
    expect(after.free).toBe(1)
    expect(after.players).not.toContain(who.p1.id)
    expect(after.rows.every((row) => !row.promotedAt)).toBe(true)
  })

  it('does not promote anyone into a game that has started', async () => {
    const gameId = await makeGame({ hoursFromNow: -1 })
    await payload.create({ collection: 'game-waitlist', overrideAccess: true, data: { game: gameId, user: who.w1.id, name: 'W', phone: '+994501234567' } })
    expect((await leave(gameId, 'p1')).status).toBe(409)
    const after = await state(gameId)
    expect(after.players).toContain(who.p1.id)
    expect(after.players).not.toContain(who.w1.id)
  })

  it('promotes when the host removes a player', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1')
    const response = (await removeRoute(
      new Request(`http://localhost/api/v1/games/${gameId}/players/${who.p2.id}`, { method: 'DELETE', headers: cookie('host') }),
      { params: Promise.resolve({ id: String(gameId), userId: String(who.p2.id) }) },
    )) as Response
    expect(response.status).toBe(200)
    const after = await state(gameId)
    expect(after.free).toBe(0)
    expect(after.players).toContain(who.w1.id)
    expect(after.rows.find((row) => Number(row.user) === who.w1.id)?.side).toBe('away')
  })

  it('promotes as many people as a bigger game has new spots', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1')
    await wait(gameId, 'w2')
    await wait(gameId, 'w3')
    const input: CreateGameInput = {
      title: `Wait Game ${suffix}`,
      sport: 'football',
      level: 'medium',
      venueId: arenaId,
      scheduledAt: new Date(Date.now() + 5 * HOUR_MS),
      maxCount: 6,
      currentCount: 4,
      contactPhone: '+994501234567',
      homeTeamId: null,
      awayTeamId: null,
      hostSide: 'home',
      invites: [],
    }
    const result = await updateGame(gameId, input)
    expect(result.ok && result.promoted).toEqual([who.w1.id, who.w2.id])
    const after = await state(gameId)
    expect(after.free).toBe(0)
    expect(after.waiting).toEqual([who.w3.id])
    expect(after.rows.filter((row) => row.side === 'home').length).toBeLessThanOrEqual(3)
    expect(after.rows.filter((row) => row.side === 'away').length).toBeLessThanOrEqual(3)
  })

  it('passes over someone who can\'t stand on the side that has room, keeping their place', async () => {
    const club = (await payload.create({ collection: 'teams', overrideAccess: true, data: { name: `Wait Club ${suffix}`, sport: 'football', members: [who.host.id, who.p1.id, who.w2.id], captain: who.host.id } })).id
    teamIds.push(club)
    const gameId = await makeGame({ homeTeam: club })
    // w1 (not in the club) is first; the free spot is on the club's side, which only its members may take.
    await wait(gameId, 'w1')
    await wait(gameId, 'w2')
    expect((await leave(gameId, 'p1')).status).toBe(200)
    const after = await state(gameId)
    expect(after.players).toContain(who.w2.id)
    expect(after.players).not.toContain(who.w1.id)
    expect(after.waiting).toEqual([who.w1.id])
    expect(after.free).toBe(0)
  })

  it('promotes when an account is deleted, and says who', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1')
    const leaver = await makeUser('leaver', '+994501239999')
    await payload.update({ collection: 'game-participants', where: { and: [{ game: { equals: gameId } }, { user: { equals: who.p3.id } }] }, overrideAccess: true, data: { user: leaver.id } })
    const result = await deleteMyAccount(leaver.id)
    expect(result.promotions).toEqual([{ gameId, userIds: [who.w1.id] }])
    const after = await state(gameId)
    expect(after.free).toBe(0)
    expect(after.players).toContain(who.w1.id)
    userIds.splice(userIds.indexOf(leaver.id), 1)
  })

  it('drops a sign-up when the person joins the game directly', async () => {
    const gameId = await makeGame({ players: [['p1', 'home']] })
    // Signed up while full, then a spot opened that nobody waiting could take.
    await payload.create({ collection: 'game-waitlist', overrideAccess: true, data: { game: gameId, user: who.w1.id, name: 'W', phone: '+994501234567' } })
    const response = (await joinRoute(
      new Request(`http://localhost/api/v1/games/${gameId}/join`, { method: 'POST', headers: { ...cookie('w1'), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'W', phone: '+994501234567', side: 'away' }) }),
      ctx(gameId),
    )) as Response
    expect(response.status).toBe(200)
    expect((await state(gameId)).waiting).toEqual([])
  })

  it('tells the page how many are waiting and where the viewer stands', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1')
    await wait(gameId, 'w2')
    expect((await getGameDetail(gameId, who.w2.id))?.waitlist).toEqual({ count: 2, yourPosition: 2 })
    expect((await getGameDetail(gameId, who.w1.id))?.waitlist).toEqual({ count: 2, yourPosition: 1 })
    expect((await getGameDetail(gameId, who.outsider.id))?.waitlist).toEqual({ count: 2, yourPosition: null })
    expect((await getGameDetail(gameId, null))?.waitlist).toEqual({ count: 2, yourPosition: null })
  })

  it('lists a person\'s waits and the spots they were handed', async () => {
    const gameId = await makeGame()
    await wait(gameId, 'w1')
    await wait(gameId, 'w2')
    const before = await myWaitlist(payload, who.w2.id)
    expect(before.waiting.find((item) => item.gameId === String(gameId))?.position).toBe(2)
    await leave(gameId, 'p1')
    const w1 = await myWaitlist(payload, who.w1.id)
    expect(w1.promoted.map((item) => item.gameId)).toContain(String(gameId))
    expect(w1.waiting.some((item) => item.gameId === String(gameId))).toBe(false)
    expect(await promotionCount(payload, who.w1.id)).toBeGreaterThanOrEqual(1)
    expect((await myWaitlist(payload, who.w2.id)).waiting.find((item) => item.gameId === String(gameId))?.position).toBe(1)
    expect(await promotionCount(payload, who.outsider.id)).toBe(0)
  })
})
