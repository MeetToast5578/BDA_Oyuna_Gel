import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

import { startOfBakuDay } from '@/lib/game-backend'

export const DEMO_HOST_EMAIL = 'demo-refresh@demo.oyunagel.test'
const SPORTS = [
  { sport: 'football', label: 'Futbol', maxPlayers: 10 },
  { sport: 'basketball', label: 'Basketbol', maxPlayers: 10 },
  { sport: 'tennis', label: 'Tennis', maxPlayers: 2 },
] as const

/** Tomorrow through seven days ahead, always 19:00 in Baku. Never changes historical dates. */
export function planDemoGames(now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => SPORTS.map((sport) => {
    const date = new Date(startOfBakuDay(now, index + 1).getTime() + 19 * 60 * 60 * 1000)
    return { ...sport, date, key: `demo-refresh:v1:${sport.sport}:${date.toISOString()}`, title: `Nümunə oyun · ${sport.label}` }
  })).flat()
}

/** Add-only: the default is an aggregate preview with no resource or game writes. */
export async function refreshDemoGames(payload: Payload, { apply = false, now = new Date() } = {}) {
  const plan = planDemoGames(now)
  const client = await payload.db.pool.connect()
  let locked = false
  try {
    if (apply) {
      // Serialise refreshes across machines, including host/venue creation. The unique index is a
      // second guard against duplicate games. Always release this session lock before pooling it.
      await client.query('SELECT pg_advisory_lock(19755115, 1)')
      locked = true
    }
    const { rows } = await client.query<{ demo_key: string }>('SELECT demo_key FROM games WHERE demo_key = ANY($1::varchar[])', [plan.map((game) => game.key)])
    const existing = new Set(rows.map((row) => row.demo_key))
    const pending = plan.filter((game) => !existing.has(game.key))
    if (!apply || pending.length === 0) return { applied: apply, planned: plan.length, existing: existing.size, created: 0, wouldCreate: pending.length }

    let host = (await payload.find({ collection: 'users', where: { email: { equals: DEMO_HOST_EMAIL } }, limit: 1, overrideAccess: true })).docs[0]
    if (host && (host.googleId || host.role === 'admin' || host.fullName !== 'OyunaGəl · Nümunə')) throw new Error('Reserved demo host is not a recognised demo account; refusing to reuse it.')
    if (!host) host = await payload.create({ collection: 'users', overrideAccess: true, data: {
      email: DEMO_HOST_EMAIL, password: randomBytes(32).toString('base64url'), fullName: 'OyunaGəl · Nümunə', role: 'user', emailNotifications: false,
    } })
    const venues = new Map<string, number>()
    for (const sport of SPORTS) {
      const name = `Nümunə meydança · ${sport.label}`
      let venue = (await payload.find({ collection: 'arenas', where: { name: { equals: name } }, limit: 1, overrideAccess: true })).docs[0]
      if (!venue) venue = await payload.create({ collection: 'arenas', overrideAccess: true, data: {
        name, location: 'Nümunə məkan — real rezervasiya yoxdur', city: 'baku', sportTypes: [sport.sport],
        description: 'Yalnız saytın nümayişi üçündür. Real meydança və rezervasiya deyil.',
      } })
      venues.set(sport.sport, venue.id)
    }
    let created = 0
    await client.query('BEGIN')
    try {
      for (const game of pending) {
        const result = await client.query(`INSERT INTO games
          (title, sport, level, arena_id, host_id, scheduled_at, max_players, available_players, status, is_demo, demo_key, created_at, updated_at)
          VALUES ($1, $2, 'beginner', $3, $4, $5, $6, $7, 'scheduled', true, $8, now(), now())
          ON CONFLICT (demo_key) DO NOTHING RETURNING id`,
        [game.title, game.sport, venues.get(game.sport), host.id, game.date.toISOString(), game.maxPlayers, game.maxPlayers - 1, game.key])
        created += result.rowCount ?? 0
      }
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    return { applied: true, planned: plan.length, existing: existing.size, created, wouldCreate: 0 }
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(19755115, 1)') } finally { client.release() }
  }
}
