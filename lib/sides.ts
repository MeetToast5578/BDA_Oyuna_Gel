import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { readSides, type Db } from '@/lib/join-game'
import {
  applyAssignments,
  autoBalance,
  AUTO_CONFIRM_HOURS,
  balanceRating,
  checkSides,
  eligibleSides,
  summarize,
  type BalancePlayer,
  type PlayedGame,
  type Side,
  type SidePlayer,
} from '@/lib/team-logic'

export type SidesErrorCode = 'GAME_NOT_FOUND' | 'GAME_STARTED' | 'NOT_IN_GAME' | 'NOT_A_MEMBER' | 'SIDE_FULL'
export type SidesRequest = { balance: true } | { balance: false; assignments: { userId: number; side: Side }[] }
export type SidesResult = { ok: true } | { ok: false; code: SidesErrorCode }

class SidesRejected extends Error {
  constructor(readonly code: SidesErrorCode) {
    super(code)
  }
}

/**
 * Each player's confirmed games, as the side they stood on and the score. The SQL twin of
 * `resultCounts`: a cancelled game never counts, and a score counts once confirmed or once it has
 * gone `AUTO_CONFIRM_HOURS` undisputed. Players with no games are absent from the map.
 */
export async function playerRecords(db: Db, userIds: number[]): Promise<Map<number, PlayedGame[]>> {
  const records = new Map<number, PlayedGame[]>()
  if (userIds.length === 0) return records

  const { rows } = await db.execute<{
    user_id: number
    side: Side
    home_score: number
    away_score: number
    scheduled_at: Date | string
  }>(sql`
    SELECT p.user_id, p.side, g.home_score, g.away_score, g.scheduled_at
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
    WHERE p.user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
      AND g.status <> 'cancelled'
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND (g.result_status = 'confirmed'
           OR (g.result_status = 'reported' AND g.result_reported_at <= now() - make_interval(hours => ${AUTO_CONFIRM_HOURS})))
  `)
  for (const row of rows) {
    const games = records.get(row.user_id) ?? []
    games.push({
      side: row.side,
      homeScore: Number(row.home_score),
      awayScore: Number(row.away_score),
      scheduledAt: new Date(row.scheduled_at).toISOString(),
    })
    records.set(row.user_id, games)
  }
  return records
}

/**
 * "Balansla": new sides for everyone, as even in size as possible and then in strength. The host
 * stays where they are and the guests stay with them, because the guests' side is the host's.
 */
async function balanced(tx: Db, current: Awaited<ReturnType<typeof readSides>>): Promise<SidePlayer[]> {
  const { game, players, hostId, hostSide, guests } = current
  const records = await playerRecords(tx, players.map((player) => player.userId))
  const rating = (userId: number) => balanceRating(summarize(records.get(userId) ?? []))

  const toBalance: BalancePlayer[] = players.map((player) => ({
    userId: player.userId,
    rating: rating(player.userId),
    eligible: player.userId === hostId ? [hostSide] : eligibleSides(game, player.memberOf),
  }))
  // Guests have no account: negative ids stand in for them so they count toward the host's side.
  for (let n = 1; n <= guests; n++) toBalance.push({ userId: -n, rating: balanceRating(summarize([])), eligible: [hostSide] })

  const assigned = autoBalance(toBalance, game.maxPlayers)
  return players.map((player) => ({ ...player, side: assigned.get(player.userId) ?? player.side }))
}

/**
 * The host's move of players between sides, or "Balansla". Runs under the game's row lock and ends
 * in `checkSides`, so a join racing it waits, and any result that breaks a side's size or a club's
 * membership rolls back with nothing written. Only a game that hasn't started can change sides.
 */
export async function reassignSides(payload: Payload, gameId: number, request: SidesRequest): Promise<SidesResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  try {
    return await db.transaction(async (tx) => {
      const locked = await tx.execute<{ status: string; upcoming: boolean }>(sql`
        SELECT status, scheduled_at > now() AS upcoming FROM games WHERE id = ${gameId} FOR UPDATE
      `)
      const row = locked.rows[0]
      if (!row) throw new SidesRejected('GAME_NOT_FOUND')
      if (row.status !== 'scheduled' || !row.upcoming) throw new SidesRejected('GAME_STARTED')

      const current = await readSides(tx, gameId)
      let next: SidePlayer[]
      if (request.balance) {
        next = await balanced(tx, current)
      } else {
        const applied = applyAssignments(current.players, request.assignments)
        if (!applied.ok) throw new SidesRejected(applied.code)
        next = applied.players
      }

      const checked = checkSides(current.game, next, current.guests, current.hostId)
      if (!checked.ok) throw new SidesRejected(checked.code)

      const before = new Map(current.players.map((player) => [player.userId, player.side]))
      for (const player of next) {
        if (before.get(player.userId) === player.side) continue
        await tx.execute(sql`
          UPDATE game_participants SET side = ${player.side}, updated_at = now()
          WHERE game_id = ${gameId} AND user_id = ${player.userId}
        `)
      }
      return { ok: true as const }
    })
  } catch (error) {
    if (error instanceof SidesRejected) return { ok: false, code: error.code }
    throw error
  }
}
