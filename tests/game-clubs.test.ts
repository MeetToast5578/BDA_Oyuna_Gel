import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { PATCH } from '@/app/api/v1/games/[id]/route'
import { POST } from '@/app/api/v1/games/route'
import { formatBakuDateKey } from '@/lib/game-backend'
import { getGameDetail, getGamePlayers } from '@/lib/game-queries'
import { claimSpot } from '@/lib/join-game'
import { reassignSides } from '@/lib/sides'

const HOUR_MS = 60 * 60 * 1000

/**
 * A game can be between clubs: home is one of the host's clubs, away any club of the sport or open.
 * Create and edit run the same checks (sport, two different clubs, and every player standing on a side
 * they may stand on) in the transaction that writes the game. The route handlers are called with real
 * session cookies, against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('games between clubs (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  let hostId: number
  let playerId: number
  let token = ''
  const userIds: number[] = []
  const teamIds: number[] = []
  const gameIds: number[] = []
  /** The host's club (football), a club the host isn't in (football), and a tennis club the host is in. */
  const clubs = { mine: 0, other: 0, otherMine: 0, tennis: 0 }

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const email = `clubs-${suffix}-host@oyunagel.test`
    const host = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'clubs-test-password', fullName: 'Clubs host' } })
    const player = await payload.create({ collection: 'users', overrideAccess: true, data: { email: `clubs-${suffix}-p@oyunagel.test`, password: 'clubs-test-password', fullName: 'Clubs player' } })
    hostId = host.id
    playerId = player.id
    userIds.push(host.id, player.id)
    token = (await payload.login({ collection: 'users', data: { email, password: 'clubs-test-password' } })).token ?? ''
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Clubs Arena ${suffix}`, location: 'Bakı' } })).id

    const club = async (name: string, sport: string, members: number[]) => {
      const created = await payload.create({ collection: 'teams', overrideAccess: true, data: { name: `${name} ${suffix}`, sport: sport as 'football', members, captain: members[0] } })
      teamIds.push(created.id)
      return created.id
    }
    clubs.mine = await club('Mine', 'football', [host.id])
    clubs.other = await club('Other', 'football', [player.id])
    clubs.otherMine = await club('Other mine', 'football', [host.id])
    clubs.tennis = await club('Tennis', 'tennis', [host.id])
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

  const body = (extra: Record<string, unknown> = {}) => ({
    title: `Clubs Game ${suffix}`,
    sport: 'football',
    level: 'medium',
    venueId: arenaId,
    scheduledDate: formatBakuDateKey(new Date(Date.now() + 72 * HOUR_MS)),
    scheduledTime: '18:00',
    currentCount: 1,
    maxCount: 10,
    hostPhone: '+994501234567',
    ...extra,
  })

  async function create(extra: Record<string, unknown> = {}) {
    const response = (await POST(
      new Request('http://localhost/api/v1/games', {
        method: 'POST',
        headers: { Cookie: `payload-token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body(extra)),
      }),
    )) as Response
    const json = await response.json()
    if (response.status === 201) gameIds.push(Number(json.game.id))
    return { status: response.status, json }
  }

  async function edit(gameId: number, extra: Record<string, unknown> = {}) {
    const response = (await PATCH(
      new Request(`http://localhost/api/v1/games/${gameId}`, {
        method: 'PATCH',
        headers: { Cookie: `payload-token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), ...extra }),
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    )) as Response
    return { status: response.status, json: await response.json() }
  }

  const stored = (gameId: number) => payload.findByID({ collection: 'games', id: gameId, depth: 0, overrideAccess: true })

  it('creates a game with the host\'s club at home and any club of the sport away', async () => {
    const { status, json } = await create({ homeTeamId: clubs.mine, awayTeamId: clubs.other })
    expect(status).toBe(201)
    expect(json.game.teams).toEqual({
      home: { id: String(clubs.mine), name: `Mine ${suffix}` },
      away: { id: String(clubs.other), name: `Other ${suffix}` },
    })
    expect(await stored(Number(json.game.id))).toMatchObject({ homeTeam: clubs.mine, awayTeam: clubs.other })
    const players = await getGamePlayers(Number(json.game.id), hostId)
    expect(players?.host.side).toBe('home')
    expect(players?.sideNames).toEqual({ home: `Mine ${suffix}`, away: `Other ${suffix}` })
  })

  it('creates an open game when no club is chosen, and reads empty or null ids as open', async () => {
    for (const extra of [{}, { homeTeamId: null, awayTeamId: '' }]) {
      const { status, json } = await create(extra)
      expect(status).toBe(201)
      expect(json.game.teams).toEqual({ home: null, away: null })
    }
  })

  it('refuses a home club the host is not in, and creates nothing', async () => {
    const before = await payload.count({ collection: 'games', where: { title: { equals: `Clubs Game ${suffix}` } }, overrideAccess: true })
    const { status, json } = await create({ homeTeamId: clubs.other })
    expect(status).toBe(409)
    expect(json.error.code).toBe('NOT_A_MEMBER')
    const after = await payload.count({ collection: 'games', where: { title: { equals: `Clubs Game ${suffix}` } }, overrideAccess: true })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('refuses a club of another sport, the same club twice, an unknown club and a bad id', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ homeTeamId: clubs.tennis }, 'TEAM_SPORT_MISMATCH'],
      [{ homeTeamId: clubs.mine, awayTeamId: clubs.tennis }, 'TEAM_SPORT_MISMATCH'],
      [{ homeTeamId: clubs.mine, awayTeamId: clubs.mine }, 'SAME_TEAM'],
      [{ homeTeamId: 999_999_999 }, 'TEAM_NOT_FOUND'],
      [{ homeTeamId: 'abc' }, 'INVALID_TEAM'],
      [{ awayTeamId: -3 }, 'INVALID_TEAM'],
    ]
    for (const [extra, code] of cases) {
      const { status, json } = await create(extra)
      expect(status, code).toBe(400)
      expect(json.error.code).toBe(code)
    }
  })

  it('shows the clubs on a game card and in the detail', async () => {
    const { json } = await create({ homeTeamId: clubs.mine })
    const detail = await getGameDetail(Number(json.game.id), null)
    expect(detail?.teams).toEqual({ home: { id: String(clubs.mine), name: `Mine ${suffix}` }, away: null })
  })

  describe('editing', () => {
    it('refuses a club that would strand a player on its side, until the host moves them', async () => {
      const { json } = await create()
      const gameId = Number(json.game.id)
      // The player joins the home side, where only the club's members may stand once it is set.
      expect((await claimSpot(payload, gameId, playerId, '+994501112233', 'Clubs player', 'home')).ok).toBe(true)

      const refused = await edit(gameId, { homeTeamId: clubs.mine })
      expect(refused.status).toBe(409)
      expect(refused.json.error.code).toBe('NOT_A_MEMBER')
      expect((await stored(gameId)).homeTeam).toBeFalsy()

      expect((await reassignSides(payload, gameId, { balance: false, assignments: [{ userId: playerId, side: 'away' }] })).ok).toBe(true)
      const saved = await edit(gameId, { homeTeamId: clubs.mine })
      expect(saved.status).toBe(200)
      expect(saved.json.game.teams.home.name).toBe(`Mine ${suffix}`)
      expect((await stored(gameId)).homeTeam).toBe(clubs.mine)
    })

    it('checks the clubs against the new sport, and clears them when the form sends none', async () => {
      const { json } = await create({ homeTeamId: clubs.mine })
      const gameId = Number(json.game.id)

      const mismatch = await edit(gameId, { sport: 'tennis', maxCount: 4, homeTeamId: clubs.mine })
      expect(mismatch.status).toBe(400)
      expect(mismatch.json.error.code).toBe('TEAM_SPORT_MISMATCH')

      const swapped = await edit(gameId, { homeTeamId: clubs.otherMine, awayTeamId: clubs.other })
      expect(swapped.status).toBe(200)
      expect(await stored(gameId)).toMatchObject({ homeTeam: clubs.otherMine, awayTeam: clubs.other })

      const cleared = await edit(gameId)
      expect(cleared.status).toBe(200)
      expect(cleared.json.game.teams).toEqual({ home: null, away: null })
    })
  })
})
