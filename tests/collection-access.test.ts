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
  const googleUserIds: number[] = []

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
      await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Access Arena ${suffix}`, location: 'Bakı', city: 'baku' } })
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
    await payload.delete({ collection: 'users', where: { id: { in: [host.id, admin.id, ...googleUserIds] } }, overrideAccess: true })
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

  it('refuses a user writing a venue', async () => {
    await expect(
      payload.create({ collection: 'arenas', data: { name: 'Bypass Arena', location: 'Bakı', city: 'baku' }, user: host, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.update({ collection: 'arenas', id: arenaId, data: { name: 'Defaced' }, user: host, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'arenas', id: arenaId, user: host, overrideAccess: false })).rejects.toThrow()
    expect((await payload.findByID({ collection: 'arenas', id: arenaId, overrideAccess: true })).name).toBe(`Access Arena ${suffix}`)
  })

  it('refuses a user changing their own email, password or phone outside /api/v1', async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: host.id,
        data: { email: `victim-${suffix}@oyunagel.test`, password: 'attacker-password' },
        user: host,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({ collection: 'users', id: host.id, data: { phoneNumber: '+994501112233' }, user: host, overrideAccess: false }),
    ).rejects.toThrow()

    const after = await payload.findByID({ collection: 'users', id: host.id, overrideAccess: true })
    expect(after.email).toBe(`access-${suffix}-host@oyunagel.test`)
    expect(after.phoneNumber ?? null).toBeNull()
    await expect(
      payload.login({ collection: 'users', data: { email: `access-${suffix}-host@oyunagel.test`, password: 'attacker-password' } }),
    ).rejects.toThrow()
  })

  it('Google sign-in links an email-only account once, and never hands an account to a second Google id', async () => {
    const { findOrCreateGoogleUser } = await import('@/lib/google-oauth')
    const email = `google-${suffix}@oyunagel.test`
    const seeded = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email, password: 'seeded-password', fullName: 'Seeded' },
    })
    googleUserIds.push(seeded.id)

    const linked = await findOrCreateGoogleUser(payload, { sub: `g-${suffix}-owner`, email, name: 'Owner' })
    expect(linked?.id).toBe(seeded.id)

    expect(await findOrCreateGoogleUser(payload, { sub: `g-${suffix}-other`, email, name: 'Other' })).toBeNull()

    const again = await findOrCreateGoogleUser(payload, { sub: `g-${suffix}-owner`, email, name: 'Owner Renamed' })
    expect(again?.id).toBe(seeded.id)
    expect(again?.fullName).toBe('Owner Renamed')

    const fresh = await findOrCreateGoogleUser(payload, { sub: `g-${suffix}-new`, email: `new-${email}`, name: 'New' })
    expect(fresh?.id).not.toBe(seeded.id)
    if (fresh) googleUserIds.push(fresh.id)
  })
})
