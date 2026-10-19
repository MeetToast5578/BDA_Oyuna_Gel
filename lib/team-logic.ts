// Pure team logic: sides in a game, auto-balance, the score's confirm flow and win/loss stats.
// No Payload or Next imports, like lib/game-backend.ts. Plan: docs/teams-and-stats-plan.md.

import { SPORTS } from '@/lib/game-backend'

export type Side = 'home' | 'away'
export type SideChoice = Side | 'random'
export type Outcome = 'win' | 'draw' | 'loss'
export type ResultStatus = 'reported' | 'confirmed' | 'disputed'

export const SIDES: Side[] = ['home', 'away']
/** A reported score nobody disputes counts as confirmed this long after it was entered. */
export const AUTO_CONFIRM_HOURS = 48

export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home')

/** Each side holds half the game; `maxPlayers` is always even (see PLAYER_COUNT_STEP). */
export const sideCapacity = (maxPlayers: number) => Math.floor(maxPlayers / 2)

/** The two clubs a game can be between. Either or both may be null: that side is open to anyone. */
export type GameSides = { maxPlayers: number; homeTeamId: number | null; awayTeamId: number | null }

/** Sides a player may stand on: a club's side is for its members only, an open side for anyone. */
export function eligibleSides(game: GameSides, memberOf: number[]): Side[] {
  return SIDES.filter((side) => {
    const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId
    return teamId === null || memberOf.includes(teamId)
  })
}

/**
 * How full each side is. `sides` are the participant rows' sides; `guests` are spots the host
 * filled at creation without an account (createGame's `currentCount - 1`). Guests play with the
 * host, and only spill over to the other side once the host's is full.
 */
export function occupancy(maxPlayers: number, sides: Side[], guests = 0, hostSide: Side = 'home'): Record<Side, number> {
  // Guests are derived (max − available − rows), so counters that drifted could make them negative.
  guests = Math.max(Math.floor(guests), 0)
  const counts = { home: 0, away: 0 }
  for (const side of sides) counts[side] += 1
  const cap = sideCapacity(maxPlayers)
  const withHost = Math.min(guests, Math.max(cap - counts[hostSide], 0))
  counts[hostSide] += withHost
  counts[otherSide(hostSide)] += guests - withHost
  return counts
}

/** A join body's `side`. Absent means "random"; anything else unknown is refused (400 INVALID_SIDE). */
export function parseSideChoice(value: unknown): SideChoice | null {
  if (value === undefined || value === null) return 'random'
  return value === 'home' || value === 'away' || value === 'random' ? value : null
}

/** One participant row as the side checks see it. */
export type SidePlayer = { userId: number; side: Side; memberOf: number[] }
export type SidesCheck =
  | { ok: true; counts: Record<Side, number> }
  | { ok: false; code: 'NOT_A_MEMBER' | 'SIDE_FULL' | 'NOT_IN_GAME'; userId?: number }

/**
 * The invariant every change to a game's sides must keep: each player stands on a side they may
 * stand on, and neither side holds more than half the game. Join, the host's reassign and
 * "Balansla", resizing a game and changing its clubs all end with this check, inside the same
 * transaction as the write, so none of them can leave a game in a state the others don't expect.
 * The host's own side decides where the guests stand.
 */
export function checkSides(game: GameSides, players: SidePlayer[], guests: number, hostId: number | null): SidesCheck {
  for (const player of players) {
    if (!eligibleSides(game, player.memberOf).includes(player.side)) {
      return { ok: false, code: 'NOT_A_MEMBER', userId: player.userId }
    }
  }
  const hostSide = players.find((player) => player.userId === hostId)?.side ?? 'home'
  const counts = occupancy(game.maxPlayers, players.map((player) => player.side), guests, hostSide)
  const cap = sideCapacity(game.maxPlayers)
  if (counts.home > cap || counts.away > cap) return { ok: false, code: 'SIDE_FULL' }
  return { ok: true, counts }
}

/** The host's moves applied to the current rows. A move for someone not in the game is refused, not ignored. */
export function applyAssignments(
  players: SidePlayer[],
  assignments: { userId: number; side: Side }[],
): { ok: true; players: SidePlayer[] } | { ok: false; code: 'NOT_IN_GAME'; userId: number } {
  const moves = new Map(assignments.map(({ userId, side }) => [userId, side]))
  for (const userId of moves.keys()) {
    if (!players.some((player) => player.userId === userId)) return { ok: false, code: 'NOT_IN_GAME', userId }
  }
  return { ok: true, players: players.map((player) => ({ ...player, side: moves.get(player.userId) ?? player.side })) }
}

/** `PATCH /sides` body: `{ assignments: [{ userId, side }] }` or `{ balance: true }`. At most one move per player in the game. */
export function parseSidesBody(
  body: unknown,
): { ok: true; balance: true } | { ok: true; balance: false; assignments: { userId: number; side: Side }[] } | { ok: false } {
  const doc = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  if (doc?.balance === true) return { ok: true, balance: true }
  if (!Array.isArray(doc?.assignments) || doc.assignments.length === 0 || doc.assignments.length > 22) return { ok: false } // 22: the largest game (football)

  const assignments: { userId: number; side: Side }[] = []
  for (const item of doc.assignments) {
    const { userId, side } = (item ?? {}) as Record<string, unknown>
    if (!Number.isSafeInteger(userId) || (userId as number) <= 0 || (side !== 'home' && side !== 'away')) return { ok: false }
    assignments.push({ userId: userId as number, side })
  }
  return { ok: true, balance: false, assignments }
}

/** One named player invited to a side of a game. */
export type InviteEntry = { userId: number; side: Side }

/** A game holds at most 22 players (football), the host among them, so at most 21 can be invited. */
export const MAX_INVITES_PER_GAME_FORM = 21

/**
 * The create body's `invites`: absent or empty is no invites, otherwise `[{ userId, side }]` with at
 * most one entry per player. Anything else is refused, not trimmed (400 INVALID_INVITES).
 */
export function parseInviteEntries(value: unknown): { ok: true; entries: InviteEntry[] } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, entries: [] }
  if (!Array.isArray(value) || value.length > MAX_INVITES_PER_GAME_FORM) return { ok: false }
  const entries: InviteEntry[] = []
  for (const item of value) {
    const { userId, side } = (item ?? {}) as Record<string, unknown>
    if (!Number.isSafeInteger(userId) || (userId as number) <= 0 || (side !== 'home' && side !== 'away')) return { ok: false }
    if (entries.some((entry) => entry.userId === userId)) return { ok: false }
    entries.push({ userId: userId as number, side })
  }
  return { ok: true, entries }
}

/**
 * `POST /invites` body: `{ userId, side }` for one player, `{ invites: [{ userId, side }] }` for several
 * (the player picker adds a few at once), or `{ clubSide }` for everyone in that side's club.
 */
export function parseInviteRequest(
  body: unknown,
): { ok: true; club: false; entries: InviteEntry[] } | { ok: true; club: true; side: Side } | { ok: false } {
  const doc = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (doc.clubSide !== undefined) return doc.clubSide === 'home' || doc.clubSide === 'away' ? { ok: true, club: true, side: doc.clubSide } : { ok: false }
  const parsed = parseInviteEntries(Array.isArray(doc.invites) ? doc.invites : [doc])
  return parsed.ok && parsed.entries.length > 0 ? { ok: true, club: false, entries: parsed.entries } : { ok: false }
}

export type PickSideResult = { ok: true; side: Side } | { ok: false; code: 'NOT_A_MEMBER' | 'SIDE_FULL' }

/**
 * Turns a join's side choice into a side. "Random" takes the emptier side the player may join, a
 * coin flip on a tie. Runs inside the join transaction, with `counts` read under the game's row lock.
 */
export function pickSide(
  game: GameSides,
  counts: Record<Side, number>,
  choice: SideChoice,
  memberOf: number[],
  random = Math.random,
): PickSideResult {
  const cap = sideCapacity(game.maxPlayers)
  const allowed = eligibleSides(game, memberOf)
  const wanted = choice === 'random' ? allowed : allowed.filter((side) => side === choice)
  if (wanted.length === 0) return { ok: false, code: 'NOT_A_MEMBER' }

  const open = wanted.filter((side) => counts[side] < cap)
  if (open.length === 0) return { ok: false, code: 'SIDE_FULL' }
  if (open.length === 1) return { ok: true, side: open[0] }
  if (counts.home !== counts.away) return { ok: true, side: counts.home < counts.away ? 'home' : 'away' }
  return { ok: true, side: random() < 0.5 ? 'home' : 'away' }
}

/**
 * How strong a player is, for balancing: their points share with one win and one loss added, so a
 * newcomer sits at 0.5 instead of 0 or 1 after their first game.
 */
export const balanceRating = ({ played, wins, draws }: { played: number; wins: number; draws: number }) =>
  (wins + draws / 2 + 1) / (played + 2)

export type BalancePlayer = { userId: number; rating: number; eligible: Side[] }

/**
 * Splits players into two even sides of similar strength. Players who can only stand on one side
 * (club members facing an open side, or the reverse) are placed first. The rest go strongest first
 * to the side with fewer players, or on a tie the weaker side: even sizes before even strength.
 */
// shortcut: greedy, not an optimal partition; good enough for ≤22 players of noisy ratings. Revisit if hosts complain.
export function autoBalance(players: BalancePlayer[], maxPlayers: number): Map<number, Side> {
  const cap = sideCapacity(maxPlayers)
  const assigned = new Map<number, Side>()
  const size = { home: 0, away: 0 }
  const strength = { home: 0, away: 0 }
  const place = (player: BalancePlayer, side: Side) => {
    assigned.set(player.userId, side)
    size[side] += 1
    strength[side] += player.rating
  }

  const fixed = players.filter((player) => player.eligible.length === 1)
  const flexible = players.filter((player) => player.eligible.length > 1).sort((a, b) => b.rating - a.rating)
  for (const player of fixed) place(player, player.eligible[0])
  for (const player of flexible) {
    const room = SIDES.filter((side) => size[side] < cap)
    const [best] = (room.length ? room : [...SIDES]).sort((a, b) => size[a] - size[b] || strength[a] - strength[b])
    place(player, best)
  }
  return assigned
}

export type ResultState = { status: ResultStatus | null; reportedAt: string | null }

/** The stored status as it stands now: a report left undisputed for AUTO_CONFIRM_HOURS counts as confirmed. */
export function effectiveResultStatus(state: ResultState, now = Date.now()): ResultStatus | null {
  if (state.status !== 'reported' || !state.reportedAt) return state.status
  return now - Date.parse(state.reportedAt) >= AUTO_CONFIRM_HOURS * 3_600_000 ? 'confirmed' : 'reported'
}

export type ResultAction = 'report' | 'confirm' | 'dispute'
export type ResultActor = { isHost: boolean; isAdmin: boolean; side: Side | null; hostSide: Side }
export type ResultErrorCode = 'GAME_NOT_FINISHED' | 'FORBIDDEN' | 'RESULT_LOCKED' | 'NOTHING_TO_CONFIRM'

/**
 * The score's life: the host reports it once the game is over, a player from the other side
 * confirms or disputes it, and a disputed score goes back to the host. A confirmed score is final
 * except for admins. Returns the next stored status, or why the action is refused.
 */
export function nextResultStatus(
  state: ResultState,
  action: ResultAction,
  actor: ResultActor,
  gameFinished: boolean,
  now = Date.now(),
): { ok: true; status: ResultStatus } | { ok: false; code: ResultErrorCode } {
  if (!gameFinished) return { ok: false, code: 'GAME_NOT_FINISHED' }
  const current = effectiveResultStatus(state, now)

  if (action === 'report') {
    if (!actor.isHost && !actor.isAdmin) return { ok: false, code: 'FORBIDDEN' }
    // An admin's report settles the score; nobody needs to confirm it.
    if (actor.isAdmin) return { ok: true, status: 'confirmed' }
    if (current === 'confirmed') return { ok: false, code: 'RESULT_LOCKED' }
    return { ok: true, status: 'reported' }
  }

  if (actor.side !== otherSide(actor.hostSide)) return { ok: false, code: 'FORBIDDEN' }
  if (current !== 'reported') return { ok: false, code: 'NOTHING_TO_CONFIRM' }
  return { ok: true, status: action === 'confirm' ? 'confirmed' : 'disputed' }
}

/** Highest score accepted; well above a basketball game's, so it only stops typos and abuse. */
export const MAX_SCORE = 300

/** `POST /result` body. Both scores must be whole numbers from 0 to MAX_SCORE. */
export function parseResultBody(body: unknown): { ok: true; homeScore: number; awayScore: number } | { ok: false } {
  const doc = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const valid = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SCORE
  return valid(doc.homeScore) && valid(doc.awayScore) ? { ok: true, homeScore: doc.homeScore, awayScore: doc.awayScore } : { ok: false }
}

/**
 * Whether a game's score goes into anyone's stats. A cancelled game never does, even with a
 * confirmed score (an admin can cancel after the fact). The stats SQL repeats this predicate.
 */
export const resultCounts = (gameStatus: string, state: ResultState, now = Date.now()) =>
  gameStatus !== 'cancelled' && effectiveResultStatus(state, now) === 'confirmed'

/**
 * A game's clubs, checked when the host creates or edits it. Membership (the host on their own
 * club's side) is `checkSides`' job; this is only what the clubs themselves must satisfy.
 */
export function clubSidesError(
  gameSport: string,
  home: { id: number; sport: string } | null,
  away: { id: number; sport: string } | null,
): 'TEAM_SPORT_MISMATCH' | 'SAME_TEAM' | null {
  if ((home && home.sport !== gameSport) || (away && away.sport !== gameSport)) return 'TEAM_SPORT_MISMATCH'
  if (home && away && home.id === away.id) return 'SAME_TEAM'
  return null
}

/**
 * A club after a member leaves (or deletes their account). A leaving captain hands over to the
 * longest-standing member (`members` is in join order). The last member leaving keeps the club
 * with no captain rather than deleting it, because past games still point at it and its record
 * stays readable.
 */
export function afterMemberLeaves(members: number[], captainId: number | null, leavingId: number) {
  const remaining = members.filter((id) => id !== leavingId)
  return { members: remaining, captainId: captainId === leavingId ? (remaining[0] ?? null) : captainId }
}

export function outcomeFor(side: Side, homeScore: number, awayScore: number): Outcome {
  const mine = side === 'home' ? homeScore : awayScore
  const theirs = side === 'home' ? awayScore : homeScore
  return mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw'
}

/** One confirmed game from a player's or a club's point of view. */
export type PlayedGame = { side: Side; homeScore: number; awayScore: number; scheduledAt: string }

export type WinLossRecord = {
  played: number
  wins: number
  draws: number
  losses: number
  /** Wins over games played, 0–1; 0 with no games. */
  winRate: number
  scored: number
  conceded: number
  /** League points: 3 a win, 1 a draw. */
  points: number
  /** The last five outcomes, newest first. */
  form: Outcome[]
}

/** Win/draw/loss record over confirmed games. The same numbers serve a player and a club. */
export function summarize(games: PlayedGame[]): WinLossRecord {
  const record: WinLossRecord = { played: 0, wins: 0, draws: 0, losses: 0, winRate: 0, scored: 0, conceded: 0, points: 0, form: [] }
  const newestFirst = [...games].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt))

  for (const game of newestFirst) {
    const outcome = outcomeFor(game.side, game.homeScore, game.awayScore)
    record.played += 1
    record[outcome === 'win' ? 'wins' : outcome === 'draw' ? 'draws' : 'losses'] += 1
    record.scored += game.side === 'home' ? game.homeScore : game.awayScore
    record.conceded += game.side === 'home' ? game.awayScore : game.homeScore
    if (record.form.length < 5) record.form.push(outcome)
  }
  record.points = record.wins * 3 + record.draws
  record.winRate = record.played ? record.wins / record.played : 0
  return record
}

/** The same record per sport, every sport present even with no games, in `sports` order. */
export function summarizeBySport(games: (PlayedGame & { sport: string })[], sports: string[]) {
  return sports.map((sport) => ({ sport, ...summarize(games.filter((game) => game.sport === sport)) }))
}

/** League table order: points, then goal difference, then goals scored. */
export const compareStandings = (a: WinLossRecord, b: WinLossRecord) =>
  b.points - a.points || b.scored - b.conceded - (a.scored - a.conceded) || b.scored - a.scored

export const TEAM_NAME_MIN = 2
export const TEAM_NAME_MAX = 40
/** A longer string can't be an invite code (`newInviteCode` makes 16 characters). */
const INVITE_CODE_MAX = 64

/** A club name with its whitespace tidied, or null when it isn't 2 to 40 characters. */
function parseTeamName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return name.length >= TEAM_NAME_MIN && name.length <= TEAM_NAME_MAX ? name : null
}

/** `POST /teams` body: a name and the one sport the club plays. */
export function parseCreateTeamBody(
  body: unknown,
): { ok: true; name: string; sport: string } | { ok: false; code: 'INVALID_NAME' | 'INVALID_SPORT' } {
  const doc = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const name = parseTeamName(doc.name)
  if (!name) return { ok: false, code: 'INVALID_NAME' }
  if (typeof doc.sport !== 'string' || !SPORTS.includes(doc.sport)) return { ok: false, code: 'INVALID_SPORT' }
  return { ok: true, name, sport: doc.sport }
}

/** `PATCH /teams/{id}` body: a new `name`, and/or `regenerateInviteCode: true` to retire the old link. */
export function parseUpdateTeamBody(
  body: unknown,
): { ok: true; name: string | undefined; regenerateInviteCode: boolean } | { ok: false; code: 'INVALID_NAME' | 'INVALID_TEAM' } {
  const doc = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const regenerate = doc.regenerateInviteCode
  if (doc.name === undefined && regenerate !== true) return { ok: false, code: 'INVALID_TEAM' }
  if (regenerate !== undefined && regenerate !== true) return { ok: false, code: 'INVALID_TEAM' }
  if (doc.name === undefined) return { ok: true, name: undefined, regenerateInviteCode: true }
  const name = parseTeamName(doc.name)
  return name ? { ok: true, name, regenerateInviteCode: regenerate === true } : { ok: false, code: 'INVALID_NAME' }
}

/** `POST /teams/{id}/join` body: the invite code from the link. */
export function parseJoinTeamBody(body: unknown): { ok: true; code: string } | { ok: false } {
  const code = body && typeof body === 'object' ? (body as Record<string, unknown>).code : null
  return typeof code === 'string' && code.length > 0 && code.length <= INVITE_CODE_MAX ? { ok: true, code } : { ok: false }
}
