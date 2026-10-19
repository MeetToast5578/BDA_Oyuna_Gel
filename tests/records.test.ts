import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { GET as listRoute } from '@/app/api/v1/teams/route'
import { getMyProfile, getPublicProfile } from '@/lib/profile-queries'
import { playerRecords, teamRecords } from '@/lib/records'
import { getTeam, listTeams } from '@/lib/teams'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Records and standings, from confirmed scores only. Club A, B and C play four counted games and
 * three that must not count (a fresh report, a disputed score, a cancelled game), so one fixture
 * checks the SQL against the rules in `resultCounts` for players, clubs, profiles and the table.
 */
describe.skipIf(!process.env.DATABASE_URL)('records and standings (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let db: PostgresAdapter['drizzle']
  let arenaId: number
  let u1 = 0
  let u2 = 0
  let teamA = 0
  let teamB = 0
  let teamC = 0
  const userIds: number[] = []
  const teamIds: number[] = []
  const gameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    db = (payload.db as unknown as PostgresAdapter).drizzle

    const user = async (name: string) => {
      const created = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `records-${suffix}-${name}@oyunagel.test`, password: 'records-test-password', fullName: `Records ${name}` },
      })
      userIds.push(created.id)
      return created.id
    }
    u1 = await user('one')
    u2 = await user('two')
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Records Arena ${suffix}`, location: 'Bakı' } })).id

    const club = async (name: string, members: number[]) => {
      const created = await payload.create({
        collection: 'teams',
        overrideAccess: true,
        data: { name: `${name} ${suffix}`, sport: 'football', members, captain: members[0] },
      })
      teamIds.push(created.id)
      return created.id
    }
    teamA = await club('Club A', [u1])
    teamB = await club('Club B', [u2])
    teamC = await club('Club C', [u2])

    const played = async (
      daysAgo: number,
      home: number,
      away: number,
      score: [number, number],
      state: { status?: 'confirmed' | 'reported' | 'disputed'; reportedHoursAgo?: number; cancelled?: boolean },
      players: [number, 'home' | 'away'][],
    ) => {
      const game = await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Records Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: u1,
          homeTeam: home,
          awayTeam: away,
          scheduledAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
          maxPlayers: 10,
          availablePlayers: 9,
          contactPhone: '+994501234567',
          status: state.cancelled ? 'cancelled' : 'scheduled',
          homeScore: score[0],
          awayScore: score[1],
          resultStatus: state.status,
          resultReportedAt: new Date(Date.now() - (state.reportedHoursAgo ?? 1) * HOUR_MS).toISOString(),
        },
      })
      gameIds.push(game.id)
      for (const [userId, side] of players) {
        await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: game.id, user: userId, side } })
      }
    }
    // Counted: A beats B 3–1, A draws C 1–1, B beats A 2–0 (a report nobody answered for 49 hours).
    await played(10, teamA, teamB, [3, 1], { status: 'confirmed' }, [[u1, 'home'], [u2, 'away']])
    await played(9, teamA, teamC, [1, 1], { status: 'confirmed' }, [[u1, 'home']])
    await played(8, teamB, teamA, [2, 0], { status: 'reported', reportedHoursAgo: 49 }, [[u2, 'home'], [u1, 'away']])
    // Not counted: a report of 1 hour, a disputed score, a cancelled game.
    await played(7, teamA, teamB, [5, 0], { status: 'reported', reportedHoursAgo: 1 }, [[u1, 'home'], [u2, 'away']])
    await played(6, teamA, teamB, [4, 4], { status: 'disputed' }, [[u1, 'home']])
    await played(5, teamA, teamB, [9, 9], { status: 'confirmed', cancelled: true }, [[u1, 'home']])
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } }, overrideAccess: true })
    await payload.delete({ collection: 'games', where: { id: { in: gameIds } }, overrideAccess: true })
    await payload.delete({ collection: 'teams', where: { id: { in: teamIds } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: userIds } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('reads a player\'s counted games with the side they stood on', async () => {
    const records = await playerRecords(db, [u1, u2])
    expect(records.get(u1)).toHaveLength(3)
    expect(records.get(u2)).toHaveLength(2)
    expect(records.get(u1)?.every((game) => game.sport === 'football')).toBe(true)
  })

  it("reads a club's counted games from the side the club stood on, not from its players", async () => {
    const records = await teamRecords(db, [teamA, teamB, teamC])
    const sides = (id: number) => records.get(id)?.map((game) => game.side).sort()
    expect(sides(teamA)).toEqual(['away', 'home', 'home'])
    expect(sides(teamB)).toEqual(['away', 'home'])
    expect(sides(teamC)).toEqual(['away'])
  })

  it('adds a record and the clubs to the profile, mine and public', async () => {
    const mine = await getMyProfile(u1)
    expect(mine?.record).toMatchObject({ played: 3, wins: 1, draws: 1, losses: 1, scored: 4, conceded: 4, points: 4, form: ['loss', 'draw', 'win'] })
    expect(mine?.record.bySport.find((sport) => sport.sport === 'football')).toMatchObject({ played: 3 })
    expect(mine?.record.bySport.find((sport) => sport.sport === 'tennis')).toMatchObject({ played: 0 })
    expect(mine?.clubs).toEqual([{ id: String(teamA), name: `Club A ${suffix}`, sport: 'football', sportLabel: 'Futbol' }])

    const theirs = await getPublicProfile(u2)
    expect(theirs?.record).toMatchObject({ played: 2, wins: 1, losses: 1, scored: 3, conceded: 3 })
    expect(theirs?.clubs.map((club) => club.id)).toEqual([String(teamB), String(teamC)])
  })

  it('gives a club its record and its latest results, newest first', async () => {
    const team = await getTeam(payload, teamA, null)
    expect(team?.record).toMatchObject({ played: 3, wins: 1, draws: 1, losses: 1, scored: 4, conceded: 4, points: 4 })
    expect(team?.recent.map((game) => [game.outcome, game.homeScore, game.awayScore, game.opponent])).toEqual([
      ['loss', 2, 0, `Club B ${suffix}`],
      ['draw', 1, 1, `Club C ${suffix}`],
      ['win', 3, 1, `Club B ${suffix}`],
    ])
  })

  it('lists the clubs with their record, and orders the standings by points', async () => {
    const own = <T extends { id: string }>(rows: T[]) => rows.filter((row) => teamIds.includes(Number(row.id)))
    const all = await listTeams(payload, 'football')
    expect(own(all).map((team) => [team.id, team.record.points]).sort()).toEqual(
      [[String(teamA), 4], [String(teamB), 3], [String(teamC), 1]].sort(),
    )

    const response = await listRoute(new Request('http://localhost/api/v1/teams?sport=football'))
    const { standings, teams } = await (response as Response).json()
    expect(own(standings).map((team: { id: string }) => Number(team.id))).toEqual([teamA, teamB, teamC])
    expect(teams.length).toBe(standings.length)
    // Without a sport the sports can't share one table, so there is none.
    const everything = await (await listRoute(new Request('http://localhost/api/v1/teams')) as Response).json()
    expect(everything.standings).toBeUndefined()
  })

  it('keeps an empty club out of the standings and gives it a zero record', async () => {
    const lonely = await payload.create({
      collection: 'teams',
      overrideAccess: true,
      data: { name: `Club D ${suffix}`, sport: 'football', members: [u1], captain: u1 },
    })
    teamIds.push(lonely.id)
    const row = (await listTeams(payload, 'football')).find((team) => team.id === String(lonely.id))
    expect(row?.record).toMatchObject({ played: 0, points: 0, form: [] })
  })
})
