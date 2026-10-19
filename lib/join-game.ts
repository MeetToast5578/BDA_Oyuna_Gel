import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, Where } from 'payload'

import type { JoinOutcome } from '@/collections/JoinAttempts'
import { occupancy, pickSide, type GameSides, type Side, type SideChoice, type SidePlayer } from '@/lib/team-logic'

export type JoinErrorCode = 'GAME_NOT_FOUND' | 'GAME_NOT_JOINABLE' | 'GAME_FULL' | 'ALREADY_JOINED' | 'SIDE_FULL' | 'NOT_A_MEMBER'

export type JoinResult =
  | { ok: true; remainingSpots: number; maxCount: number; side: Side }
  | { ok: false; code: JoinErrorCode }

class JoinRejected extends Error {
  constructor(readonly code: JoinErrorCode) {
    super(code)
  }
}

/**
 * Claims one spot in a game for a user.
 *
 * The conditional UPDATE only decrements while a spot is left, and Postgres re-checks that
 * condition after waiting on the row lock, so two joins racing for the last spot can never both
 * succeed, however many app instances are running. The participant insert runs in the same
 * transaction, so a rejected join (including a duplicate) rolls the decrement back.
 *
 * The side is picked under the same row lock, so two joins can't both take a side's last spot.
 */
export async function claimSpot(
  payload: Payload,
  gameId: number,
  userId: number,
  phone: string | null = null,
  name: string | null = null,
  choice: SideChoice = 'random',
): Promise<JoinResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute<{ available_players: string; max_players: string }>(sql`
        UPDATE games
        SET available_players = available_players - 1, updated_at = now()
        WHERE id = ${gameId}
          AND status = 'scheduled'
          AND scheduled_at > now()
          AND available_players > 0
        RETURNING available_players, max_players
      `)
      const game = claimed.rows[0]
      if (!game) throw new JoinRejected(await rejectionReason(tx, gameId, userId))

      const sides = await readSides(tx, gameId)
      if (sides.players.some((player) => player.userId === userId)) throw new JoinRejected('ALREADY_JOINED')
      // The decrement above already counts the joiner, who isn't one of the guests.
      const counts = occupancy(sides.game.maxPlayers, sides.players.map((player) => player.side), sides.guests - 1, sides.hostSide)
      const picked = pickSide(sides.game, counts, choice, await clubsOf(tx, userId, sides.game))
      if (!picked.ok) throw new JoinRejected(picked.code)

      const inserted = await tx.execute(sql`
        INSERT INTO game_participants (game_id, user_id, phone, name, side, updated_at, created_at)
        VALUES (${gameId}, ${userId}, ${phone}, ${name}, ${picked.side}, now(), now())
        ON CONFLICT (game_id, user_id) DO NOTHING
        RETURNING id
      `)
      if (inserted.rows.length === 0) throw new JoinRejected('ALREADY_JOINED')

      return {
        ok: true as const,
        remainingSpots: Number(game.available_players),
        maxCount: Number(game.max_players),
        side: picked.side,
      }
    })
  } catch (error) {
    if (error instanceof JoinRejected) return { ok: false, code: error.code }
    throw error
  }
}

type Tx = Parameters<Parameters<PostgresAdapter['drizzle']['transaction']>[0]>[0]
export type Db = Tx | PostgresAdapter['drizzle']

/**
 * A game's sides as `checkSides` and `occupancy` see them: its clubs, the players' rows with the
 * clubs each belongs to, and the guests (spots taken without a row). Read it under the game's row lock.
 */
export async function readSides(db: Db, gameId: number) {
  const { rows } = await db.execute<{
    max_players: number
    available_players: number
    host_id: number | null
    home_team_id: number | null
    away_team_id: number | null
    players: SidePlayer[] | null
  }>(sql`
    SELECT g.max_players, g.available_players, g.host_id, g.home_team_id, g.away_team_id,
           (SELECT json_agg(json_build_object(
                     'userId', p.user_id,
                     'side', p.side,
                     'memberOf', ARRAY(SELECT r.parent_id FROM teams_rels r
                                       WHERE r.path = 'members' AND r.users_id = p.user_id
                                         AND r.parent_id IN (g.home_team_id, g.away_team_id))))
            FROM game_participants p WHERE p.game_id = g.id) AS players
    FROM games g
    WHERE g.id = ${gameId}
  `)
  const row = rows[0]
  const players = row?.players ?? []
  const game: GameSides = {
    maxPlayers: Number(row?.max_players ?? 0),
    homeTeamId: row?.home_team_id ?? null,
    awayTeamId: row?.away_team_id ?? null,
  }
  const hostId = row?.host_id ?? null
  return {
    game,
    players,
    hostId,
    hostSide: players.find((player) => player.userId === hostId)?.side ?? ('home' as Side),
    guests: game.maxPlayers - Number(row?.available_players ?? 0) - players.length,
  }
}

/** The game's clubs the user is a member of. */
export async function clubsOf(db: Db, userId: number, game: GameSides): Promise<number[]> {
  if (game.homeTeamId === null && game.awayTeamId === null) return []
  const { rows } = await db.execute<{ parent_id: number }>(sql`
    SELECT parent_id FROM teams_rels
    WHERE path = 'members' AND users_id = ${userId} AND parent_id IN (${game.homeTeamId}, ${game.awayTeamId})
  `)
  return rows.map((row) => row.parent_id)
}

/**
 * Gives the spots a game has free to the people waiting for it, oldest first: each takes a side the
 * way a "random" join would (`pickSide`), so a club's side stays for its members and neither side goes
 * over half. Someone who can't stand on any side with room is passed over and keeps their place.
 * Returns who got in. The caller holds the game's row lock, and the game must not have started
 * (every caller checks), so a spot changes hands without ever showing as free.
 */
export async function promoteWaiting(tx: Db, gameId: number): Promise<number[]> {
  const promoted: number[] = []
  for (;;) {
    const state = await tx.execute<{ available_players: number }>(sql`SELECT available_players FROM games WHERE id = ${gameId}`)
    if (!(Number(state.rows[0]?.available_players) > 0)) break
    const waiting = await tx.execute<{ id: number; user_id: number; name: string; phone: string }>(sql`
      SELECT id, user_id, name, phone FROM game_waitlist WHERE game_id = ${gameId} ORDER BY created_at, id
    `)
    if (waiting.rows.length === 0) break

    const sides = await readSides(tx, gameId)
    const counts = occupancy(sides.game.maxPlayers, sides.players.map((player) => player.side), sides.guests, sides.hostSide)
    let placed = false
    for (const person of waiting.rows) {
      const picked = pickSide(sides.game, counts, 'random', await clubsOf(tx, person.user_id, sides.game))
      if (!picked.ok) continue
      await tx.execute(sql`UPDATE games SET available_players = available_players - 1, updated_at = now() WHERE id = ${gameId}`)
      const inserted = await tx.execute(sql`
        INSERT INTO game_participants (game_id, user_id, phone, name, side, promoted_at, updated_at, created_at)
        VALUES (${gameId}, ${person.user_id}, ${person.phone}, ${person.name}, ${picked.side}, now(), now(), now())
        ON CONFLICT (game_id, user_id) DO NOTHING
        RETURNING id
      `)
      // Already playing (it can't happen through the endpoints): drop the stale row and give the spot back.
      if (inserted.rows.length === 0) {
        await tx.execute(sql`UPDATE games SET available_players = available_players + 1, updated_at = now() WHERE id = ${gameId}`)
      } else {
        promoted.push(person.user_id)
        await tx.execute(sql`UPDATE game_invites SET status = 'accepted', updated_at = now() WHERE game_id = ${gameId} AND user_id = ${person.user_id} AND status = 'pending'`)
      }
      await tx.execute(sql`DELETE FROM game_waitlist WHERE id = ${person.id}`)
      placed = true
      break
    }
    if (!placed) break
  }
  return promoted
}

async function rejectionReason(tx: Tx, gameId: number, userId: number): Promise<JoinErrorCode> {
  const { rows } = await tx.execute<{ status: string; upcoming: boolean; joined: boolean }>(sql`
    SELECT g.status,
           g.scheduled_at > now() AS upcoming,
           EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = g.id AND p.user_id = ${userId}) AS joined
    FROM games g
    WHERE g.id = ${gameId}
  `)
  const game = rows[0]
  if (!game) return 'GAME_NOT_FOUND'
  if (game.joined) return 'ALREADY_JOINED'
  if (game.status !== 'scheduled' || !game.upcoming) return 'GAME_NOT_JOINABLE'
  return 'GAME_FULL'
}

const RATE_LIMIT_PER_MINUTE = 10

/**
 * True once a user, or an IP, has made `RATE_LIMIT_PER_MINUTE` join or leave requests in the last
 * minute. Counts the audit log, so it holds across app instances with no extra store. Refused
 * requests are not logged, so a script that stops hammering is let back in a minute later.
 */
export async function tooManyRecentAttempts(payload: Payload, userId: number, ip: string | null) {
  const since = new Date(Date.now() - 60_000).toISOString()
  const count = async (who: Where) =>
    (
      await payload.count({
        collection: 'join-attempts',
        overrideAccess: true,
        where: { and: [{ createdAt: { greater_than: since } }, who] },
      })
    ).totalDocs
  const [byUser, byIp] = await Promise.all([count({ user: { equals: userId } }), ip ? count({ ip: { equals: ip } }) : 0])
  return byUser >= RATE_LIMIT_PER_MINUTE || byIp >= RATE_LIMIT_PER_MINUTE
}

/** Writes the audit-log entry for a join attempt. Never throws: a logging failure must not fail the join. */
export async function recordJoinAttempt(
  payload: Payload,
  entry: { outcome: JoinOutcome; gameId: number | null; userId: number | null; remainingSpots?: number; ip: string | null },
) {
  try {
    await payload.create({
      collection: 'join-attempts',
      overrideAccess: true,
      data: {
        outcome: entry.outcome,
        gameId: entry.gameId,
        user: entry.userId,
        remainingSpots: entry.remainingSpots,
        ip: entry.ip,
      },
    })
  } catch (error) {
    console.error('Failed to record join attempt', error)
  }
}

export type LeaveErrorCode = 'GAME_NOT_FOUND' | 'GAME_STARTED' | 'HOST_CANNOT_LEAVE' | 'NOT_JOINED'

export type LeaveResult =
  | { ok: true; remainingSpots: number; maxCount: number; /** People from the waitlist who took the spot, to be told. */ promoted: number[] }
  | { ok: false; code: LeaveErrorCode }

class LeaveRejected extends Error {
  constructor(readonly code: LeaveErrorCode) {
    super(code)
  }
}

/**
 * Gives a user's spot in a game back.
 *
 * The participant row is deleted first and the spot only returned when that DELETE actually removed
 * something. Without that check a client could call this repeatedly and push `available_players`
 * past `max_players`, inventing spots in a full game; `FOR UPDATE` on the game serialises two
 * concurrent leaves so only one of them can find the row. `LEAST` is a second belt: even a stray
 * row can never take availability above the game's size.
 */
export async function releaseSpot(payload: Payload, gameId: number, userId: number): Promise<LeaveResult> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle

  try {
    return await db.transaction(async (tx) => {
      const locked = await tx.execute<{ host_id: number | null; upcoming: boolean; status: string }>(sql`
        SELECT host_id, status, scheduled_at > now() AS upcoming
        FROM games
        WHERE id = ${gameId}
        FOR UPDATE
      `)
      const game = locked.rows[0]
      if (!game) throw new LeaveRejected('GAME_NOT_FOUND')
      // The host's spot is the game itself: they delete it rather than leaving it.
      if (Number(game.host_id) === userId) throw new LeaveRejected('HOST_CANNOT_LEAVE')
      if (game.status !== 'scheduled' || !game.upcoming) throw new LeaveRejected('GAME_STARTED')

      const removed = await tx.execute(sql`
        DELETE FROM game_participants
        WHERE game_id = ${gameId} AND user_id = ${userId}
        RETURNING id
      `)
      if (removed.rows.length === 0) throw new LeaveRejected('NOT_JOINED')

      const freed = await tx.execute<{ available_players: string; max_players: string }>(sql`
        UPDATE games
        SET available_players = LEAST(available_players + 1, max_players), updated_at = now()
        WHERE id = ${gameId}
        RETURNING available_players, max_players
      `)
      // The spot goes straight to the first person waiting who can take it, so it is never up for grabs.
      const promoted = await promoteWaiting(tx, gameId)
      const row = promoted.length > 0
        ? (await tx.execute<{ available_players: string; max_players: string }>(sql`SELECT available_players, max_players FROM games WHERE id = ${gameId}`)).rows[0]
        : freed.rows[0]
      return { ok: true as const, remainingSpots: Number(row.available_players), maxCount: Number(row.max_players), promoted }
    })
  } catch (error) {
    if (error instanceof LeaveRejected) return { ok: false, code: error.code }
    throw error
  }
}
