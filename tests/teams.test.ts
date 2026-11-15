import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { POST as joinRoute } from '@/app/api/v1/teams/[id]/join/route'
import { POST as leaveRoute } from '@/app/api/v1/teams/[id]/leave/route'
import { DELETE as removeRoute } from '@/app/api/v1/teams/[id]/members/[userId]/route'
import { GET as getRoute, PATCH as patchRoute } from '@/app/api/v1/teams/[id]/route'
import { GET as listRoute, POST as createRoute } from '@/app/api/v1/teams/route'
import { deleteMyAccount } from '@/lib/profile-queries'

type Who = 'ayla' | 'bora' | 'cemal' | 'dilara'

/**
 * Clubs: create, invite link, join, leave, remove, rename. The route handlers are called with real
 * session cookies, against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('clubs (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  const userIds = {} as Record<Who, number>
  const tokens = {} as Record<Who, string>
  const teamIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    for (const who of ['ayla', 'bora', 'cemal', 'dilara'] as Who[]) {
      const email = `club-${suffix}-${who}@oyunagel.test`
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email, password: 'club-test-password', fullName: `Club ${who}` },
      })
      userIds[who] = user.id
      tokens[who] = (await payload.login({ collection: 'users', data: { email, password: 'club-test-password' } })).token ?? ''
    }
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'teams', where: { id: { in: teamIds } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(userIds) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>
  const call = (handler: unknown, method: string, as: Who | null, params: Record<string, string> = {}, body?: unknown, url = 'http://localhost/api/v1/teams') =>
    (handler as Handler)(
      new Request(url, {
        method,
        headers: { ...(as ? { Cookie: `payload-token=${tokens[as]}` } : {}), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve(params) },
    )

  async function makeClub(as: Who = 'ayla', name = `Club ${suffix}`, sport = 'football') {
    const response = await call(createRoute, 'POST', as, {}, { name, sport })
    expect(response.status).toBe(201)
    const id = Number((await response.json()).id)
    teamIds.push(id)
    return id
  }
  const codeOf = async (teamId: number) => (await payload.findByID({ collection: 'teams', id: teamId, overrideAccess: true })).inviteCode as string
  const row = (teamId: number) => payload.findByID({ collection: 'teams', id: teamId, depth: 0, overrideAccess: true })
  const members = async (teamId: number) => ((await row(teamId)).members ?? []).map(Number)
  const join = (teamId: number, as: Who | null, code: unknown) => call(joinRoute, 'POST', as, { id: String(teamId) }, { code })
  const code = async (response: Response) => (await response.json()).error.code

  it('creates a club whose creator is captain and first member, and shows the invite code to them alone', async () => {
    const teamId = await makeClub()
    expect(await row(teamId)).toMatchObject({ captain: userIds.ayla, sport: 'football' })
    expect(await members(teamId)).toEqual([userIds.ayla])

    const mine = await (await call(getRoute, 'GET', 'ayla', { id: String(teamId) })).json()
    expect(mine).toMatchObject({ memberCount: 1, viewer: { isMember: true, isCaptain: true } })
    expect(mine.inviteCode).toBe(await codeOf(teamId))
    expect(mine.inviteCode).toMatch(/^[\w-]{16}$/)
    for (const who of ['bora', null] as const) {
      const view = await (await call(getRoute, 'GET', who, { id: String(teamId) })).json()
      expect(view.inviteCode).toBeNull()
      expect(view.viewer).toEqual({ isMember: false, isCaptain: false })
    }
  })

  it('refuses a bad club, anonymous creation, and a sixth club for one captain', async () => {
    for (const body of [{ name: 'A', sport: 'football' }, { name: 'Ok name', sport: 'chess' }]) {
      expect((await call(createRoute, 'POST', 'bora', {}, body)).status).toBe(400)
    }
    expect((await call(createRoute, 'POST', null, {}, { name: 'Anon', sport: 'tennis' })).status).toBe(401)
    for (let n = 1; n <= 5; n++) await makeClub('dilara', `Dilara ${n} ${suffix}`)
    const sixth = await call(createRoute, 'POST', 'dilara', {}, { name: `Dilara 6 ${suffix}`, sport: 'tennis' })
    expect(sixth.status).toBe(409)
    expect(await code(sixth)).toBe('TOO_MANY_CLUBS')
  })

  it('lets a player join with the invite code, refuses a wrong one, and joining twice does nothing', async () => {
    const teamId = await makeClub()
    expect((await join(teamId, 'bora', 'not-the-code')).status).toBe(403)
    expect(await code(await join(teamId, 'bora', 5))).toBe('INVALID_INVITE')
    expect((await join(teamId, null, await codeOf(teamId))).status).toBe(401)
    expect(await members(teamId)).toEqual([userIds.ayla])

    const first = await join(teamId, 'bora', await codeOf(teamId))
    expect(first.status).toBe(200)
    expect((await first.json()).joined).toBe(true)
    const again = await join(teamId, 'bora', await codeOf(teamId))
    expect((await again.json()).joined).toBe(false)
    expect(await members(teamId)).toEqual([userIds.ayla, userIds.bora])
    expect((await call(joinRoute, 'POST', 'bora', { id: '999999999' }, { code: 'x' })).status).toBe(404)
  })

  it('lets only the captain rename the club, and a new invite code retires the old link', async () => {
    const teamId = await makeClub()
    const old = await codeOf(teamId)
    await join(teamId, 'bora', old)
    const patch = (as: Who | null, body: unknown) => call(patchRoute, 'PATCH', as, { id: String(teamId) }, body)

    expect((await patch('bora', { name: 'Hijacked' })).status).toBe(403)
    expect((await patch(null, { name: 'Hijacked' })).status).toBe(401)
    expect((await patch('ayla', {})).status).toBe(400)
    expect((await patch('ayla', { name: 'X' })).status).toBe(400)
    expect((await row(teamId)).name).toBe(`Club ${suffix}`)

    const renamed = await patch('ayla', { name: `Renamed ${suffix}` })
    expect(renamed.status).toBe(200)
    expect((await row(teamId)).name).toBe(`Renamed ${suffix}`)
    expect(await codeOf(teamId)).toBe(old)

    expect((await patch('bora', { regenerateInviteCode: true })).status).toBe(403)
    const fresh = (await (await patch('ayla', { regenerateInviteCode: true })).json()).inviteCode
    expect(fresh).not.toBe(old)
    expect(await code(await join(teamId, 'cemal', old))).toBe('INVALID_INVITE')
    expect((await join(teamId, 'cemal', fresh)).status).toBe(200)
  })

  it('hands the captaincy to the longest-standing member when the captain leaves, and hides an emptied club', async () => {
    const teamId = await makeClub('ayla', `Leaving ${suffix}`)
    await join(teamId, 'bora', await codeOf(teamId))
    await join(teamId, 'cemal', await codeOf(teamId))
    const leave = (as: Who | null) => call(leaveRoute, 'POST', as, { id: String(teamId) })

    expect((await leave(null)).status).toBe(401)
    expect(await code(await leave('dilara'))).toBe('NOT_A_CLUB_MEMBER')

    expect((await leave('ayla')).status).toBe(200)
    expect(await row(teamId)).toMatchObject({ captain: userIds.bora })
    expect(await members(teamId)).toEqual([userIds.bora, userIds.cemal])

    expect((await leave('cemal')).status).toBe(200)
    expect(await row(teamId)).toMatchObject({ captain: userIds.bora })
    expect((await leave('bora')).status).toBe(200)
    expect((await row(teamId)).captain).toBeFalsy()
    expect(await members(teamId)).toEqual([])

    // The club stays (its old games point at it) but drops out of the list.
    const listed = (await (await call(listRoute, 'GET', null, {}, undefined, 'http://localhost/api/v1/teams')).json()).teams
    expect(listed.map((team: { id: string }) => Number(team.id))).not.toContain(teamId)
    expect((await call(getRoute, 'GET', null, { id: String(teamId) })).status).toBe(200)
  })

  it('lets the captain remove a member, and nobody else', async () => {
    const teamId = await makeClub()
    await join(teamId, 'bora', await codeOf(teamId))
    await join(teamId, 'cemal', await codeOf(teamId))
    const remove = (as: Who | null, userId: number) => call(removeRoute, 'DELETE', as, { id: String(teamId), userId: String(userId) })

    expect((await remove('bora', userIds.cemal)).status).toBe(403)
    expect((await remove(null, userIds.cemal)).status).toBe(401)
    expect(await members(teamId)).toHaveLength(3)

    expect((await remove('ayla', userIds.cemal)).status).toBe(200)
    expect(await members(teamId)).toEqual([userIds.ayla, userIds.bora])
    expect(await code(await remove('ayla', userIds.cemal))).toBe('NOT_A_CLUB_MEMBER')
  })

  it('lists clubs with members by size, and filters by sport', async () => {
    const big = await makeClub('ayla', `Big ${suffix}`, 'basketball')
    await join(big, 'bora', await codeOf(big))
    const small = await makeClub('bora', `Small ${suffix}`, 'basketball')
    await makeClub('cemal', `Tennis ${suffix}`, 'tennis')

    const list = async (query = '') =>
      (await (await call(listRoute, 'GET', null, {}, undefined, `http://localhost/api/v1/teams${query}`)).json()).teams as { id: string; sport: string; memberCount: number }[]
    const basketball = (await list('?sport=basketball')).map((team) => Number(team.id))
    expect(basketball.indexOf(big)).toBeLessThan(basketball.indexOf(small))
    expect(basketball).toContain(small)
    expect((await list('?sport=basketball')).every((team) => team.sport === 'basketball')).toBe(true)
    expect((await call(listRoute, 'GET', null, {}, undefined, 'http://localhost/api/v1/teams?sport=chess')).status).toBe(400)
  })

  it("hands a club to its next member when the captain's account is deleted", async () => {
    const leaver = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email: `club-${suffix}-leaver@oyunagel.test`, password: 'club-test-password', fullName: 'Club leaver' },
    })
    const token = (await payload.login({ collection: 'users', data: { email: leaver.email, password: 'club-test-password' } })).token ?? ''
    const response = (await createRoute(
      new Request('http://localhost/api/v1/teams', {
        method: 'POST',
        headers: { Cookie: `payload-token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Orphan ${suffix}`, sport: 'football' }),
      }),
    )) as Response
    const teamId = Number((await response.json()).id)
    teamIds.push(teamId)
    await join(teamId, 'bora', await codeOf(teamId))

    await deleteMyAccount(leaver.id)
    expect(await row(teamId)).toMatchObject({ captain: userIds.bora })
    expect(await members(teamId)).toEqual([userIds.bora])
  })
})
