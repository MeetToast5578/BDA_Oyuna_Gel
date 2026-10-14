// Pure team logic: sides in a game, auto-balance, the score's confirm flow and win/loss stats.
// No Payload or Next imports, like lib/game-backend.ts. Plan: docs/teams-and-stats-plan.md.

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
  const counts = { home: 0, away: 0 }
  for (const side of sides) counts[side] += 1
  const cap = sideCapacity(maxPlayers)
  const withHost = Math.min(guests, Math.max(cap - counts[hostSide], 0))
  counts[hostSide] += withHost
  counts[otherSide(hostSide)] += guests - withHost
  return counts
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

/** League table order: points, then goal difference, then goals scored. */
export const compareStandings = (a: WinLossRecord, b: WinLossRecord) =>
  b.points - a.points || b.scored - b.conceded - (a.scored - a.conceded) || b.scored - a.scored
