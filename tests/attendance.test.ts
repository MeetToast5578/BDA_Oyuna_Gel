import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { PATCH as attendanceRoute } from '@/app/api/v1/games/[id]/attendance/route'
import { markAttendance, reliability } from '@/lib/attendance'
import { listNotifications } from '@/lib/notifications'

const DAY_MS = 24 * 3_600_000
type Who = 'host' | 'p1' | 'p2' | 'stranger'

/** "Gəldi / Gəlmədi": host only, from kick-off for a week, and the reliability it adds up to. */
describe.skipIf(!process.env.DATABASE_URL)('attendance (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const ids: Record<Who, number> = { host: 0, p1: 0, p2: 0, stranger: 0 }
  const tokens: Record<Who, string> = { host: '', p1: '', p2: '', stranger: '' }
  const gameIds: number[] = []

  const makeGame = async (offsetMs: number, status: 'scheduled' | 'cancelled' = 'scheduled') => {
    const id = (
      await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Attend ${suffix}`, sport: 'football', level: 'medium', arena: arenaId, host: ids.host,
          scheduledAt: new Date(Date.now() + offsetMs).toISOString(), maxPlayers: 10, availablePlayers: 7, status,
        },
      })
    ).id
    gameIds.push(id)
    for (const user of [ids.host, ids.p1, ids.p2]) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: id, user, side: 'home' } })
    }
    return id
  }

  const patch = async (gameId: number, as: Who, body: unknown): Promise<Response> =>
    (await attendanceRoute(
      new Request(`http://localhost/api/v1/games/${gameId}/attendance`, {
        method: 'PATCH',
        headers: { Cookie: `payload-token=${tokens[as]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(gameId) }) },
    )) as Response

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    for (const who of Object.keys(ids) as Who[]) {
      const email = `attend-${suffix}-${who}@oyunagel.test`
      ids[who] = (await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'attend-test-password', fullName: `Attend ${who}` } })).id
      tokens[who] = (await payload.login({ collection: 'users', data: { email, password: 'attend-test-password' } })).token ?? ''
    }
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Attend Arena ${suffix}`, location: 'Bakı', city: 'baku' } })).id
  })

  afterAll(async () => {
    if (!payload) return
    await (payload.db as unknown as PostgresAdapter).drizzle.execute(sql`DELETE FROM games WHERE id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(ids) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('lets only the host mark, answers with the list, and tells a player marked absent', async () => {
    const gameId = await makeGame(-2 * DAY_MS)
    expect((await patch(gameId, 'stranger', { userId: ids.p1, attendance: 'came' })).status).toBe(403)
    expect((await patch(gameId, 'host', { userId: ids.p1, attendance: 'maybe' })).status).toBe(400)

    const response = await patch(gameId, 'host', { userId: ids.p1, attendance: 'came' })
    expect(response.status).toBe(200)
    const list = await response.json()
    expect(list.canMarkAttendance).toBe(true)
    expect(list.players.find((player: { id: string }) => player.id === String(ids.p1)).attendance).toBe('came')

    expect((await patch(gameId, 'host', { userId: ids.p2, attendance: 'absent' })).status).toBe(200)
    // The notice is written after the response; give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(await listNotifications(payload, ids.p2)).toEqual([expect.objectContaining({ kind: 'markedAbsent', gameId: String(gameId) })])
    expect(await listNotifications(payload, ids.p1)).toEqual([])
  })

  it('is open from kick-off for a week, never for the host themselves or a stranger', async () => {
    const upcoming = await makeGame(3 * 3_600_000)
    const old = await makeGame(-8 * DAY_MS)
    const cancelled = await makeGame(-DAY_MS, 'cancelled')
    const recent = await makeGame(-DAY_MS)
    expect(await markAttendance(payload, upcoming, ids.p1, 'came')).toEqual({ ok: false, code: 'ATTENDANCE_CLOSED' })
    expect(await markAttendance(payload, old, ids.p1, 'came')).toEqual({ ok: false, code: 'ATTENDANCE_CLOSED' })
    expect(await markAttendance(payload, cancelled, ids.p1, 'came')).toEqual({ ok: false, code: 'ATTENDANCE_CLOSED' })
    expect(await markAttendance(payload, recent, ids.host, 'came')).toEqual({ ok: false, code: 'NOT_A_PLAYER' })
    expect(await markAttendance(payload, recent, ids.stranger, 'came')).toEqual({ ok: false, code: 'NOT_A_PLAYER' })
    expect(await markAttendance(payload, 2_147_000_000, ids.p1, 'came')).toEqual({ ok: false, code: 'GAME_NOT_FOUND' })
  })

  it('adds up to reliability once three games are marked', async () => {
    // p1: came in the first test's game. One more mark is still under three.
    const second = await makeGame(-3 * DAY_MS)
    await markAttendance(payload, second, ids.p1, 'absent')
    expect(await reliability(payload, ids.p1)).toBeNull()

    const third = await makeGame(-4 * DAY_MS)
    await markAttendance(payload, third, ids.p1, 'came')
    expect(await reliability(payload, ids.p1)).toEqual({ marked: 3, came: 2 })

    // Clearing a mark takes it back out.
    await markAttendance(payload, third, ids.p1, null)
    expect(await reliability(payload, ids.p1)).toBeNull()
  })
})
