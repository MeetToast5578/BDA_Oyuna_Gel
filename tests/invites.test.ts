import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { DELETE as cancelRoute } from '@/app/api/v1/games/[id]/invites/[inviteId]/route'
import { GET as listRoute, POST as inviteRoute } from '@/app/api/v1/games/[id]/invites/route'
import { POST as joinRoute } from '@/app/api/v1/games/[id]/join/route'
import { POST as createRoute } from '@/app/api/v1/games/route'
import { POST as declineRoute } from '@/app/api/v1/invites/[id]/decline/route'
import { GET as myInvitesRoute } from '@/app/api/v1/me/invites/route'
import { GET as searchRoute } from '@/app/api/v1/users/route'
import { formatBakuDateKey } from '@/lib/game-backend'
import { HOURLY_INVITE_LIMIT, pendingInviteCount } from '@/lib/invites'
import type { Side } from '@/lib/team-logic'

// `after()` only exists inside a request; here it just runs the task, so the join route can be called directly.
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: (task: () => unknown) => void task() }))

const HOUR_MS = 60 * 60 * 1000

/**
 * The host invites named players to a side. Route handlers are called with real session cookies,
 * against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('inviting players (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []
  const teamIds: number[] = []
  const names = { host: 'Host', ali: 'Əli Invite', vali: 'Vəli Invite', kamal: 'Kamal Invite', stranger: 'Stranger', member: 'Member' } as const
  const who = {} as Record<keyof typeof names, { id: number; token: string }>
  let homeClub: number

  const makeUser = async (key: keyof typeof names) => {
    const email = `invite-${suffix}-${key}@oyunagel.test`
    const user = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'invite-test-password', fullName: `${names[key]} ${suffix}` } })
    userIds.push(user.id)
    const { token } = await payload.login({ collection: 'users', data: { email, password: 'invite-test-password' } })
    return { id: user.id, token: token ?? '' }
  }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    for (const key of Object.keys(names) as (keyof typeof names)[]) who[key] = await makeUser(key)
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Invite Arena ${suffix}`, location: 'Bakı' } })).id
    homeClub = (
      await payload.create({
        collection: 'teams',
        overrideAccess: true,
        data: { name: `Invite Club ${suffix}`, sport: 'football', members: [who.host.id, who.member.id, who.ali.id], captain: who.host.id },
      })
    ).id
    teamIds.push(homeClub)
  })

  afterAll(async () => {
    if (!payload) return
    // Deleting the games and users takes their invites with them (ON DELETE CASCADE), which a test below relies on.
    if (gameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
      await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    }
    await payload.delete({ collection: 'teams', where: { id: { in: teamIds } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: userIds } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  async function makeGame({ homeTeam = null as number | null, maxPlayers = 10, hoursFromNow = 5, title = `Invite Game ${suffix}`, host = who.host.id } = {}) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host,
        homeTeam,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers,
        availablePlayers: maxPlayers - 1,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    gameIds.push(game.id)
    await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: host, side: 'home' } })
    return game.id
  }

  const cookie = (as: keyof typeof names | null): Record<string, string> => (as ? { Cookie: `payload-token=${who[as].token}` } : {})
  const json = { 'Content-Type': 'application/json' }
  const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })

  const invite = (gameId: number, as: keyof typeof names | null, body: unknown) =>
    inviteRoute(new Request(`http://localhost/api/v1/games/${gameId}/invites`, { method: 'POST', headers: { ...cookie(as), ...json }, body: JSON.stringify(body) }), ctx(gameId)) as Promise<Response>
  const one = (gameId: number, user: keyof typeof names, side: Side, as: keyof typeof names | null = 'host') => invite(gameId, as, { userId: who[user].id, side })
  const rows = async (gameId: number) =>
    (await payload.find({ collection: 'game-invites', where: { game: { equals: gameId } }, depth: 0, pagination: false, overrideAccess: true, sort: 'id' })).docs
  const errorCode = async (response: Response) => (await response.json()).error.code

  const mine = async (as: keyof typeof names) =>
    (await ((await myInvitesRoute(new Request('http://localhost/api/v1/me/invites', { headers: cookie(as) }))) as Response).json()).invites as { id: string; gameId: string; side: Side; sideLabel: string }[]

  it('lets the host invite a player to a side, and nobody else', async () => {
    const gameId = await makeGame()
    expect((await one(gameId, 'ali', 'away', null)).status).toBe(401)
    for (const as of ['stranger', 'ali'] as const) {
      const refused = await one(gameId, 'vali', 'away', as)
      expect(refused.status, as).toBe(403)
      expect(await errorCode(refused)).toBe('NOT_GAME_HOST')
    }
    expect(await rows(gameId)).toHaveLength(0)

    const response = await one(gameId, 'ali', 'away')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.invited).toBe(1)
    expect(body.invites).toMatchObject([{ side: 'away', status: 'pending', player: { id: String(who.ali.id) } }])
    expect(await rows(gameId)).toMatchObject([{ user: who.ali.id, invitedBy: who.host.id, side: 'away', status: 'pending' }])
  })

  it('holds no spot for an invited player', async () => {
    const gameId = await makeGame()
    await one(gameId, 'ali', 'away')
    expect((await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })).availablePlayers).toBe(9)
  })

  it('refuses a malformed request, an unknown player, the host, a repeat, and someone already in the game', async () => {
    const gameId = await makeGame()
    for (const body of [{}, { userId: 'x', side: 'home' }, { userId: who.ali.id, side: 'middle' }, { clubSide: 'both' }]) {
      const response = await invite(gameId, 'host', body)
      expect(response.status).toBe(400)
      expect(await errorCode(response)).toBe('INVALID_INVITE')
    }
    expect(await errorCode(await invite(gameId, 'host', { userId: 2_000_000_000, side: 'home' }))).toBe('USER_NOT_FOUND')
    expect(await errorCode(await one(gameId, 'host', 'away'))).toBe('ALREADY_IN_GAME')

    expect((await one(gameId, 'ali', 'home')).status).toBe(200)
    expect(await errorCode(await one(gameId, 'ali', 'away'))).toBe('ALREADY_INVITED')

    await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: gameId, user: who.vali.id, side: 'away' } })
    expect(await errorCode(await one(gameId, 'vali', 'away'))).toBe('ALREADY_IN_GAME')
    expect(await rows(gameId)).toHaveLength(1)
  })

  it('refuses an invite to a club side for someone outside the club', async () => {
    const gameId = await makeGame({ homeTeam: homeClub })
    const response = await one(gameId, 'stranger', 'home')
    expect(response.status).toBe(409)
    expect(await errorCode(response)).toBe('INVITE_NOT_A_MEMBER')
    expect((await one(gameId, 'member', 'home')).status).toBe(200)
    // The open side takes anyone, including a club member.
    expect((await one(gameId, 'stranger', 'away')).status).toBe(200)
    expect(await rows(gameId)).toHaveLength(2)
  })

  it('refuses after kick-off', async () => {
    const gameId = await makeGame({ hoursFromNow: -1 })
    const response = await one(gameId, 'ali', 'home')
    expect(response.status).toBe(409)
    expect(await errorCode(response)).toBe('GAME_STARTED')
  })

  it('keeps the open invites within the size of the game, and within an hour\'s limit', async () => {
    const small = await makeGame({ maxPlayers: 2 })
    expect((await one(small, 'ali', 'home')).status).toBe(200)
    expect((await one(small, 'vali', 'away')).status).toBe(200)
    expect(await errorCode(await one(small, 'kamal', 'away'))).toBe('TOO_MANY_INVITES')

    // A host who has already sent the limit's worth in the last hour, in other games. Their own account,
    // so the other tests' host isn't held up by it.
    const email = `invite-${suffix}-spammer@oyunagel.test`
    const spammer = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'invite-test-password', fullName: `Spammer ${suffix}` } })
    userIds.push(spammer.id)
    const token = (await payload.login({ collection: 'users', data: { email, password: 'invite-test-password' } })).token ?? ''
    const others = await Promise.all(Array.from({ length: 11 }, () => makeGame({ host: spammer.id })))
    const everyone = Object.values(who).map((user) => user.id)
    const { sql } = await import('@payloadcms/db-postgres')
    for (const gameId of others) {
      for (const userId of everyone) {
        await payload.db.drizzle.execute(sql`INSERT INTO game_invites (game_id, user_id, invited_by_id, side, status, updated_at, created_at) VALUES (${gameId}, ${userId}, ${spammer.id}, 'home', 'declined', now(), now())`)
      }
    }
    expect(11 * everyone.length).toBeGreaterThanOrEqual(HOURLY_INVITE_LIMIT)
    const limited = await makeGame({ host: spammer.id })
    const response = (await inviteRoute(
      new Request(`http://localhost/api/v1/games/${limited}/invites`, { method: 'POST', headers: { Cookie: `payload-token=${token}`, ...json }, body: JSON.stringify({ userId: who.ali.id, side: 'home' }) }),
      ctx(limited),
    )) as Response
    expect(response.status).toBe(429)
    expect(await errorCode(response)).toBe('RATE_LIMITED')
    expect(await rows(limited)).toHaveLength(0)
  })

  it('invites a whole club side, skipping people already in or invited, up to the side\'s free spots', async () => {
    const gameId = await makeGame({ homeTeam: homeClub })
    expect(await errorCode(await invite(gameId, 'host', { clubSide: 'away' }))).toBe('NO_CLUB')
    // The host stands in the club already; Ali is invited by hand first.
    await one(gameId, 'ali', 'home')
    const response = await invite(gameId, 'host', { clubSide: 'home' })
    expect(response.status).toBe(200)
    expect((await response.json()).invited).toBe(1)
    expect((await rows(gameId)).map((row) => row.user).sort()).toEqual([who.ali.id, who.member.id].sort())
    // Nothing left to invite is not an error.
    const again = await invite(gameId, 'host', { clubSide: 'home' })
    expect(again.status).toBe(200)
    expect((await again.json()).invited).toBe(0)

    // A 4-player game has two spots a side: the host takes one, so one member fits.
    const tight = await makeGame({ homeTeam: homeClub, maxPlayers: 4 })
    expect((await (await invite(tight, 'host', { clubSide: 'home' })).json()).invited).toBe(1)
  })

  it('lets the host take back an open invite, but not a declined one', async () => {
    const gameId = await makeGame()
    await one(gameId, 'ali', 'home')
    await one(gameId, 'vali', 'home')
    const [first, second] = await rows(gameId)
    const cancel = (inviteId: number | string, as: keyof typeof names) =>
      cancelRoute(new Request(`http://localhost/api/v1/games/${gameId}/invites/${inviteId}`, { method: 'DELETE', headers: cookie(as) }), { params: Promise.resolve({ id: String(gameId), inviteId: String(inviteId) }) }) as Promise<Response>

    expect((await cancel(first.id, 'stranger')).status).toBe(403)
    expect((await cancel('abc', 'host')).status).toBe(400)
    expect((await cancel(first.id, 'host')).status).toBe(200)
    expect(await errorCode(await cancel(first.id, 'host'))).toBe('INVITE_NOT_FOUND')

    await declineRoute(new Request('http://localhost/x', { method: 'POST', headers: cookie('vali') }), ctx(Number(second.id)))
    expect(await errorCode(await cancel(second.id, 'host'))).toBe('INVITE_NOT_FOUND')
    // The host's list shows the declined one, not the withdrawn one.
    const list = await ((await listRoute(new Request('http://localhost/x', { headers: cookie('host') }), ctx(gameId))) as Response).json()
    expect(list.invites).toMatchObject([{ status: 'declined', player: { id: String(who.vali.id) } }])
  })

  it('shows an invite to the invited player only, with the side named after its club', async () => {
    const gameId = await makeGame({ homeTeam: homeClub })
    await one(gameId, 'member', 'home')
    await one(gameId, 'stranger', 'away')
    const found = (await mine('member')).find((item) => item.gameId === String(gameId))
    expect(found).toMatchObject({ side: 'home', sideLabel: `Invite Club ${suffix}` })
    expect((await mine('stranger')).find((item) => item.gameId === String(gameId))).toMatchObject({ side: 'away', sideLabel: 'B komandası' })
    expect((await mine('kamal')).find((item) => item.gameId === String(gameId))).toBeUndefined()
    expect(await pendingInviteCount(payload, who.member.id)).toBeGreaterThanOrEqual(1)
    expect((await myInvitesRoute(new Request('http://localhost/x'))).status).toBe(401)
  })

  it('stops showing an invite once the game has started, the player joined, or they declined', async () => {
    const gameId = await makeGame()
    await one(gameId, 'ali', 'away')
    expect((await mine('ali')).some((item) => item.gameId === String(gameId))).toBe(true)

    // Declined: gone for the invitee, and the host can't ask again.
    const [row] = await rows(gameId)
    const decline = (as: keyof typeof names | null, id = row.id) => declineRoute(new Request('http://localhost/x', { method: 'POST', headers: cookie(as) }), ctx(Number(id))) as Promise<Response>
    expect((await decline(null)).status).toBe(401)
    expect(await errorCode(await decline('vali'))).toBe('INVITE_NOT_FOUND')
    expect((await decline('ali')).status).toBe(200)
    expect((await mine('ali')).some((item) => item.gameId === String(gameId))).toBe(false)
    expect(await errorCode(await decline('ali'))).toBe('INVITE_NOT_FOUND')
    expect(await errorCode(await one(gameId, 'ali', 'away'))).toBe('ALREADY_INVITED')

    const joined = await makeGame()
    await one(joined, 'vali', 'away')
    const response = (await joinRoute(
      new Request(`http://localhost/api/v1/games/${joined}/join`, { method: 'POST', headers: { ...cookie('vali'), ...json }, body: JSON.stringify({ name: 'Vəli', phone: '+994501234567', side: 'away' }) }),
      ctx(joined),
    )) as Response
    expect(response.status).toBe(200)
    expect((await rows(joined))[0].status).toBe('accepted')
    expect((await mine('vali')).some((item) => item.gameId === String(joined))).toBe(false)

    const started = await makeGame()
    await one(started, 'kamal', 'home')
    await payload.update({ collection: 'games', id: started, overrideAccess: true, data: { scheduledAt: new Date(Date.now() - HOUR_MS).toISOString() } })
    expect((await mine('kamal')).some((item) => item.gameId === String(started))).toBe(false)
  })

  it('lets someone who accepted and then left be invited again', async () => {
    const gameId = await makeGame()
    await one(gameId, 'ali', 'away')
    await joinRoute(
      new Request(`http://localhost/api/v1/games/${gameId}/join`, { method: 'POST', headers: { ...cookie('ali'), ...json }, body: JSON.stringify({ name: 'Əli', phone: '+994501234567', side: 'away' }) }),
      ctx(gameId),
    )
    await payload.delete({ collection: 'game-participants', where: { and: [{ game: { equals: gameId } }, { user: { equals: who.ali.id } }] }, overrideAccess: true })
    expect((await one(gameId, 'ali', 'home')).status).toBe(200)
    expect(await rows(gameId)).toMatchObject([{ status: 'pending', side: 'home' }])
  })

  describe('the player list', () => {
    const list = (params: Record<string, string | number>, as: keyof typeof names | null) =>
      searchRoute(new Request(`http://localhost/api/v1/users?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, { headers: cookie(as) })) as Promise<Response>
    const ids = async (response: Response) => (await response.json()).users.map((user: { id: string }) => user.id) as string[]

    it('needs a session and gives public fields only', async () => {
      expect((await list({}, null)).status).toBe(401)
      const body = await (await list({ q: `Vəli Invite ${suffix}` }, 'host')).json()
      expect(body.users).toHaveLength(1)
      expect(Object.keys(body.users[0]).sort()).toEqual(['avatarUrl', 'id', 'initials', 'name'])
      expect(body).toMatchObject({ hasMore: false, page: 1, users: [{ id: String(who.vali.id), name: `Vəli Invite ${suffix}` }] })
    })

    it('finds people by name ignoring case and Azerbaijani letters, as a substring', async () => {
      for (const typed of [`veli invite ${suffix}`, `VELİ INVITE ${suffix}`]) expect(await ids(await list({ q: typed }, 'host'))).toEqual([String(who.vali.id)])
      // "eli" is inside "Vəli" as well as "Əli".
      expect((await ids(await list({ q: `eli invite ${suffix}` }, 'host'))).sort()).toEqual([String(who.ali.id), String(who.vali.id)].sort())
      expect(await ids(await list({ q: `zzzz${suffix}` }, 'host'))).toEqual([])
    })

    it('lists everyone else with no name, a page at a time, and never the caller', async () => {
      const first = await (await list({ limit: 2 }, 'ali')).json()
      expect(first.users).toHaveLength(2)
      expect(first.hasMore).toBe(true)
      const second = await (await list({ limit: 2, page: 2 }, 'ali')).json()
      expect(second.users.map((user: { id: string }) => user.id)).not.toEqual(first.users.map((user: { id: string }) => user.id))
      const everyone = await ids(await list({ q: `Invite ${suffix}` }, 'ali'))
      expect(everyone).not.toContain(String(who.ali.id))
      expect(everyone).toEqual(expect.arrayContaining([String(who.vali.id), String(who.kamal.id)]))
      // Sorted by name.
      const names = (await (await list({ q: suffix }, 'ali')).json()).users.map((user: { name: string }) => user.name)
      expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, 'en')))
    })

    it('narrows to members of the caller\'s clubs', async () => {
      // The host is in one club, with Member and Əli.
      expect((await ids(await list({ filter: 'clubs' }, 'host'))).sort()).toEqual([String(who.member.id), String(who.ali.id)].sort())
      expect(await ids(await list({ filter: 'clubs' }, 'stranger'))).toEqual([])
      expect(await ids(await list({ filter: 'clubs', q: 'Member' }, 'host'))).toEqual([String(who.member.id)])
    })

    it('narrows to people the caller has played with, latest first', async () => {
      expect(await ids(await list({ filter: 'recent' }, 'stranger'))).toEqual([])
      const earlier = await makeGame({ hoursFromNow: 5 })
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: earlier, user: who.stranger.id, side: 'away' } })
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: earlier, user: who.kamal.id, side: 'away' } })
      const later = await makeGame({ hoursFromNow: 9 })
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: later, user: who.stranger.id, side: 'away' } })
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: later, user: who.vali.id, side: 'away' } })
      const recent = await ids(await list({ filter: 'recent' }, 'stranger'))
      // Host and Vəli shared the later game; Kamal only the earlier one.
      expect(recent.slice(0, 2).sort()).toEqual([String(who.host.id), String(who.vali.id)].sort())
      expect(recent[2]).toBe(String(who.kamal.id))
      expect(recent).not.toContain(String(who.stranger.id))
      expect(await ids(await list({ filter: 'recent', q: 'kamal' }, 'stranger'))).toEqual([String(who.kamal.id)])
    })

    it('leaves out people already in the game or invited to it', async () => {
      const gameId = await makeGame()
      await one(gameId, 'ali', 'away')
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: gameId, user: who.vali.id, side: 'away' } })
      expect(await ids(await list({ q: `Invite ${suffix}`, gameId }, 'host'))).toEqual([String(who.kamal.id)])
      expect(await ids(await list({ q: `Invite ${suffix}` }, 'host'))).toEqual(expect.arrayContaining([String(who.ali.id), String(who.vali.id), String(who.kamal.id)]))
    })

    it('refuses a bad filter, page, limit or game', async () => {
      for (const params of [{ filter: 'everyone' }, { page: 0 }, { page: 'x' }, { limit: 51 }, { limit: 0 }, { gameId: -1 }, { gameId: 0 }] as Record<string, string | number>[]) {
        expect((await list(params, 'host')).status, JSON.stringify(params)).toBe(400)
      }
    })
  })

  it('invites several players in one request', async () => {
    const gameId = await makeGame({ homeTeam: homeClub })
    const response = await invite(gameId, 'host', { invites: [{ userId: who.member.id, side: 'home' }, { userId: who.kamal.id, side: 'away' }] })
    expect(response.status).toBe(200)
    expect((await response.json()).invited).toBe(2)
    expect((await rows(gameId)).map((row) => [row.user, row.side])).toEqual([[who.member.id, 'home'], [who.kamal.id, 'away']])
    // One refused invite refuses the batch and writes none of it.
    const other = await makeGame({ homeTeam: homeClub })
    const refused = await invite(other, 'host', { invites: [{ userId: who.kamal.id, side: 'away' }, { userId: who.stranger.id, side: 'home' }] })
    expect(refused.status).toBe(409)
    const refusal = (await refused.clone().json()).error
    expect(refusal.code).toBe('INVITE_NOT_A_MEMBER')
    // The message names the player who can't be put there.
    expect(refusal.message).toContain(`Stranger ${suffix}`)
    expect(await rows(other)).toHaveLength(0)
  })

  describe('creating a game with invites', () => {
    const create = async (extra: Record<string, unknown>) => {
      const response = (await createRoute(
        new Request('http://localhost/api/v1/games', {
          method: 'POST',
          headers: { ...cookie('host'), ...json },
          body: JSON.stringify({
            title: `Created With Invites ${suffix}`,
            sport: 'football',
            level: 'medium',
            venueId: arenaId,
            scheduledDate: formatBakuDateKey(new Date(Date.now() + 72 * HOUR_MS)),
            scheduledTime: '18:00',
            currentCount: 1,
            maxCount: 10,
            hostPhone: '+994501234567',
            ...extra,
          }),
        }),
      )) as Response
      const body = await response.json()
      if (response.status === 201) gameIds.push(Number(body.game.id))
      return { status: response.status, body }
    }
    const withTitle = () => payload.count({ collection: 'games', where: { title: { equals: `Created With Invites ${suffix}` } }, overrideAccess: true })

    it('writes the invites with the game', async () => {
      const { status, body } = await create({ invites: [{ userId: who.ali.id, side: 'away' }, { userId: who.vali.id, side: 'home' }] })
      expect(status).toBe(201)
      expect((await rows(Number(body.game.id))).map((row) => [row.user, row.side, row.status])).toEqual([
        [who.ali.id, 'away', 'pending'],
        [who.vali.id, 'home', 'pending'],
      ])
    })

    it('refuses the whole game when an invite is refused, leaving no game behind', async () => {
      const before = (await withTitle()).totalDocs
      const nonMember = await create({ homeTeamId: homeClub, hostSide: 'home', invites: [{ userId: who.stranger.id, side: 'home' }] })
      expect(nonMember.status).toBe(409)
      expect(nonMember.body.error.code).toBe('INVITE_NOT_A_MEMBER')
      const unknown = await create({ invites: [{ userId: 2_000_000_000, side: 'home' }] })
      expect(unknown.status).toBe(404)
      expect(unknown.body.error.code).toBe('USER_NOT_FOUND')
      const self = await create({ invites: [{ userId: who.host.id, side: 'away' }] })
      expect(self.body.error.code).toBe('ALREADY_IN_GAME')
      expect((await withTitle()).totalDocs).toBe(before)
    })

    it('refuses a malformed list', async () => {
      for (const invites of ['all', [{ userId: who.ali.id }], [{ userId: who.ali.id, side: 'home' }, { userId: who.ali.id, side: 'away' }], Array.from({ length: 22 }, (_, i) => ({ userId: i + 1, side: 'home' }))]) {
        const { status, body } = await create({ invites })
        expect(status).toBe(400)
        expect(body.error.code).toBe('INVALID_INVITES')
      }
    })
  })

  it('removes invites with their game and with their player\'s account', async () => {
    const gameId = await makeGame()
    await one(gameId, 'kamal', 'home')
    const gone = await payload.create({ collection: 'users', overrideAccess: true, data: { email: `invite-${suffix}-gone@oyunagel.test`, password: 'invite-test-password', fullName: 'Gone' } })
    await one(gameId, 'ali', 'home')
    expect(await rows(gameId)).toHaveLength(2)
    await payload.update({ collection: 'game-invites', where: { and: [{ game: { equals: gameId } }, { user: { equals: who.ali.id } }] }, overrideAccess: true, data: { user: gone.id } })
    await payload.delete({ collection: 'users', id: gone.id, overrideAccess: true })
    expect((await rows(gameId)).map((row) => row.user)).toEqual([who.kamal.id])
    // Participants are removed with the game by hand (deleteGame does it); the invites go on their own.
    await payload.delete({ collection: 'game-participants', where: { game: { equals: gameId } }, overrideAccess: true })
    await payload.delete({ collection: 'games', id: gameId, overrideAccess: true })
    expect(await rows(gameId)).toHaveLength(0)
    gameIds.splice(gameIds.indexOf(gameId), 1)
  })
})
