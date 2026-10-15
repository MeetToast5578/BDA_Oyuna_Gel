import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

type TestUser = { id: number; role?: string | null; collection: 'users' }

/**
 * Payload's own REST route runs these same access rules. A host must not be able to write a game
 * there, or any user a team: the site writes both only through /api/v1, which validates first.
 */
describe.skipIf(!process.env.DATABASE_URL)('games and teams access (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let host: TestUser
  let admin: TestUser
  let arenaId: number
  let gameId: number
  let teamId: number

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const makeUser = async (name: string, role: 'user' | 'admin' = 'user'): Promise<TestUser> => {
      const doc = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `access-${suffix}-${name}@oyunagel.test`, password: 'access-test-password', fullName: `Access ${name}`, role },
      })
      return { ...doc, collection: 'users' }
    }
    host = await makeUser('host')
    admin = await makeUser('admin', 'admin')
    arenaId = (
      await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Access Arena ${suffix}`, location: 'Bakı' } })
    ).id
    gameId = (
      await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Access Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: host.id,
          scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          maxPlayers: 10,
          availablePlayers: 9,
          status: 'scheduled',
        },
      })
    ).id
    teamId = (await payload.create({ collection: 'teams', overrideAccess: true, data: { name: `Access Team ${suffix}`, sport: 'football' } })).id
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'games', where: { id: { equals: gameId } }, overrideAccess: true })
    await payload.delete({ collection: 'teams', where: { id: { equals: teamId } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: [host.id, admin.id] } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('refuses a host writing their own game outside /api/v1', async () => {
    await expect(
      payload.update({ collection: 'games', id: gameId, data: { availablePlayers: 99, status: 'finished' }, user: host, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'games', id: gameId, user: host, overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'games',
        user: host,
        overrideAccess: false,
        data: {
          title: 'Bypass',
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: host.id,
          scheduledAt: new Date().toISOString(),
          maxPlayers: 10,
          availablePlayers: 10,
        },
      }),
    ).rejects.toThrow()

    const game = await payload.findByID({ collection: 'games', id: gameId, overrideAccess: true })
    expect(game.availablePlayers).toBe(9)
    expect(game.status).toBe('scheduled')
  })

  it('refuses a user writing a team, and lets admins and everyone read', async () => {
    await expect(
      payload.update({ collection: 'teams', id: teamId, data: { members: [host.id] }, user: host, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'teams', id: teamId, user: host, overrideAccess: false })).rejects.toThrow()

    const renamed = await payload.update({ collection: 'teams', id: teamId, data: { shortName: 'ACC' }, user: admin, overrideAccess: false })
    expect(renamed.shortName).toBe('ACC')
    expect((await payload.findByID({ collection: 'teams', id: teamId, overrideAccess: false })).name).toBe(`Access Team ${suffix}`)
  })
})
