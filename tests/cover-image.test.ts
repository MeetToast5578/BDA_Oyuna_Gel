import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { getGameDetail } from '@/lib/game-queries'

/**
 * Proves the venue photo actually reaches a game card: it only works if Payload populates
 * `arena.image` at the depth the game queries use, which no pure unit test can show.
 *
 * Runs against the database in DATABASE_URL. Every record it creates is removed afterwards.
 */
describe.skipIf(!process.env.DATABASE_URL)('venue photo as game cover (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let userId: number
  let mediaId: number
  let arenaId: number
  let gameWithVenuePhoto: number
  let gameWithOwnCover: number
  let ownCoverId: number

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })

    const file = await readFile('public/images/game-football-1-7880cc.png')
    const upload = (name: string) =>
      payload.create({
        collection: 'media',
        overrideAccess: true,
        data: { alt: name },
        file: { data: file, mimetype: 'image/png', name: `${name}.png`, size: file.byteLength },
      })

    const [venuePhoto, ownCover] = await Promise.all([upload(`venue-${suffix}`), upload(`own-${suffix}`)])
    mediaId = venuePhoto.id
    ownCoverId = ownCover.id

    userId = (
      await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: `cover-test-${suffix}@oyunagel.test`,
          password: 'cover-test-password',
          fullName: 'Cover Test Host',
        },
      })
    ).id

    arenaId = (
      await payload.create({
        collection: 'arenas',
        overrideAccess: true,
        data: { name: `Cover Test Arena ${suffix}`, location: 'Bakı', city: 'baku', image: mediaId },
      })
    ).id

    const createGame = async (coverImage?: number) =>
      (
        await payload.create({
          collection: 'games',
          overrideAccess: true,
          data: {
            title: `Cover Test Game ${suffix}`,
            sport: 'football',
            level: 'medium',
            arena: arenaId,
            host: userId,
            scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            maxPlayers: 10,
            availablePlayers: 5,
            status: 'scheduled',
            ...(coverImage ? { coverImage } : {}),
          },
        })
      ).id

    gameWithVenuePhoto = await createGame()
    gameWithOwnCover = await createGame(ownCoverId)
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({
      collection: 'games',
      where: { id: { in: [gameWithVenuePhoto, gameWithOwnCover].filter(Boolean) } },
    })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } } })
    await payload.delete({ collection: 'media', where: { id: { in: [mediaId, ownCoverId].filter(Boolean) } } })
    await payload.delete({ collection: 'users', where: { id: { equals: userId } } })
    await payload.db.destroy?.()
  })

  it('uses the venue photo when the game has no cover of its own', async () => {
    const game = await getGameDetail(gameWithVenuePhoto, null)

    expect(game).not.toBeNull()
    // Not the sport's default picture, which is what every game fell back to before.
    expect(game!.coverImageUrl).not.toBe('/images/game-football-1-7880cc.png')
    expect(game!.coverImageUrl).toContain(`venue-${suffix}`)
    // The venue photo is served through the same generated renditions as a game's own cover.
    expect(game!.coverImage.thumbnailUrl).toContain('.webp')
    expect(game!.coverImage.fallbackUrl).toBe('/images/game-football-1-7880cc.png')
  })

  it("prefers the game's own cover over the venue photo", async () => {
    const game = await getGameDetail(gameWithOwnCover, null)

    expect(game!.coverImageUrl).toContain(`own-${suffix}`)
    expect(game!.coverImageUrl).not.toContain(`venue-${suffix}`)
  })
})
