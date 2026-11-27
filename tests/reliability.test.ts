import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: (task: () => unknown) => void task() }))

import { POST as leaveRoute } from '@/app/api/v1/games/[id]/leave/route'
import { DELETE as removeRoute } from '@/app/api/v1/games/[id]/players/[userId]/route'
import { markAttendance, reliability, reliabilityPercent } from '@/lib/attendance'
import { getGamePlayers } from '@/lib/game-queries'
import { sendAttendanceReminders } from '@/lib/reminders'

const HOUR_MS = 3_600_000

describe('reliabilityPercent', () => {
  it('counts a late cancellation as half a missed game', () => {
    expect(reliabilityPercent({ marked: 4, came: 4, late: 0 })).toBe(100)
    expect(reliabilityPercent({ marked: 4, came: 3, late: 0 })).toBe(75)
    expect(reliabilityPercent({ marked: 2, came: 2, late: 1 })).toBe(80)
    expect(reliabilityPercent({ marked: 0, came: 0, late: 3 })).toBe(0)
    expect(reliabilityPercent({ marked: 0, came: 0, late: 0 })).toBe(0)
  })
})

type Who = 'host' | 'p1' | 'p2'

/** Late cancellations, the player list's reliability and the "mark who came" reminder. */
describe.skipIf(!process.env.DATABASE_URL)('reliability (Postgres)', () => {
  const suffix = Date.now()
  let payload: Payload
  let arenaId: number
  const ids: Record<Who, number> = { host: 0, p1: 0, p2: 0 }
  const tokens: Record<Who, string> = { host: '', p1: '', p2: '' }
  const gameIds: number[] = []
  const db = () => (payload.db as unknown as PostgresAdapter).drizzle

  const makeGame = async (offsetMs: number, status: 'scheduled' | 'cancelled' = 'scheduled', players: Who[] = ['host', 'p1', 'p2']) => {
    const id = (
      await payload.create({
        collection: 'games',
        overrideAccess: true,
        data: {
          title: `Reliable ${suffix}`, sport: 'football', level: 'medium', arena: arenaId, host: ids.host,
          scheduledAt: new Date(Date.now() + offsetMs).toISOString(), maxPlayers: 10, availablePlayers: 10 - players.length, status,
        },
      })
    ).id
    gameIds.push(id)
    for (const who of players) {
      await payload.create({ collection: 'game-participants', overrideAccess: true, data: { game: id, user: ids[who], side: 'home' } })
    }
    return id
  }
  const late = async (who: Who) =>
    Number((await db().execute<{ late: string }>(sql`SELECT late_cancellations AS late FROM users WHERE id = ${ids[who]}`)).rows[0].late)
  const leave = (gameId: number, as: Who) =>
    leaveRoute(
      new Request(`http://localhost/api/v1/games/${gameId}/leave`, { method: 'POST', headers: { Cookie: `payload-token=${tokens[as]}` } }),
      { params: Promise.resolve({ id: String(gameId) }) },
    ) as Promise<Response>
  const markReminders = async (hostId: number) =>
    (await payload.find({ collection: 'notifications', where: { and: [{ user: { equals: hostId } }, { kind: { equals: 'markAttendance' } }] }, overrideAccess: true, depth: 0 })).docs

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    payload = await getPayload({ config: (await import('@/payload.config')).default })
    for (const who of Object.keys(ids) as Who[]) {
      const email = `reliable-${suffix}-${who}@oyunagel.test`
      ids[who] = (await payload.create({ collection: 'users', overrideAccess: true, data: { email, password: 'reliable-test-password', fullName: `Reliable ${who}` } })).id
      tokens[who] = (await payload.login({ collection: 'users', data: { email, password: 'reliable-test-password' } })).token ?? ''
    }
    arenaId = (await payload.create({ collection: 'arenas', overrideAccess: true, data: { name: `Reliable Arena ${suffix}`, location: 'Bakı', city: 'baku' } })).id
  })

  afterAll(async () => {
    if (!payload) return
    await db().execute(sql`DELETE FROM notifications WHERE user_id IN (${sql.join(Object.values(ids).map((id) => sql`${id}`), sql`, `)})`)
    await db().execute(sql`DELETE FROM games WHERE id IN (${sql.join(gameIds.map((id) => sql`${id}`), sql`, `)})`)
    await payload.delete({ collection: 'arenas', where: { id: { equals: arenaId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', where: { id: { in: Object.values(ids) } }, overrideAccess: true })
    await payload.db.destroy?.()
  })

  it('counts leaving within three hours of kick-off as a late cancellation, and only that', async () => {
    expect((await leave(await makeGame(2 * 24 * HOUR_MS), 'p1')).status).toBe(200)
    expect(await late('p1')).toBe(0)

    expect((await leave(await makeGame(2 * HOUR_MS), 'p1')).status).toBe(200)
    expect(await late('p1')).toBe(1)

    // The host taking someone out is not the player's choice, so it never counts.
    const soon = await makeGame(HOUR_MS)
    const removed = (await removeRoute(
      new Request(`http://localhost/api/v1/games/${soon}/players/${ids.p2}`, { method: 'DELETE', headers: { Cookie: `payload-token=${tokens.host}` } }),
      { params: Promise.resolve({ id: String(soon), userId: String(ids.p2) }) },
    )) as Response
    expect(removed.status).toBe(200)
    expect(await late('p2')).toBe(0)
  })

  it('shows reliability beside each player once it adds up to three', async () => {
    // p1: one late cancellation from the test above, plus two marked games.
    for (const offset of [-3 * 24 * HOUR_MS, -4 * 24 * HOUR_MS]) {
      await markAttendance(payload, await makeGame(offset), ids.p1, 'came')
    }
    expect(await reliability(payload, ids.p1)).toEqual({ marked: 2, came: 2, late: 1 })

    const list = await getGamePlayers(await makeGame(24 * HOUR_MS), ids.host)
    const byId = new Map(list!.players.map((player) => [player.id, player.reliability]))
    expect(byId.get(String(ids.p1))).toEqual({ marked: 2, came: 2, late: 1, percent: 80 })
    expect(byId.get(String(ids.p2))).toBeNull()
  })

  it('asks the host once to mark who came, after the game and only for real played games', async () => {
    const ended = await makeGame(-3 * HOUR_MS)
    const tooSoon = await makeGame(-HOUR_MS)
    const cancelled = await makeGame(-3 * HOUR_MS, 'cancelled')
    const tooOld = await makeGame(-8 * 24 * HOUR_MS)
    const alone = await makeGame(-3 * HOUR_MS, 'scheduled', ['host'])
    const before = (await markReminders(ids.host)).length

    await sendAttendanceReminders(payload)
    const reminded = await db().execute<{ id: number }>(sql`
      SELECT id FROM games WHERE attendance_reminded_at IS NOT NULL AND id IN (${sql.join([ended, tooSoon, cancelled, tooOld, alone].map((id) => sql`${id}`), sql`, `)})`)
    expect(reminded.rows.map((row) => Number(row.id))).toContain(ended)
    for (const skipped of [tooSoon, cancelled, tooOld, alone]) expect(reminded.rows.map((row) => Number(row.id))).not.toContain(skipped)

    const notices = await markReminders(ids.host)
    expect(notices.length).toBeGreaterThan(before)
    // A second run finds the game already claimed: no new notice for it.
    await sendAttendanceReminders(payload)
    expect(await markReminders(ids.host)).toHaveLength(notices.length)
    // Players are never asked.
    expect(await markReminders(ids.p1)).toHaveLength(0)
  })
})
