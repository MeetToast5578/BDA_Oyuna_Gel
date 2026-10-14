import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { notify, participantIds } from '@/lib/notify'

const EMAIL = { subject: 'Test', html: '<p>Test</p>', text: 'Test' }

/** Who gets an email, against the real database, with the mail server replaced by a spy. */
describe.skipIf(!process.env.DATABASE_URL)('notify (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  const ids: Record<'on' | 'off' | 'host', number> = { on: 0, off: 0, host: 0 }
  let arenaId: number
  let gameId: number

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config })
    for (const key of ['on', 'off', 'host'] as const) {
      ids[key] = (
        await payload.create({
          collection: 'users',
          overrideAccess: true,
          data: {
            email: `notify-${suffix}-${key}@oyunagel.test`,
            password: 'notify-test-password',
            fullName: `Notify ${key}`,
            emailNotifications: key !== 'off',
          },
        })
      ).id
    }
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Notify Arena ${suffix}`, location: 'Bakı' } })).id
    gameId = (
      await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Notify Game ${suffix}`,
          sport: 'football',
          level: 'medium',
          arena: arenaId,
          host: ids.host,
          scheduledAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
          maxPlayers: 10,
          availablePlayers: 7,
          status: 'scheduled',
        },
      })
    ).id
    for (const user of [ids.host, ids.on, ids.off]) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: gameId, user } })
    }
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'game-participants', where: { game: { equals: gameId } }, overrideAccess: true })
    await payload.delete({ collection: 'games', where: { id: { equals: gameId } }, overrideAccess: true })
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(ids) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('lists the players except the one who made the change', async () => {
    expect((await participantIds(payload, gameId, ids.host)).sort()).toEqual([ids.on, ids.off].sort())
  })

  it('emails only those who left emails on', async () => {
    const send = vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined)
    expect(await notify(payload, [ids.on, ids.off], EMAIL)).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ to: `notify-${suffix}-on@oyunagel.test`, ...EMAIL })
    send.mockRestore()
  })

  it('never throws when the mail server fails', async () => {
    const send = vi.spyOn(payload, 'sendEmail').mockRejectedValue(new Error('SMTP down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notify(payload, [ids.on], EMAIL)).resolves.toBe(0)
    expect(log).toHaveBeenCalled()
    send.mockRestore()
    log.mockRestore()
  })
})
