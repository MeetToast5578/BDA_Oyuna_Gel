import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { PATCH } from '@/app/api/v1/games/[id]/sides/route'
import type { Side } from '@/lib/team-logic'

const HOUR_MS = 60 * 60 * 1000

/**
 * The host moves players between sides and presses "Balansla". The route handler is called with
 * real session cookies, against the database in DATABASE_URL. Every record it creates is removed
 * afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('moving players between sides (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []
  const teamIds: number[] = []
  const tokens: Record<'host' | 'stranger' | 'admin', string> = { host: '', stranger: '', admin: '' }
  let hostId: number
  /** Players 1–5, who join the host in a 6-player game. */
  const players: number[] = []

  const makeUser = async (name: string, role: 'user' | 'admin' = 'user') => {
    const email = `sides-${suffix}-${name}@oyunagel.test`
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email, password: 'sides-test-password', fullName: `Sides ${name}`, role },
    })
    userIds.push(user.id)
    const { token } = await payload.login({ collection: 'users', data: { email, password: 'sides-test-password' } })
    return { id: user.id, token: token ?? '' }
  }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const host = await makeUser('host')
    hostId = host.id
    tokens.host = host.token
    tokens.stranger = (await makeUser('stranger')).token
    tokens.admin = (await makeUser('admin', 'admin')).token
    for (const n of [1, 2, 3, 4, 5]) players.push((await makeUser(`p${n}`)).id)
    arenaId = (
      await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Sides Arena ${suffix}`, location: 'Bakı' } })
    ).id
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

  /** A game with the host and the listed players, each on the side given; the rest of the spots are free. */
  async function makeGame(
    sides: Record<number, Side>,
    { maxPlayers = 10, hoursFromNow = 3, homeTeam }: { maxPlayers?: number; hoursFromNow?: number; homeTeam?: number } = {},
  ) {
    const rows = Object.entries(sides).map(([userId, side]) => ({ userId: Number(userId), side }))
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Sides Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: hostId,
        homeTeam,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers,
        availablePlayers: maxPlayers - rows.length,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    gameIds.push(game.id)
    for (const { userId, side } of rows) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: userId, side } })
    }
    return game.id
  }

  const sidesOf = async (gameId: number) => {
    const { docs } = await payload.find({
      collection: 'game-participants',
      where: { game: { equals: gameId } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return Object.fromEntries(docs.map((doc) => [Number(doc.user), doc.side]))
  }

  const call = (gameId: number, as: 'host' | 'stranger' | 'admin' | null, body: unknown) =>
    PATCH(
      new Request(`http://localhost/api/v1/games/${gameId}/sides`, {
        method: 'PATCH',
        headers: { ...(as ? { Cookie: `payload-token=${tokens[as]}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    ) as Promise<Response>

  const move = (userId: number, side: Side) => ({ assignments: [{ userId, side }] })

  it('lets the host move a player to the other side', async () => {
    const [p1, p2, p3] = players
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home', [p2]: 'away', [p3]: 'away' })
    const response = await call(gameId, 'host', move(p1, 'away'))
    expect(response.status).toBe(200)
    expect((await sidesOf(gameId))[p1]).toBe('away')
    // The answer is the players list, so the page can redraw without another request.
    expect((await response.json()).players.find((player: { id: string }) => player.id === String(p1)).side).toBe('away')
  })

  it('refuses anyone who is not the host, and lets an admin through', async () => {
    const [p1, p2] = players
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home', [p2]: 'away' })
    expect((await call(gameId, null, move(p1, 'away'))).status).toBe(401)
    const stranger = await call(gameId, 'stranger', move(p1, 'away'))
    expect(stranger.status).toBe(403)
    expect((await sidesOf(gameId))[p1]).toBe('home')
    expect((await call(gameId, 'admin', move(p1, 'away'))).status).toBe(200)
    expect((await sidesOf(gameId))[p1]).toBe('away')
  })

  it('refuses a malformed body and a player who is not in the game', async () => {
    const [p1, p2] = players
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home' })
    const bad = await call(gameId, 'host', { assignments: [{ userId: p1, side: 'middle' }] })
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('INVALID_SIDES')
    const missing = await call(gameId, 'host', move(p2, 'away'))
    expect(missing.status).toBe(409)
    expect((await missing.json()).error.code).toBe('NOT_IN_GAME')
  })

  it('refuses a move that would overfill a side, and applies none of the moves', async () => {
    const [p1, p2, p3] = players
    // 6 players: three a side. Away is already full.
    const gameId = await makeGame(
      { [hostId]: 'home', [p1]: 'home', [p2]: 'away', [p3]: 'away', [players[3]]: 'away' },
      { maxPlayers: 6 },
    )
    const response = await call(gameId, 'host', {
      assignments: [
        { userId: p3, side: 'home' },
        { userId: p1, side: 'away' },
        { userId: p2, side: 'away' },
        { userId: hostId, side: 'away' },
      ],
    })
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('SIDE_FULL')
    expect(await sidesOf(gameId)).toMatchObject({ [hostId]: 'home', [p1]: 'home', [p2]: 'away', [p3]: 'away' })
  })

  it('refuses once the game has started', async () => {
    const [p1] = players
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home' }, { hoursFromNow: -1 })
    const response = await call(gameId, 'host', move(p1, 'away'))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('GAME_STARTED')
  })

  it('balances six players three against three, keeping the host where they are', async () => {
    const all = Object.fromEntries(players.map((id) => [id, 'home' as Side]))
    // Five on home is a legal 10-player game; the sixth joins the other side.
    const gameId = await makeGame({ [hostId]: 'home', ...all, [players[4]]: 'away' })
    const response = await call(gameId, 'host', { balance: true })
    expect(response.status).toBe(200)
    const sides = await sidesOf(gameId)
    expect(Object.values(sides).filter((side) => side === 'home')).toHaveLength(3)
    expect(Object.values(sides).filter((side) => side === 'away')).toHaveLength(3)
    expect(sides[hostId]).toBe('home')
  })

  it('counts the guests on the host\'s side when balancing', async () => {
    // A 10-player game with the host, four players and one guest: the guest plays with the host.
    const [p1, p2, p3, p4] = players
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home', [p2]: 'home', [p3]: 'home', [p4]: 'away' })
    await payload.update({ collection: 'games', id: gameId, overrideAccess: true, data: { availablePlayers: 4 } })
    const response = await call(gameId, 'host', { balance: true })
    expect(response.status).toBe(200)
    const sides = await sidesOf(gameId)
    // Host and guest stand together on home, so home takes one of the four players: 3 against 3 with the guest.
    expect(Object.values(sides).filter((side) => side === 'home')).toHaveLength(2)
    expect(Object.values(sides).filter((side) => side === 'away')).toHaveLength(3)
  })

  it('puts the two strongest players on different sides', async () => {
    const [p1, p2, p3, p4] = players
    // p1 and p2 each won three confirmed games.
    for (let n = 0; n < 3; n++) {
      const past = await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Sides Past ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: hostId,
          scheduledAt: new Date(Date.now() - (n + 2) * 24 * HOUR_MS).toISOString(),
          maxPlayers: 10,
          availablePlayers: 0,
          contactPhone: '+994501234567',
          status: 'scheduled',
          homeScore: 3,
          awayScore: 0,
          resultStatus: 'confirmed',
        },
      })
      gameIds.push(past.id)
      for (const userId of [p1, p2]) {
        await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: past.id, user: userId, side: 'home' } })
      }
    }
    // Everyone starts on home except one, so only the balance can split the two strong players.
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home', [p2]: 'home', [p3]: 'away', [p4]: 'away' })
    const response = await call(gameId, 'host', { balance: true })
    expect(response.status).toBe(200)
    const sides = await sidesOf(gameId)
    expect(sides[p1]).not.toBe(sides[p2])
  })

  it('keeps a club\'s members on its side when balancing', async () => {
    const [p1, p2, p3] = players
    const teamId = (
      await payload.create({
        collection: 'teams',
        overrideAccess: true,
        data: { name: `Sides Club ${suffix}`, sport: 'football', members: [hostId, p1] },
      })
    ).id
    teamIds.push(teamId)
    const gameId = await makeGame({ [hostId]: 'home', [p1]: 'home', [p2]: 'away', [p3]: 'away' }, { homeTeam: teamId })
    expect((await call(gameId, 'host', { balance: true })).status).toBe(200)
    expect(await sidesOf(gameId)).toMatchObject({ [hostId]: 'home', [p1]: 'home', [p2]: 'away', [p3]: 'away' })
    // And the host can't move a non-member onto the club's side by hand.
    const response = await call(gameId, 'host', move(p2, 'home'))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('NOT_A_MEMBER')
  })
})
