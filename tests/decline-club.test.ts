import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { POST } from '@/app/api/v1/games/[id]/decline-club/route'
import { getGameDetail } from '@/lib/game-queries'
import { clubOptions, getTeam } from '@/lib/teams'
import type { Side } from '@/lib/team-logic'

const HOUR_MS = 60 * 60 * 1000

/**
 * The captain of the club the host put against their own side can take it out of the game, and the
 * club page lists the club's upcoming games. Route handlers are called with real session cookies,
 * against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('declining a club, and a club\'s upcoming games (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const userIds: number[] = []
  const gameIds: number[] = []
  const teamIds: number[] = []
  const who = {} as Record<'host' | 'homeCaptain' | 'awayCaptain' | 'awayMember' | 'stranger' | 'admin', { id: number; token: string }>
  let homeClub: number
  let awayClub: number

  const makeUser = async (name: string, role: 'user' | 'admin' = 'user') => {
    const email = `decline-${suffix}-${name}@oyunagel.test`
    const user = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'decline-test-password', fullName: `Decline ${name}`, role } })
    userIds.push(user.id)
    const { token } = await payload.login({ collection: 'users', data: { email, password: 'decline-test-password' } })
    return { id: user.id, token: token ?? '' }
  }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    for (const name of ['host', 'homeCaptain', 'awayCaptain', 'awayMember', 'stranger'] as const) who[name] = await makeUser(name)
    who.admin = await makeUser('admin', 'admin')
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Decline Arena ${suffix}`, location: 'Bakı' } })).id
    const club = async (name: string, members: number[], captain: number) => {
      const created = await payload.create({ collection: 'teams', overrideAccess: true, data: { name: `${name} ${suffix}`, sport: 'football', members, captain } })
      teamIds.push(created.id)
      return created.id
    }
    homeClub = await club('Home', [who.host.id, who.homeCaptain.id], who.homeCaptain.id)
    awayClub = await club('Away', [who.awayCaptain.id, who.awayMember.id], who.awayCaptain.id)
  })

  afterAll(async () => {
    if (!payload) return
    if (gameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
      await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    }
    await payload.delete({ collection: 'teams', where: { id: { in: teamIds } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: userIds } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  /** A 10-player game with the host on `hostSide` and the given players; clubs as given. */
  async function makeGame({
    hostSide = 'home',
    homeTeam = homeClub as number | null,
    awayTeam = awayClub as number | null,
    hoursFromNow = 5,
    players = [] as [number, Side][],
  } = {}) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Decline Game ${suffix}`,
        sport: 'football',
        level: 'medium',
        arena: arenaId,
        host: who.host.id,
        homeTeam,
        awayTeam,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers: 10,
        availablePlayers: 9 - players.length,
        contactPhone: '+994501234567',
        status: 'scheduled',
      },
    })
    gameIds.push(game.id)
    for (const [user, side] of [[who.host.id, hostSide as Side], ...players] as [number, Side][]) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user, side } })
    }
    return game.id
  }

  const decline = (gameId: number, as: keyof typeof who | null) =>
    POST(
      new Request(`http://localhost/api/v1/games/${gameId}/decline-club`, {
        method: 'POST',
        headers: as ? { Cookie: `payload-token=${who[as].token}` } : {},
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    ) as Promise<Response>

  const clubsOf = async (gameId: number) => {
    const game = await payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })
    return { home: game.homeTeam ?? null, away: game.awayTeam ?? null }
  }

  it('lets the opposing club\'s captain open that side, and leaves its players in the game', async () => {
    const gameId = await makeGame({ players: [[who.awayMember.id, 'away']] })
    const response = await decline(gameId, 'awayCaptain')
    expect(response.status).toBe(200)
    expect(await clubsOf(gameId)).toEqual({ home: homeClub, away: null })
    const sides = await payload.find({ collection: 'game-participants', where: { game: { equals: gameId } }, depth: 0, pagination: false, overrideAccess: true })
    expect(sides.docs.find((row) => row.user === who.awayMember.id)?.side).toBe('away')
  })

  it('refuses everyone but that club\'s captain (and an admin): members, the host, the host\'s own club, strangers', async () => {
    const gameId = await makeGame()
    expect((await decline(gameId, null)).status).toBe(401)
    for (const as of ['awayMember', 'host', 'homeCaptain', 'stranger'] as const) {
      const response = await decline(gameId, as)
      expect(response.status, as).toBe(403)
      expect((await response.json()).error.code).toBe('NOT_CAPTAIN')
    }
    expect(await clubsOf(gameId)).toEqual({ home: homeClub, away: awayClub })
    expect((await decline(gameId, 'admin')).status).toBe(200)
    expect((await clubsOf(gameId)).away).toBeNull()
  })

  it('declines the club opposite the host, whichever side that is', async () => {
    const gameId = await makeGame({ hostSide: 'away', homeTeam: awayClub, awayTeam: homeClub })
    // The host stands with the away side's club; the home side's club is the opponent.
    expect((await decline(gameId, 'homeCaptain')).status).toBe(403)
    expect((await decline(gameId, 'awayCaptain')).status).toBe(200)
    expect(await clubsOf(gameId)).toEqual({ home: null, away: homeClub })
  })

  it('refuses after kick-off, without an opposing club, and for a game that does not exist', async () => {
    const started = await makeGame({ hoursFromNow: -1 })
    const late = await decline(started, 'awayCaptain')
    expect(late.status).toBe(409)
    expect((await late.json()).error.code).toBe('GAME_STARTED')
    expect((await clubsOf(started)).away).toBe(awayClub)

    const none = await makeGame({ awayTeam: null })
    const open = await decline(none, 'awayCaptain')
    expect(open.status).toBe(409)
    expect((await open.json()).error.code).toBe('NO_OPPONENT_CLUB')

    expect((await decline(2_000_000_000, 'awayCaptain')).status).toBe(404)
  })

  it('shows the button only to the opposing club\'s captain', async () => {
    const gameId = await makeGame()
    expect((await getGameDetail(gameId, who.awayCaptain.id))?.viewer.canDeclineClub).toBe(true)
    for (const user of [who.host.id, who.homeCaptain.id, who.awayMember.id, who.stranger.id, null]) {
      expect((await getGameDetail(gameId, user))?.viewer.canDeclineClub, String(user)).toBe(false)
    }
    await decline(gameId, 'awayCaptain')
    expect((await getGameDetail(gameId, who.awayCaptain.id))?.viewer.canDeclineClub).toBe(false)
  })

  it('lists a club\'s upcoming games on its page, not past ones or another club\'s', async () => {
    const soon = await makeGame({ hoursFromNow: 20 })
    const later = await makeGame({ hoursFromNow: 40 })
    const past = await makeGame({ hoursFromNow: -3 })
    const noClubs = await makeGame({ homeTeam: undefined, awayTeam: null, hoursFromNow: 10 })
    const ids = (await getTeam(payload, awayClub, null))?.upcoming.map((game) => Number(game.id)) ?? []
    expect(ids).toContain(soon)
    expect(ids.indexOf(soon)).toBeLessThan(ids.indexOf(later))
    expect(ids).not.toContain(past)
    expect(ids).not.toContain(noClubs)
    expect((await getTeam(payload, awayClub, null))?.upcoming[0].opponent).toBe(`Home ${suffix}`)
  })

  it('gives each club option its member count', async () => {
    const options = await clubOptions(payload, who.host.id)
    expect(options.find((club) => club.id === String(homeClub))).toMatchObject({ memberCount: 2, mine: true })
    expect(options.find((club) => club.id === String(awayClub))).toMatchObject({ memberCount: 2, mine: false })
  })
})
