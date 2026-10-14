import { describe, expect, it } from 'vitest'

import {
  autoBalance,
  balanceRating,
  compareStandings,
  effectiveResultStatus,
  nextResultStatus,
  occupancy,
  pickSide,
  summarize,
  type BalancePlayer,
  type ResultActor,
} from '@/lib/team-logic'

const OPEN = { maxPlayers: 10, homeTeamId: null, awayTeamId: null }
const CLUB_VS_OPEN = { maxPlayers: 10, homeTeamId: 7, awayTeamId: null }

describe('pickSide', () => {
  it('honours a chosen side while it has room', () => {
    expect(pickSide(OPEN, { home: 4, away: 0 }, 'home', [])).toEqual({ ok: true, side: 'home' })
    expect(pickSide(OPEN, { home: 5, away: 0 }, 'home', [])).toEqual({ ok: false, code: 'SIDE_FULL' })
  })

  it('sends a random pick to the emptier side, coin flip on a tie', () => {
    expect(pickSide(OPEN, { home: 3, away: 1 }, 'random', [])).toEqual({ ok: true, side: 'away' })
    expect(pickSide(OPEN, { home: 2, away: 2 }, 'random', [], () => 0.9)).toEqual({ ok: true, side: 'away' })
    expect(pickSide(OPEN, { home: 5, away: 5 }, 'random', [])).toEqual({ ok: false, code: 'SIDE_FULL' })
  })

  it('keeps a club side for its members', () => {
    expect(pickSide(CLUB_VS_OPEN, { home: 0, away: 0 }, 'home', [])).toEqual({ ok: false, code: 'NOT_A_MEMBER' })
    expect(pickSide(CLUB_VS_OPEN, { home: 0, away: 4 }, 'random', [])).toEqual({ ok: true, side: 'away' })
    expect(pickSide(CLUB_VS_OPEN, { home: 0, away: 0 }, 'home', [7])).toEqual({ ok: true, side: 'home' })
  })
})

describe('occupancy', () => {
  it('puts guests on the host side, then spills them over', () => {
    expect(occupancy(10, ['home', 'away'], 3)).toEqual({ home: 4, away: 1 })
    expect(occupancy(10, ['home'], 6, 'home')).toEqual({ home: 5, away: 2 })
    expect(occupancy(10, ['away'], 2, 'away')).toEqual({ home: 0, away: 3 })
  })
})

describe('autoBalance', () => {
  it('evens out size first, then strength', () => {
    const players: BalancePlayer[] = [0.9, 0.8, 0.3, 0.2].map((rating, i) => ({ userId: i, rating, eligible: ['home', 'away'] }))
    const sides = autoBalance(players, 4)
    expect([...sides.values()].filter((s) => s === 'home')).toHaveLength(2)
    // 0.9 + 0.2 against 0.8 + 0.3, not the two strongest together.
    expect(sides.get(0)).not.toBe(sides.get(1))
  })

  it('never moves a club member off their club side', () => {
    const sides = autoBalance(
      [
        { userId: 1, rating: 0.9, eligible: ['home'] },
        { userId: 2, rating: 0.9, eligible: ['home'] },
        { userId: 3, rating: 0.1, eligible: ['home', 'away'] },
        { userId: 4, rating: 0.1, eligible: ['home', 'away'] },
      ],
      4,
    )
    expect(sides).toEqual(new Map([[1, 'home'], [2, 'home'], [3, 'away'], [4, 'away']]))
  })

  it('rates a newcomer at the middle', () => {
    expect(balanceRating({ played: 0, wins: 0, draws: 0 })).toBe(0.5)
    expect(balanceRating({ played: 2, wins: 2, draws: 0 })).toBe(0.75)
  })
})

describe('score confirmation', () => {
  const host: ResultActor = { isHost: true, isAdmin: false, side: 'home', hostSide: 'home' }
  const rival: ResultActor = { isHost: false, isAdmin: false, side: 'away', hostSide: 'home' }
  const teammate: ResultActor = { isHost: false, isAdmin: false, side: 'home', hostSide: 'home' }
  const now = Date.parse('2026-10-14T12:00:00Z')
  const reported = { status: 'reported' as const, reportedAt: '2026-10-14T10:00:00Z' }

  it('lets the host report only after the game', () => {
    expect(nextResultStatus({ status: null, reportedAt: null }, 'report', host, false, now)).toEqual({ ok: false, code: 'GAME_NOT_FINISHED' })
    expect(nextResultStatus({ status: null, reportedAt: null }, 'report', host, true, now)).toEqual({ ok: true, status: 'reported' })
    expect(nextResultStatus({ status: null, reportedAt: null }, 'report', rival, true, now)).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it('needs the other side to confirm or dispute', () => {
    expect(nextResultStatus(reported, 'confirm', rival, true, now)).toEqual({ ok: true, status: 'confirmed' })
    expect(nextResultStatus(reported, 'dispute', rival, true, now)).toEqual({ ok: true, status: 'disputed' })
    expect(nextResultStatus(reported, 'confirm', teammate, true, now)).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it('sends a dispute back to the host and locks a confirmed score', () => {
    expect(nextResultStatus({ status: 'disputed', reportedAt: reported.reportedAt }, 'report', host, true, now)).toEqual({ ok: true, status: 'reported' })
    expect(nextResultStatus({ status: 'confirmed', reportedAt: null }, 'report', host, true, now)).toEqual({ ok: false, code: 'RESULT_LOCKED' })
    expect(nextResultStatus({ status: 'confirmed', reportedAt: null }, 'report', { ...host, isAdmin: true }, true, now)).toEqual({ ok: true, status: 'confirmed' })
  })

  it('confirms an undisputed report after 48 hours', () => {
    expect(effectiveResultStatus(reported, now)).toBe('reported')
    expect(effectiveResultStatus(reported, now + 48 * 3_600_000)).toBe('confirmed')
    expect(nextResultStatus(reported, 'dispute', rival, true, now + 48 * 3_600_000)).toEqual({ ok: false, code: 'NOTHING_TO_CONFIRM' })
  })
})

describe('summarize', () => {
  it('counts wins, draws, losses, goals, points and recent form', () => {
    const record = summarize([
      { side: 'home', homeScore: 3, awayScore: 1, scheduledAt: '2026-10-01T18:00:00Z' },
      { side: 'away', homeScore: 2, awayScore: 2, scheduledAt: '2026-10-03T18:00:00Z' },
      { side: 'away', homeScore: 4, awayScore: 0, scheduledAt: '2026-10-05T18:00:00Z' },
    ])
    expect(record).toEqual({
      played: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 1 / 3,
      scored: 5,
      conceded: 7,
      points: 4,
      form: ['loss', 'draw', 'win'],
    })
  })

  it('orders a table by points, then goal difference', () => {
    const a = summarize([{ side: 'home', homeScore: 1, awayScore: 0, scheduledAt: '2026-10-01T18:00:00Z' }])
    const b = summarize([{ side: 'home', homeScore: 5, awayScore: 0, scheduledAt: '2026-10-01T18:00:00Z' }])
    expect([a, b].sort(compareStandings)[0]).toBe(b)
    expect(summarize([]).winRate).toBe(0)
  })
})
