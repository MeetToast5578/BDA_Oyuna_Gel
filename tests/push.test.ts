import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import webpush from 'web-push'

import { DELETE as unsubscribe, POST as subscribe } from '@/app/api/v1/me/push/route'
import { listNotifications } from '@/lib/notifications'
import { sendPush } from '@/lib/push'
import { sendReminders } from '@/lib/reminders'

type Who = 'a' | 'b'

/** Phone notifications: saving devices, sending to them, dropping dead ones, and the 2-hour reminder. */
describe.skipIf(!process.env.DATABASE_URL)('push and reminders (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const ids: Record<Who, number> = { a: 0, b: 0 }
  const tokens: Record<Who, string> = { a: '', b: '' }
  const gameIds: number[] = []
  const endpoint = (name: string) => `https://push.example.test/${suffix}/${name}`
  const device = (name: string) => ({ endpoint: endpoint(name), keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: 'tBHItJI5svbpez7KI4CCXg' } })
  const call = async (handler: typeof subscribe, as: Who | null, body: unknown) =>
    (await handler(
      new Request('http://localhost/api/v1/me/push', {
        method: 'POST',
        headers: { ...(as ? { Cookie: `payload-token=${tokens[as]}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )) as Response
  const owners = async (name: string) =>
    (await payload.find({ collection: 'push-subscriptions', where: { endpoint: { equals: endpoint(name) } }, depth: 0, overrideAccess: true })).docs.map((doc) => doc.user)

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    for (const who of ['a', 'b'] as const) {
      const email = `push-${suffix}-${who}@oyunagel.test`
      ids[who] = (await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'push-test-password', fullName: `Push ${who}` } })).id
      tokens[who] = (await payload.login({ collection: 'users', data: { email, password: 'push-test-password' } })).token ?? ''
    }
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Push Arena ${suffix}`, location: 'Bakı', city: 'baku' } })).id
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    if (!payload) return
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    if (gameIds.length) await db.execute(sql`DELETE FROM games WHERE id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(ids) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('saves a device for the signed-in person, moves it if it changes hands, and only its owner removes it', async () => {
    expect((await call(subscribe, null, device('one'))).status).toBe(401)
    expect((await call(subscribe, 'a', { endpoint: 'http://insecure.test/x', keys: device('one').keys })).status).toBe(400)
    expect((await call(subscribe, 'a', { endpoint: endpoint('one') })).status).toBe(400)

    expect((await call(subscribe, 'a', device('one'))).status).toBe(200)
    expect(await owners('one')).toEqual([ids.a])
    expect((await call(subscribe, 'b', device('one'))).status).toBe(200)
    expect(await owners('one')).toEqual([ids.b])

    expect((await call(unsubscribe, 'a', { endpoint: endpoint('one') })).status).toBe(200)
    expect(await owners('one')).toEqual([ids.b])
    expect((await call(unsubscribe, 'b', { endpoint: endpoint('one') })).status).toBe(200)
    expect(await owners('one')).toEqual([])
  })

  it('sends nothing until the keys are set, then drops devices the push service says are gone', async () => {
    await call(subscribe, 'a', device('alive'))
    await call(subscribe, 'a', device('gone'))
    const send = vi.spyOn(webpush, 'sendNotification').mockImplementation(async (subscription) => {
      if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      return { statusCode: 201, body: '', headers: {} }
    })
    const message = { title: 'Test', body: 'Body', url: '/notifications' }

    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    expect(await sendPush(payload, [ids.a], message)).toBe(0)
    expect(send).not.toHaveBeenCalled()

    const keys = webpush.generateVAPIDKeys()
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', keys.publicKey)
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey)
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@oyunagel.test')
    expect(await sendPush(payload, [ids.a], message)).toBe(1)
    expect(send).toHaveBeenCalledTimes(2)
    expect(await owners('alive')).toEqual([ids.a])
    expect(await owners('gone')).toEqual([])
  })

  it('reminds the players of a game starting within two hours, once', async () => {
    const game = async (hoursFromNow: number, status: 'scheduled' | 'cancelled' = 'scheduled') => {
      const id = (
        await payload.create({
          collection: 'games',
          overrideAccess: true,
          data: {
            title: `Push ${hoursFromNow} ${suffix}`, sport: 'football', level: 'medium', arena: arenaId, host: ids.a,
            scheduledAt: new Date(Date.now() + hoursFromNow * 3_600_000).toISOString(), maxPlayers: 10, availablePlayers: 8, status,
          },
        })
      ).id
      gameIds.push(id)
      for (const user of [ids.a, ids.b]) await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: id, user, side: 'home' } })
      return id
    }
    const soon = await game(1)
    const later = await game(3)
    const cancelled = await game(1, 'cancelled')

    expect(await sendReminders(payload)).toBeGreaterThanOrEqual(1)
    const reminders = async (user: number) => (await listNotifications(payload, user)).filter((notice) => notice.kind === 'reminder').map((notice) => notice.gameId)
    expect(await reminders(ids.b)).toEqual([String(soon)])
    expect(await reminders(ids.a)).toEqual([String(soon)])

    // A second run in the same window sends nothing again.
    await sendReminders(payload)
    expect(await reminders(ids.b)).toEqual([String(soon)])
    // Neither the game three hours out nor the cancelled one was claimed.
    const claimed = await (payload.db as unknown as PostgresAdapter).drizzle.execute<{ id: number }>(
      sql`SELECT id FROM games WHERE id IN (${later}, ${cancelled}) AND reminded_at IS NOT NULL`,
    )
    expect(claimed.rows).toEqual([])
  })
})
