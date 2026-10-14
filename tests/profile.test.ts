import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { claimSpot, releaseSpot } from '@/lib/join-game'
import {
  deleteMyAccount,
  findMyGames,
  getMyProfile,
  getPublicProfile,
  rememberPhone,
  updateMyProfile,
} from '@/lib/profile-queries'

const HOUR_MS = 60 * 60 * 1000

/**
 * The profile backend against the real database: leaving a game, "my games", the profile itself and
 * account deletion. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('profile backend (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let host: number
  let player: number
  let arenaId: number
  const gameIds: number[] = []

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const users = await Promise.all(
      ['host', 'player'].map((role) =>
        payload.create({
          collection: 'users',
          overrideAccess: true,
          data: {
            email: `profile-${suffix}-${role}@oyunagel.test`,
            password: 'profile-test-password',
            fullName: `Profile ${role}`,
          },
        }),
      ),
    )
    host = users[0].id
    player = users[1].id
    arenaId = (
      await payload.create({
        collection: 'arenas',
        overrideAccess: true,
        data: { name: `Profile Arena ${suffix}`, location: 'Bakı' },
      })
    ).id
  })

  afterAll(async () => {
    if (!payload) return
    if (gameIds.length) {
      await payload.delete({ collection: 'game-participants', where: { game: { in: gameIds } } })
      await payload.delete({ collection: 'games', where: { id: { in: gameIds } } })
    }
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } } })
    await payload.delete({ collection: 'users', where: { id: { in: [host, player] } } })
    await payload.db.destroy?.()
  })

  async function makeGame({
    owner = host,
    hoursFromNow = 3,
    availablePlayers = 5,
    status = 'scheduled' as 'scheduled' | 'cancelled' | 'finished',
    sport = 'football' as 'football' | 'basketball' | 'tennis',
  } = {}) {
    const game = await payload.create({
      collection: 'games',
      overrideAccess: true,
      data: {
        title: `Profile Game ${suffix}`,
        sport,
        level: 'medium',
        arena: arenaId,
        host: owner,
        scheduledAt: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
        maxPlayers: 10,
        availablePlayers,
        status,
      },
    })
    gameIds.push(game.id)
    return game.id
  }

  const spotsLeft = async (id: number) =>
    (await payload.findByID({ collection: 'games', id, overrideAccess: true })).availablePlayers

  describe('releaseSpot', () => {
    it('gives the spot back and refuses to give it twice', async () => {
      const gameId = await makeGame({ availablePlayers: 5 })
      await claimSpot(payload, gameId, player, null, 'Player')
      expect(await spotsLeft(gameId)).toBe(4)

      expect(await releaseSpot(payload, gameId, player)).toEqual({ ok: true, remainingSpots: 5, maxCount: 10 })
      expect(await spotsLeft(gameId)).toBe(5)

      // The exploit this guards: a second leave must not invent another spot.
      expect(await releaseSpot(payload, gameId, player)).toEqual({ ok: false, code: 'NOT_JOINED' })
      expect(await spotsLeft(gameId)).toBe(5)
    })

    it('never pushes availability past the size of the game', async () => {
      const gameId = await makeGame({ availablePlayers: 5 })
      await claimSpot(payload, gameId, player, null, 'Player')

      const results = await Promise.all([
        releaseSpot(payload, gameId, player),
        releaseSpot(payload, gameId, player),
        releaseSpot(payload, gameId, player),
      ])

      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(await spotsLeft(gameId)).toBe(5)
    })

    it('will not let the host leave their own game', async () => {
      const gameId = await makeGame()
      await claimSpot(payload, gameId, host, null, 'Host')
      expect(await releaseSpot(payload, gameId, host)).toEqual({ ok: false, code: 'HOST_CANNOT_LEAVE' })
    })

    it('refuses once the game has started, and for a game that is gone', async () => {
      const started = await makeGame({ hoursFromNow: -1 })
      expect(await releaseSpot(payload, started, player)).toEqual({ ok: false, code: 'GAME_STARTED' })
      expect(await releaseSpot(payload, 2_000_000_000, player)).toEqual({ ok: false, code: 'GAME_NOT_FOUND' })
    })

    it('reports NOT_JOINED for someone who never joined', async () => {
      const gameId = await makeGame()
      expect(await releaseSpot(payload, gameId, player)).toEqual({ ok: false, code: 'NOT_JOINED' })
    })
  })

  describe('findMyGames', () => {
    it('separates hosting from joined, and keeps own games out of joined', async () => {
      const hostedByHost = await makeGame({ owner: host })
      const hostedByPlayer = await makeGame({ owner: player })
      await claimSpot(payload, hostedByHost, player, null, 'Player')
      // The player is a participant in their own game too, which must not show up under "joined".
      await claimSpot(payload, hostedByPlayer, player, null, 'Player')

      const joined = await findMyGames(player, { role: 'joined', when: 'upcoming', page: 1, limit: 50 })
      const hosting = await findMyGames(player, { role: 'hosting', when: 'upcoming', page: 1, limit: 50 })

      const ids = (list: { games: { id: string }[] }) => list.games.map((g) => Number(g.id))
      expect(ids(joined)).toContain(hostedByHost)
      expect(ids(joined)).not.toContain(hostedByPlayer)
      expect(ids(hosting)).toContain(hostedByPlayer)
      expect(ids(hosting)).not.toContain(hostedByHost)
    })

    it('splits upcoming from past', async () => {
      const past = await makeGame({ owner: host, hoursFromNow: -48 })

      const upcoming = await findMyGames(host, { role: 'hosting', when: 'upcoming', page: 1, limit: 50 })
      const history = await findMyGames(host, { role: 'hosting', when: 'past', page: 1, limit: 50 })

      expect(history.games.map((g) => Number(g.id))).toContain(past)
      expect(upcoming.games.map((g) => Number(g.id))).not.toContain(past)
    })

    it('returns cards carrying server-derived status, not raw rows', async () => {
      const list = await findMyGames(host, { role: 'hosting', when: 'upcoming', page: 1, limit: 1 })
      expect(list.games[0]).toMatchObject({
        sportLabel: expect.any(String),
        status: expect.any(String),
        remainingSpots: expect.any(Number),
        coverImageUrl: expect.any(String),
      })
      expect(list.pagination.limit).toBe(1)
    })
  })

  describe('getMyProfile / updateMyProfile', () => {
    it('reports identity, counts and per-sport stats without leaking the account internals', async () => {
      const profile = await getMyProfile(host)

      expect(profile).not.toBeNull()
      expect(profile!.email).toContain('@oyunagel.test')
      expect(profile!.counts.hostingUpcoming).toBeGreaterThan(0)
      expect(profile!.stats.playedBySport.map((s) => s.sport)).toEqual(['football', 'basketball', 'tennis'])
      expect(profile).not.toHaveProperty('role')
      expect(profile).not.toHaveProperty('googleId')
      expect(profile).not.toHaveProperty('password')
    })

    it('counts played games once, leaves cancelled ones out, and the per-sport stats add up', async () => {
      const before = (await getMyProfile(host))!

      // Called off: still listed under "Keçmiş", but nobody played it.
      await makeGame({ owner: host, hoursFromNow: -30, status: 'cancelled' })
      const afterCancelled = (await getMyProfile(host))!
      expect(afterCancelled.counts.hostedPast).toBe(before.counts.hostedPast)
      expect(afterCancelled.stats.totalPlayed).toBe(before.stats.totalPlayed)

      await makeGame({ owner: host, hoursFromNow: -26, sport: 'tennis' })
      const after = (await getMyProfile(host))!
      expect(after.counts.hostedPast).toBe(before.counts.hostedPast + 1)
      expect(after.stats.totalPlayed).toBe(before.stats.totalPlayed + 1)
      const tennis = (profile: typeof after) => profile.stats.playedBySport.find((s) => s.sport === 'tennis')!.playedCount
      expect(tennis(after)).toBe(tennis(before) + 1)

      // Hosted and joined games are counted separately, so together they are every game played.
      expect(after.stats.totalPlayed).toBe(after.counts.played + after.counts.hostedPast)
      expect(after.memberSinceLabel).toMatch(/^\p{Ll}+ \d{4}$/u)
    })

    it('still lists a cancelled past game under past games, marked cancelled', async () => {
      const cancelled = await makeGame({ owner: host, hoursFromNow: -40, status: 'cancelled' })
      const history = await findMyGames(host, { role: 'hosting', when: 'past', page: 1, limit: 50 })
      expect(history.games.find((g) => Number(g.id) === cancelled)?.status).toBe('cancelled')
    })

    it('saves a normalized phone and a new name', async () => {
      const result = await updateMyProfile(host, { fullName: 'Yeni Ad', phone: '+994552223344' })
      expect(result.ok).toBe(true)
      expect(result.ok && result.profile.fullName).toBe('Yeni Ad')
      expect(result.ok && result.profile.phoneNumber).toBe('+994552223344')
    })

    it('refuses a phone another account already holds', async () => {
      await updateMyProfile(player, { phone: '+994553334455' })
      expect(await updateMyProfile(host, { phone: '+994553334455' })).toMatchObject({
        ok: false,
        code: 'PHONE_TAKEN',
      })
    })
  })

  describe('rememberPhone', () => {
    // Numbers of their own, so they can't collide with seed data or the tests above.
    const number = (n: number) => `+99499${String((suffix + n) % 10_000_000).padStart(7, '0')}`

    it('fills an empty profile number, and leaves a set one alone unless asked', async () => {
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: { email: `profile-${suffix}-remember@oyunagel.test`, password: 'profile-test-password', fullName: 'Remember Me' },
      })
      const phoneOf = async () => (await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })).phoneNumber
      try {
        expect(await rememberPhone(user.id, number(1))).toBe(true)
        expect(await phoneOf()).toBe(number(1))

        // Already there: nothing to save.
        expect(await rememberPhone(user.id, number(1))).toBe(false)

        // A different number doesn't replace the profile's on its own…
        expect(await rememberPhone(user.id, number(2))).toBe(false)
        expect(await phoneOf()).toBe(number(1))
        // …only when the person asked ("Bu nömrəni profilimdə saxla").
        expect(await rememberPhone(user.id, number(2), { overwrite: true })).toBe(true)
        expect(await phoneOf()).toBe(number(2))
      } finally {
        await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
      }
    })

    it("never takes a number another account holds, and doesn't throw", async () => {
      await updateMyProfile(player, { phone: number(3) })
      await updateMyProfile(host, { phone: null })

      expect(await rememberPhone(host, number(3))).toBe(false)
      expect(await rememberPhone(host, number(3), { overwrite: true })).toBe(false)
      expect((await getMyProfile(host))?.phoneNumber).toBeNull()
      expect(await rememberPhone(2_000_000_000, number(4))).toBe(false)
    })
  })

  describe('getPublicProfile', () => {
    it('shows the host and their games but never their contact details', async () => {
      const profile = await getPublicProfile(host)

      expect(profile).not.toBeNull()
      expect(profile!.fullName).toBeTruthy()
      expect(profile).not.toHaveProperty('email')
      expect(profile).not.toHaveProperty('phoneNumber')
      expect(Array.isArray(profile!.hostedGames)).toBe(true)
    })

    it('is null for a user that does not exist', async () => {
      expect(await getPublicProfile(2_000_000_000)).toBeNull()
    })
  })

  describe('deleteMyAccount', () => {
    it('takes the hosted games with it instead of leaving them hostless', async () => {
      const doomed = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: `profile-${suffix}-doomed@oyunagel.test`,
          password: 'profile-test-password',
          fullName: 'Doomed Host',
        },
      })
      const game = await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Doomed Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: doomed.id,
          scheduledAt: new Date(Date.now() + 5 * HOUR_MS).toISOString(),
          maxPlayers: 10,
          availablePlayers: 9,
          status: 'scheduled',
        },
      })
      await claimSpot(payload, game.id, player, null, 'Player')

      const { deletedGames } = await deleteMyAccount(doomed.id)

      expect(deletedGames).toBe(1)
      expect(
        await payload.findByID({ collection: 'games', id: game.id, overrideAccess: true, disableErrors: true }),
      ).toBeFalsy()
      // The real regression: an upcoming game left behind with no host to run it.
      const hostless = await payload.count({
        collection: 'games',
        where: { and: [{ host: { exists: false } }, { scheduledAt: { greater_than: new Date().toISOString() } }] },
        overrideAccess: true,
      })
      expect(hostless.totalDocs).toBe(0)
      const strays = await payload.count({
        collection: 'game-participants',
        where: { game: { equals: game.id } },
        overrideAccess: true,
      })
      expect(strays.totalDocs).toBe(0)
    })

    it("keeps the games it hosted that already happened, in the other players' history", async () => {
      const leavingHost = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: `profile-${suffix}-pasthost@oyunagel.test`,
          password: 'profile-test-password',
          fullName: 'Past Host',
        },
      })
      const past = await makeGame({ owner: leavingHost.id, hoursFromNow: -30, availablePlayers: 8 })
      const upcoming = await makeGame({ owner: leavingHost.id, availablePlayers: 8 })
      await payload.update({ collection: 'games', id: past, overrideAccess: true, data: { contactPhone: '+994501112233' } })
      for (const game of [past, upcoming]) {
        await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game, user: leavingHost.id, side: 'home' } })
        await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game, user: player, side: 'away' } })
      }
      const playedBefore = (await getMyProfile(player))?.counts.played

      const { deletedGames } = await deleteMyAccount(leavingHost.id)

      expect(deletedGames).toBe(1)
      expect(await payload.findByID({ collection: 'games', id: upcoming, overrideAccess: true, disableErrors: true })).toBeFalsy()
      const kept = await payload.findByID({ collection: 'games', id: past, depth: 0, overrideAccess: true })
      expect(kept.host ?? null).toBeNull()
      // The host's number goes with their account, even though the game stays.
      expect(kept.contactPhone ?? null).toBeNull()
      expect(kept.availablePlayers).toBe(8)
      expect((await getMyProfile(player))?.counts.played).toBe(playedBefore)
      const pastList = await findMyGames(player, { role: 'joined', when: 'past', page: 1, limit: 50 })
      expect(pastList.games.map((game) => game.id)).toContain(String(past))
    })

    it("hands the spots it held in other people's upcoming games back, but not in past ones", async () => {
      const leaving = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: `profile-${suffix}-leaving@oyunagel.test`,
          password: 'profile-test-password',
          fullName: 'Leaving Player',
        },
      })
      const upcoming = await makeGame({ owner: host, availablePlayers: 5 })
      await claimSpot(payload, upcoming, leaving.id, null, 'Leaving Player')
      expect(await spotsLeft(upcoming)).toBe(4)

      // Joining a game that already happened isn't possible any more, so the row is written directly.
      const past = await makeGame({ owner: host, hoursFromNow: -20, availablePlayers: 3 })
      await payload.create({
        collection: 'game-participants',
        overrideAccess: true,
        data: { game: past, user: leaving.id, side: 'away' },
      })

      await deleteMyAccount(leaving.id)

      expect(await spotsLeft(upcoming)).toBe(5)
      // The past game's numbers are the record of who played; they stay as they were.
      expect(await spotsLeft(past)).toBe(3)
      const rows = await payload.count({
        collection: 'game-participants',
        where: { user: { equals: leaving.id } },
        overrideAccess: true,
      })
      expect(rows.totalDocs).toBe(0)
    })
  })
})
