import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { foldForSearch, formatBakuShortDate, formatBakuTime, SPORT_META, toPlayer } from '@/lib/game-backend'
import { readSides, type Db } from '@/lib/join-game'
import { eligibleSides, occupancy, sideCapacity, type GameSides, type InviteEntry, type Side } from '@/lib/team-logic'

// Phase 10 of docs/game-setup-teams-and-players-plan.md. An invite names a player and a side; it
// holds no spot. The player answers by joining (the join route marks it accepted) or by declining.

export type InviteErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_STARTED'
  | 'USER_NOT_FOUND'
  | 'ALREADY_IN_GAME'
  | 'ALREADY_INVITED'
  | 'INVITE_NOT_A_MEMBER'
  | 'TOO_MANY_INVITES'
  | 'RATE_LIMITED'
  | 'NO_CLUB'
export type InviteFailure = { ok: false; code: InviteErrorCode; userId?: number }

/** What each refusal means to a caller, and how it answers over HTTP. */
export const INVITE_ERRORS: Record<InviteErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_STARTED: { status: 409, message: 'Oyun başlayıb — dəvət göndərmək mümkün deyil.' },
  USER_NOT_FOUND: { status: 404, message: 'Oyunçu tapılmadı.' },
  ALREADY_IN_GAME: { status: 409, message: 'Bu oyunçu artıq oyundadır.' },
  ALREADY_INVITED: { status: 409, message: 'Bu oyunçu artıq dəvət olunub.' },
  INVITE_NOT_A_MEMBER: { status: 409, message: 'Bu oyunçu həmin tərəfin komandasının üzvü deyil.' },
  TOO_MANY_INVITES: { status: 409, message: 'Cavab gözləyən dəvətlər oyunun yer sayını keçə bilməz.' },
  RATE_LIMITED: { status: 429, message: 'Çox dəvət göndərdiniz. Bir az sonra yenidən yoxlayın.' },
  NO_CLUB: { status: 409, message: 'Bu tərəfdə komanda yoxdur.' },
}

/** One host can send this many invites an hour, across all their games. */
export const HOURLY_INVITE_LIMIT = 60
/** A page of the player list, and the most one request may ask for. */
export const USER_PAGE_SIZE = 20
export const USER_PAGE_MAX = 50
export type UserFilter = 'all' | 'clubs' | 'recent'
export const USER_FILTERS: UserFilter[] = ['all', 'clubs', 'recent']

const drizzle = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle
const idList = (ids: number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `)

/**
 * Checks a batch of invites against the game and then writes them, in the caller's transaction. The
 * caller holds the game's row lock (or has just created the game), so the counts read here can't move.
 * Every entry is checked before anything is written, so a refusal changes nothing. Returns why it
 * refused, or null.
 *
 * A player who accepted and then left can be invited again; one who is pending or declined can't
 * (declining is final for that game, so a host can't keep asking).
 */
export async function addInvites(db: Db, gameId: number, game: GameSides, hostId: number, entries: InviteEntry[]): Promise<InviteFailure | null> {
  if (entries.length === 0) return null
  const ids = entries.map((entry) => entry.userId)
  const fail = (code: InviteErrorCode, userId?: number): InviteFailure => ({ ok: false, code, userId })

  const { rows: counted } = await db.execute<{ recent: string; pending: string }>(sql`
    SELECT (SELECT count(*) FROM game_invites WHERE invited_by_id = ${hostId} AND created_at > now() - interval '1 hour') AS recent,
           (SELECT count(*) FROM game_invites WHERE game_id = ${gameId} AND status = 'pending') AS pending
  `)
  if (Number(counted[0].recent) + entries.length > HOURLY_INVITE_LIMIT) return fail('RATE_LIMITED')
  if (Number(counted[0].pending) + entries.length > game.maxPlayers) return fail('TOO_MANY_INVITES')

  // One after another: a transaction has a single connection.
  const users = await db.execute<{ id: number }>(sql`SELECT id FROM users WHERE id IN (${idList(ids)})`)
  const inGame = await db.execute<{ user_id: number }>(sql`SELECT user_id FROM game_participants WHERE game_id = ${gameId} AND user_id IN (${idList(ids)})`)
  const existing = await db.execute<{ user_id: number; status: string }>(sql`SELECT user_id, status FROM game_invites WHERE game_id = ${gameId} AND user_id IN (${idList(ids)})`)
  const memberships = await db.execute<{ users_id: number; parent_id: number }>(sql`
    SELECT users_id, parent_id FROM teams_rels
    WHERE path = 'members' AND users_id IN (${idList(ids)}) AND parent_id IN (${game.homeTeamId}, ${game.awayTeamId})
  `)
  const known = new Set(users.rows.map((row) => row.id))
  const joined = new Set(inGame.rows.map((row) => row.user_id))
  const status = new Map(existing.rows.map((row) => [row.user_id, row.status]))

  for (const { userId, side } of entries) {
    if (!known.has(userId)) return fail('USER_NOT_FOUND', userId)
    if (joined.has(userId) || userId === hostId) return fail('ALREADY_IN_GAME', userId)
    if (status.has(userId) && status.get(userId) !== 'accepted') return fail('ALREADY_INVITED', userId)
    const memberOf = memberships.rows.filter((row) => row.users_id === userId).map((row) => row.parent_id)
    if (!eligibleSides(game, memberOf).includes(side)) return fail('INVITE_NOT_A_MEMBER', userId)
  }

  for (const { userId, side } of entries) {
    await db.execute(sql`
      INSERT INTO game_invites (game_id, user_id, invited_by_id, side, status, updated_at, created_at)
      VALUES (${gameId}, ${userId}, ${hostId}, ${side}, 'pending', now(), now())
      ON CONFLICT (game_id, user_id)
      DO UPDATE SET status = 'pending', side = ${side}, invited_by_id = ${hostId}, updated_at = now(), created_at = now()
    `)
  }
  return null
}

export type InviteRequest = { club: false; entries: InviteEntry[] } | { club: true; side: Side }
export type InviteResult = { ok: true; invited: number[] } | InviteFailure

/**
 * The host invites one player, or everyone in a side's club who isn't in the game or invited yet
 * (as many as that side has free spots). Runs under the game's row lock, before kick-off.
 */
export async function inviteToGame(payload: Payload, gameId: number, hostId: number, request: InviteRequest): Promise<InviteResult> {
  return drizzle(payload).transaction(async (tx): Promise<InviteResult> => {
    const locked = await tx.execute<{ status: string; upcoming: boolean }>(sql`
      SELECT status, scheduled_at > now() AS upcoming FROM games WHERE id = ${gameId} FOR UPDATE
    `)
    const row = locked.rows[0]
    if (!row) return { ok: false, code: 'GAME_NOT_FOUND' }
    if (row.status !== 'scheduled' || !row.upcoming) return { ok: false, code: 'GAME_STARTED' }

    const sides = await readSides(tx, gameId)
    let entries: InviteEntry[]
    if (!request.club) {
      entries = request.entries
    } else {
      const clubId = request.side === 'home' ? sides.game.homeTeamId : sides.game.awayTeamId
      if (clubId === null) return { ok: false, code: 'NO_CLUB' }
      const taken = occupancy(sides.game.maxPlayers, sides.players.map((player) => player.side), sides.guests, sides.hostSide)
      const free = Math.max(sideCapacity(sides.game.maxPlayers) - taken[request.side], 0)
      const { rows } = await tx.execute<{ users_id: number }>(sql`
        SELECT r.users_id FROM teams_rels r
        WHERE r.parent_id = ${clubId} AND r.path = 'members'
          AND NOT EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = ${gameId} AND p.user_id = r.users_id)
          AND NOT EXISTS (SELECT 1 FROM game_invites i WHERE i.game_id = ${gameId} AND i.user_id = r.users_id AND i.status <> 'accepted')
        ORDER BY r."order" NULLS LAST, r.id
        LIMIT ${free}
      `)
      entries = rows.map((member) => ({ userId: member.users_id, side: request.side }))
    }

    const refused = await addInvites(tx, gameId, sides.game, hostId, entries)
    return refused ?? { ok: true, invited: entries.map((entry) => entry.userId) }
  })
}

/** The host takes back an invite that hasn't been answered. False when there is no such pending invite. */
export async function cancelInvite(payload: Payload, gameId: number, inviteId: number) {
  const { rows } = await drizzle(payload).execute(sql`
    DELETE FROM game_invites WHERE id = ${inviteId} AND game_id = ${gameId} AND status = 'pending' RETURNING id
  `)
  return rows.length > 0
}

/** The invitee turns an invite down. False when it isn't theirs, or isn't pending any more. */
export async function declineInvite(payload: Payload, inviteId: number, userId: number) {
  const { rows } = await drizzle(payload).execute(sql`
    UPDATE game_invites SET status = 'declined', updated_at = now()
    WHERE id = ${inviteId} AND user_id = ${userId} AND status = 'pending' RETURNING id
  `)
  return rows.length > 0
}

/** Joining a game answers an invite to it, whichever way the player got there. Never throws: the join already happened. */
export async function markInviteAccepted(payload: Payload, gameId: number, userId: number) {
  try {
    await drizzle(payload).execute(sql`
      UPDATE game_invites SET status = 'accepted', updated_at = now()
      WHERE game_id = ${gameId} AND user_id = ${userId} AND status = 'pending'
    `)
  } catch (error) {
    console.error('Failed to mark an invite accepted', error)
  }
}

const POPULATE = { users: { fullName: true, profilePicture: true, avatarUrl: true } } as const

/** A game's invites that are still open or were turned down, for the host: who, which side, and the answer so far. */
export async function listGameInvites(payload: Payload, gameId: number) {
  const { docs } = await payload.find({
    collection: 'game-invites',
    where: { and: [{ game: { equals: gameId } }, { status: { in: ['pending', 'declined'] } }] },
    select: { user: true, side: true, status: true },
    populate: POPULATE,
    sort: 'createdAt',
    depth: 2,
    pagination: false,
    overrideAccess: true,
  })
  return docs
    .filter((doc) => typeof doc.user === 'object')
    .map((doc) => ({ id: String(doc.id), side: doc.side, status: doc.status, player: toPlayer({ user: doc.user }) }))
}

/**
 * The player list behind "Oyunçu əlavə et": everyone but the caller, a page at a time, narrowed by a
 * name (a substring, ignoring case and Azerbaijani letters, so "eli" finds "Əli") and by `filter`:
 * `clubs` is members of the clubs the caller is in, `recent` is people they have shared a game with,
 * latest first. With a game, those already in it or invited to it are left out. Public profile fields
 * only (id, name, initials, picture): never an email or a number.
 */
// shortcut: a scan over users with a folded-name match; add a trigram index when accounts pass tens of thousands.
export async function listUsers(
  payload: Payload,
  { query, filter, page, limit, viewerId, gameId }: { query: string; filter: UserFilter; page: number; limit: number; viewerId: number; gameId: number | null },
) {
  const folded = foldForSearch(query.trim())
  const byName = folded ? sql`AND position(${folded} in lower(translate(u.full_name, 'əıİöüçşğƏÖÜÇŞĞ', 'eiioucsgeoucsg'))) > 0` : sql``
  const notInGame =
    gameId === null
      ? sql``
      : sql`AND NOT EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = ${gameId} AND p.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM game_invites i WHERE i.game_id = ${gameId} AND i.user_id = u.id AND i.status <> 'accepted')`
  const sharedGame = sql`
    FROM game_participants a JOIN game_participants b ON b.game_id = a.game_id JOIN games g ON g.id = a.game_id
    WHERE a.user_id = ${viewerId} AND b.user_id = u.id AND g.status <> 'cancelled'`
  const narrowed =
    filter === 'clubs'
      ? sql`AND EXISTS (SELECT 1 FROM teams_rels mine JOIN teams_rels theirs ON theirs.parent_id = mine.parent_id AND theirs.path = 'members'
                        WHERE mine.path = 'members' AND mine.users_id = ${viewerId} AND theirs.users_id = u.id)`
      : filter === 'recent'
        ? sql`AND EXISTS (SELECT 1 ${sharedGame})`
        : sql``
  const order = filter === 'recent' ? sql`(SELECT max(g.scheduled_at) ${sharedGame}) DESC, u.full_name, u.id` : sql`u.full_name, u.id`

  const { rows } = await drizzle(payload).execute<{ id: number }>(sql`
    SELECT u.id FROM users u
    WHERE u.id <> ${viewerId} ${byName} ${notInGame} ${narrowed}
    ORDER BY ${order}
    LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}
  `)
  const hasMore = rows.length > limit
  const ids = rows.slice(0, limit).map((row) => row.id)
  if (ids.length === 0) return { users: [], hasMore: false }

  const { docs } = await payload.find({
    collection: 'users',
    where: { id: { in: ids } },
    select: { fullName: true, profilePicture: true, avatarUrl: true },
    depth: 1,
    pagination: false,
    overrideAccess: true,
  })
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const users = ids.flatMap((id) => {
    const doc = byId.get(id)
    if (!doc) return []
    const { name, initials, avatarUrl } = toPlayer({ user: doc })
    return [{ id: String(id), name, initials, avatarUrl }]
  })
  return { users, hasMore }
}

/** An invite to a game that hasn't started, which the person hasn't joined (joining answers it). */
const OPEN_INVITE = sql`
  i.status = 'pending' AND g.status = 'scheduled' AND g.scheduled_at > now()
  AND NOT EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = g.id AND p.user_id = i.user_id)
`

/** The invitations waiting for this person, soonest game first. A side with a club is named after it. */
export async function myInvites(payload: Payload, userId: number) {
  const { rows } = await drizzle(payload).execute<{
    id: number
    side: Side
    game_id: number
    title: string
    sport: string
    scheduled_at: Date | string
    venue: string | null
    host_name: string | null
    club: string | null
  }>(sql`
    SELECT i.id, i.side, g.id AS game_id, g.title, g.sport, g.scheduled_at, a.name AS venue, h.full_name AS host_name,
           CASE WHEN i.side = 'home' THEN hm.name ELSE aw.name END AS club
    FROM game_invites i
    JOIN games g ON g.id = i.game_id
    LEFT JOIN arenas a ON a.id = g.arena_id
    LEFT JOIN users h ON h.id = g.host_id
    LEFT JOIN teams hm ON hm.id = g.home_team_id
    LEFT JOIN teams aw ON aw.id = g.away_team_id
    WHERE i.user_id = ${userId} AND ${OPEN_INVITE}
    ORDER BY g.scheduled_at, i.id
    LIMIT 20
  `)
  return rows.map((row) => {
    const startsAt = new Date(row.scheduled_at).toISOString()
    return {
      id: String(row.id),
      gameId: String(row.game_id),
      title: row.title,
      sportLabel: SPORT_META[row.sport]?.label ?? row.sport,
      dateLabel: formatBakuShortDate(startsAt),
      timeLabel: formatBakuTime(startsAt),
      venueName: row.venue,
      hostName: row.host_name,
      side: row.side,
      sideLabel: row.club ?? (row.side === 'home' ? 'A komandası' : 'B komandası'),
    }
  })
}
