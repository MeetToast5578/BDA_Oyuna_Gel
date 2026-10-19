import { randomBytes, timingSafeEqual } from 'node:crypto'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatBakuShortDate, SPORT_META, toPlayer } from '@/lib/game-backend'
import type { Db } from '@/lib/join-game'
import { recentTeamResults, teamRecords } from '@/lib/records'
import { afterMemberLeaves, compareStandings, summarize, type WinLossRecord } from '@/lib/team-logic'

export type TeamErrorCode = 'TEAM_NOT_FOUND' | 'NOT_CAPTAIN' | 'INVALID_INVITE' | 'NOT_A_CLUB_MEMBER' | 'TOO_MANY_CLUBS'
export type TeamResult<T = object> = ({ ok: true } & T) | { ok: false; code: TeamErrorCode }

/** One person captains at most this many clubs, so the public create endpoint can't be used to flood the list. */
export const MAX_CLUBS_CAPTAINED = 5

/** 96 random bits as base64url (16 characters): unguessable, so the link itself is the invitation. */
export const newInviteCode = () => randomBytes(12).toString('base64url')

class TeamRejected extends Error {
  constructor(readonly code: TeamErrorCode) {
    super(code)
  }
}

const drizzle = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** Runs `work` in a transaction that already holds the club's row lock, so membership changes line up one after another. */
async function lockedTeam<T>(
  payload: Payload,
  teamId: number,
  work: (tx: Db, team: { captain_id: number | null; invite_code: string | null }) => Promise<T>,
): Promise<TeamResult<{ value: T }>> {
  try {
    return await drizzle(payload).transaction(async (tx) => {
      const { rows } = await tx.execute<{ captain_id: number | null; invite_code: string | null }>(sql`
        SELECT captain_id, invite_code FROM teams WHERE id = ${teamId} FOR UPDATE
      `)
      if (!rows[0]) throw new TeamRejected('TEAM_NOT_FOUND')
      return { ok: true as const, value: await work(tx, rows[0]) }
    })
  } catch (error) {
    if (error instanceof TeamRejected) return { ok: false, code: error.code }
    throw error
  }
}

/** Members in the order they joined; the rows' `order` is how Payload keeps a relationship list. */
async function memberIds(db: Db, teamId: number) {
  const { rows } = await db.execute<{ users_id: number }>(sql`
    SELECT users_id FROM teams_rels WHERE parent_id = ${teamId} AND path = 'members' ORDER BY "order" NULLS LAST, id
  `)
  return rows.map((row) => row.users_id)
}

/**
 * Takes a person out of a club and hands the captaincy to the longest-standing member when it was
 * theirs (`afterMemberLeaves`). The caller holds the club's row lock. False when they weren't in it.
 * Games they already joined on its side are left alone (D11): membership is checked when joining.
 */
async function leaveClub(db: Db, teamId: number, captainId: number | null, userId: number) {
  const members = await memberIds(db, teamId)
  if (!members.includes(userId)) return false
  const next = afterMemberLeaves(members, captainId, userId)
  await db.execute(sql`DELETE FROM teams_rels WHERE parent_id = ${teamId} AND path = 'members' AND users_id = ${userId}`)
  if (next.captainId !== captainId) {
    await db.execute(sql`UPDATE teams SET captain_id = ${next.captainId}, updated_at = now() WHERE id = ${teamId}`)
  }
  return true
}

export async function createTeam(payload: Payload, userId: number, input: { name: string; sport: string }) {
  try {
    return await drizzle(payload).transaction(async (tx) => {
      const { rows: count } = await tx.execute<{ n: string }>(sql`SELECT count(*) AS n FROM teams WHERE captain_id = ${userId}`)
      if (Number(count[0].n) >= MAX_CLUBS_CAPTAINED) throw new TeamRejected('TOO_MANY_CLUBS')
      const { rows } = await tx.execute<{ id: number }>(sql`
        INSERT INTO teams (name, sport, captain_id, invite_code, updated_at, created_at)
        VALUES (${input.name}, ${input.sport}, ${userId}, ${newInviteCode()}, now(), now())
        RETURNING id
      `)
      await tx.execute(sql`INSERT INTO teams_rels (parent_id, path, users_id, "order") VALUES (${rows[0].id}, 'members', ${userId}, 0)`)
      return { ok: true as const, id: rows[0].id }
    })
  } catch (error) {
    if (error instanceof TeamRejected) return { ok: false as const, code: error.code }
    throw error
  }
}

/** Joins a club with the code from its invite link. Joining twice is a no-op (`joined: false`). */
export async function joinTeam(payload: Payload, teamId: number, userId: number, code: string) {
  const result = await lockedTeam(payload, teamId, async (tx, team) => {
    const given = Buffer.from(code)
    const wanted = Buffer.from(team.invite_code ?? '')
    // A club without a code (an old one) can't be joined until its captain makes one.
    if (wanted.length === 0 || given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new TeamRejected('INVALID_INVITE')
    const members = await memberIds(tx, teamId)
    if (members.includes(userId)) return false
    await tx.execute(sql`INSERT INTO teams_rels (parent_id, path, users_id, "order") VALUES (${teamId}, 'members', ${userId}, ${members.length})`)
    return true
  })
  return result.ok ? { ok: true as const, joined: result.value } : result
}

export async function leaveTeam(payload: Payload, teamId: number, userId: number) {
  const result = await lockedTeam(payload, teamId, async (tx, team) => {
    if (!(await leaveClub(tx, teamId, team.captain_id, userId))) throw new TeamRejected('NOT_A_CLUB_MEMBER')
  })
  return result.ok ? { ok: true as const } : result
}

/** The captain removes a member. */
export async function removeMember(payload: Payload, teamId: number, captainId: number, memberId: number) {
  const result = await lockedTeam(payload, teamId, async (tx, team) => {
    if (team.captain_id !== captainId) throw new TeamRejected('NOT_CAPTAIN')
    if (!(await leaveClub(tx, teamId, team.captain_id, memberId))) throw new TeamRejected('NOT_A_CLUB_MEMBER')
  })
  return result.ok ? { ok: true as const } : result
}

/** The captain renames the club and/or retires its invite link for a new one. */
export async function updateTeam(
  payload: Payload,
  teamId: number,
  captainId: number,
  changes: { name?: string; regenerateInviteCode: boolean },
) {
  const result = await lockedTeam(payload, teamId, async (tx, team) => {
    if (team.captain_id !== captainId) throw new TeamRejected('NOT_CAPTAIN')
    const code = changes.regenerateInviteCode ? newInviteCode() : team.invite_code
    await tx.execute(sql`
      UPDATE teams SET name = ${changes.name ?? sql`name`}, invite_code = ${code}, updated_at = now() WHERE id = ${teamId}
    `)
  })
  return result.ok ? { ok: true as const } : result
}

/**
 * Takes a person out of every club they are in, handing over each captaincy, before their account
 * goes: the membership rows would cascade away on their own, but the captain column only empties,
 * which would leave a club with members and nobody in charge.
 */
export async function leaveAllClubs(db: Db, userId: number) {
  const { rows } = await db.execute<{ id: number; captain_id: number | null }>(sql`
    SELECT t.id, t.captain_id FROM teams t
    WHERE EXISTS (SELECT 1 FROM teams_rels r WHERE r.parent_id = t.id AND r.path = 'members' AND r.users_id = ${userId})
    ORDER BY t.id
    FOR UPDATE OF t
  `)
  for (const team of rows) await leaveClub(db, team.id, team.captain_id, userId)
}

/**
 * Clubs with at least one member (an emptied club is hidden, D12), biggest first, each with its
 * record from confirmed scores. The standings are these rows put in `compareStandings` order.
 */
export async function listTeams(payload: Payload, sport: string | null) {
  const { rows } = await drizzle(payload).execute<{ id: number; name: string; sport: string; members: string }>(sql`
    SELECT t.id, t.name, t.sport, count(r.id) AS members
    FROM teams t
    JOIN teams_rels r ON r.parent_id = t.id AND r.path = 'members'
    ${sport ? sql`WHERE t.sport = ${sport}` : sql``}
    GROUP BY t.id
    ORDER BY members DESC, t.name, t.id
  `)
  const records = await teamRecords(drizzle(payload), rows.map((row) => row.id))
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    sport: row.sport,
    sportLabel: SPORT_META[row.sport]?.label ?? row.sport,
    memberCount: Number(row.members),
    record: summarize(records.get(row.id) ?? []),
  }))
}

/** League-table order: points, goal difference, goals scored; clubs level on all three, the bigger club first. */
export const byStanding = (a: { record: WinLossRecord; memberCount: number; name: string }, b: typeof a) =>
  compareStandings(a.record, b.record) || b.memberCount - a.memberCount || a.name.localeCompare(b.name, 'az')

/** The clubs a person is a member of, by name. */
export async function userClubs(payload: Payload, userId: number) {
  const { rows } = await drizzle(payload).execute<{ id: number; name: string; sport: string }>(sql`
    SELECT t.id, t.name, t.sport FROM teams t
    JOIN teams_rels r ON r.parent_id = t.id AND r.path = 'members'
    WHERE r.users_id = ${userId}
    ORDER BY t.name, t.id
  `)
  return rows.map((row) => ({ id: String(row.id), name: row.name, sport: row.sport, sportLabel: SPORT_META[row.sport]?.label ?? row.sport }))
}

const MEMBER_POPULATE = { users: { fullName: true, profilePicture: true, avatarUrl: true } } as const

/**
 * A club's page: its members in join order, and who the viewer is to it. The invite code goes to the
 * captain only: it is the whole of what a member needs to bring someone in.
 */
export async function getTeam(payload: Payload, teamId: number, viewerId: number | null) {
  const doc = await payload.findByID({
    collection: 'teams',
    id: teamId,
    depth: 2,
    populate: MEMBER_POPULATE,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!doc) return null

  const captainId = typeof doc.captain === 'object' ? (doc.captain?.id ?? null) : (doc.captain ?? null)
  const members = (doc.members ?? [])
    .filter((member) => typeof member === 'object')
    .map((member) => {
      const { id, name, initials, avatarUrl } = toPlayer({ user: member })
      return { id, name, initials, avatarUrl, isCaptain: member.id === captainId, you: member.id === viewerId }
    })
  const isCaptain = viewerId !== null && captainId === viewerId
  const db = drizzle(payload)
  const [records, recent] = await Promise.all([teamRecords(db, [teamId]), recentTeamResults(db, teamId)])

  return {
    id: String(doc.id),
    name: doc.name,
    sport: doc.sport,
    sportLabel: SPORT_META[doc.sport]?.label ?? doc.sport,
    memberCount: members.length,
    members,
    record: summarize(records.get(teamId) ?? []),
    recent: recent.map((game) => ({ ...game, dateLabel: formatBakuShortDate(game.startsAt) })),
    viewer: { isMember: members.some((member) => member.you), isCaptain },
    inviteCode: isCaptain ? (doc.inviteCode ?? null) : null,
  }
}

/** The club an invite link is for, for its landing page; null for a code that matches none. */
export async function findTeamByInviteCode(payload: Payload, code: string) {
  const { rows } = await drizzle(payload).execute<{ id: number; name: string; sport: string }>(sql`
    SELECT id, name, sport FROM teams WHERE invite_code = ${code}
  `)
  const team = rows[0]
  return team ? { id: String(team.id), name: team.name, sport: team.sport, sportLabel: SPORT_META[team.sport]?.label ?? team.sport } : null
}

export type ClubOption = { id: string; name: string; sport: string; mine: boolean }

/**
 * The clubs a game form can pick from: every club with members, flagged when the person is one of
 * them, plus any club `alsoIds` names (the clubs of the game being edited, even if everyone has left).
 */
export async function clubOptions(payload: Payload, userId: number, alsoIds: number[] = []): Promise<ClubOption[]> {
  const also = alsoIds.length ? sql`t.id IN (${sql.join(alsoIds.map((id) => sql`${id}`), sql`, `)})` : sql`FALSE`
  const { rows } = await drizzle(payload).execute<{ id: number; name: string; sport: string; mine: boolean }>(sql`
    SELECT t.id, t.name, t.sport, COALESCE(bool_or(r.users_id = ${userId}), FALSE) AS mine
    FROM teams t
    LEFT JOIN teams_rels r ON r.parent_id = t.id AND r.path = 'members'
    GROUP BY t.id
    HAVING count(r.id) > 0 OR ${also}
    ORDER BY t.name, t.id
  `)
  return rows.map((row) => ({ id: String(row.id), name: row.name, sport: row.sport, mine: row.mine }))
}
