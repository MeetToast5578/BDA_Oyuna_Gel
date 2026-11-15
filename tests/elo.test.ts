import { describe, expect, it } from 'vitest'

import { ELO_K, ELO_START, expectedHome, replayElo, type EloGame } from '@/lib/elo'

let nextId = 1
const game = (homeScore: number, awayScore: number, home: number[], away: number[], extra: Partial<EloGame> = {}): EloGame => ({
  id: nextId++,
  sport: 'football',
  scheduledAt: `2026-10-${String(nextId).padStart(2, '0')}T15:00:00.000Z`,
  homeScore,
  awayScore,
  players: [...home.map((userId) => ({ userId, side: 'home' as const })), ...away.map((userId) => ({ userId, side: 'away' as const }))],
  ...extra,
})

describe('replayElo', () => {
  it('moves level sides by half of K, the same for every player on a side', () => {
    const { ratings, changes } = replayElo([game(3, 1, [1, 2], [3, 4])])
    const football = ratings.get('football')!
    expect([1, 2, 3, 4].map((id) => football.get(id))).toEqual([ELO_START + ELO_K / 2, ELO_START + ELO_K / 2, ELO_START - ELO_K / 2, ELO_START - ELO_K / 2])
    expect(changes.get(1)).toEqual([expect.objectContaining({ before: ELO_START, after: ELO_START + ELO_K / 2 })])
  })

  it('leaves level sides where they are after a draw', () => {
    const { ratings } = replayElo([game(2, 2, [1], [2])])
    expect(ratings.get('football')!.get(1)).toBe(ELO_START)
  })

  it('pays more for beating a stronger side than a weaker one', () => {
    // 1 beats 2 first, so 1 is the favourite; then the underdog 2 wins the rematch.
    const { changes } = replayElo([game(1, 0, [1], [2]), game(0, 1, [1], [2])])
    const [first, rematch] = changes.get(2)!
    expect(first.after - first.before).toBeCloseTo(-ELO_K / 2)
    expect(rematch.after - rematch.before).toBeGreaterThan(ELO_K / 2)
    // The away underdog gains K times the favourite's chance of winning.
    expect(rematch.after - rematch.before).toBeCloseTo(ELO_K * expectedHome(ELO_START + 16, ELO_START - 16))
  })

  it('plays games in date order, not the order given', () => {
    const later = game(0, 3, [1], [2], { scheduledAt: '2026-11-20T15:00:00.000Z' })
    const earlier = game(3, 0, [1], [2], { scheduledAt: '2026-11-01T15:00:00.000Z' })
    expect(replayElo([later, earlier]).changes.get(1)!.map((change) => change.gameId)).toEqual([earlier.id, later.id])
  })

  it('rates each sport on its own and skips a game with nobody on one side', () => {
    const { ratings, changes } = replayElo([game(1, 0, [1], [2], { sport: 'tennis' }), game(5, 0, [1], [])])
    expect(ratings.get('tennis')!.get(1)).toBe(ELO_START + ELO_K / 2)
    expect(ratings.get('football')).toBeUndefined()
    expect(changes.get(1)).toHaveLength(1)
  })

  it('counts nobody who is listed on both sides', () => {
    const { changes } = replayElo([game(1, 0, [1, 3], [2, 3])])
    expect(changes.has(3)).toBe(false)
    expect(changes.get(1)).toHaveLength(1)
  })
})
