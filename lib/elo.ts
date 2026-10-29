import type { Side } from '@/lib/team-logic'

/** Everyone starts here, and moves by at most `ELO_K` points a game. */
export const ELO_START = 1000
export const ELO_K = 32

export type EloGame = {
  id: number
  sport: string
  scheduledAt: string
  homeScore: number
  awayScore: number
  players: { userId: number; side: Side }[]
}

/** One player's rating before and after one game. */
export type EloChange = { gameId: number; sport: string; scheduledAt: string; before: number; after: number }

/** The chance the home side wins, from the two sides' average ratings. */
export const expectedHome = (home: number, away: number) => 1 / (1 + 10 ** ((away - home) / 400))

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * Plays every counted game in date order, each sport rated on its own. A side's strength is the
 * average rating of its players with an account; every player on a side gains or loses the same
 * amount, and the other side the opposite. A side with nobody on an account leaves the game unrated.
 * Returns each player's current rating per sport and their changes, oldest first.
 */
export function replayElo(games: EloGame[]) {
  const ratings = new Map<string, Map<number, number>>()
  const changes = new Map<number, EloChange[]>()
  const ordered = [...games].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id - b.id)

  for (const game of ordered) {
    const sides = { home: new Set<number>(), away: new Set<number>() }
    for (const player of game.players) sides[player.side].add(player.userId)
    // Someone listed on both sides counts on neither.
    for (const id of sides.home) {
      if (sides.away.has(id)) {
        sides.home.delete(id)
        sides.away.delete(id)
      }
    }
    if (sides.home.size === 0 || sides.away.size === 0) continue

    const table = ratings.get(game.sport) ?? new Map<number, number>()
    ratings.set(game.sport, table)
    const rating = (id: number) => table.get(id) ?? ELO_START
    const expected = expectedHome(average([...sides.home].map(rating)), average([...sides.away].map(rating)))
    const actual = game.homeScore > game.awayScore ? 1 : game.homeScore < game.awayScore ? 0 : 0.5
    const homeDelta = ELO_K * (actual - expected)

    for (const [side, delta] of [['home', homeDelta], ['away', -homeDelta]] as const) {
      for (const id of sides[side]) {
        const before = rating(id)
        table.set(id, before + delta)
        changes.set(id, [...(changes.get(id) ?? []), { gameId: game.id, sport: game.sport, scheduledAt: game.scheduledAt, before, after: before + delta }])
      }
    }
  }
  return { ratings, changes }
}
