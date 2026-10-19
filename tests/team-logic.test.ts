import { describe, expect, it } from 'vitest'

import {
  afterMemberLeaves,
  applyAssignments,
  autoBalance,
  balanceRating,
  checkSides,
  clubSidesError,
  compareStandings,
  effectiveResultStatus,
  nextResultStatus,
  occupancy,
  parseCreateTeamBody,
  parseInviteEntries,
  parseInviteRequest,
  parseJoinTeamBody,
  parseResultBody,
  parseSideChoice,
  parseSidesBody,
  parseUpdateTeamBody,
  pickSide,
  resultCounts,
  summarize,
  summarizeBySport,
  type BalancePlayer,
  type SidePlayer,
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

describe('occupancy with drifted counters', () => {
  it('never counts negative guests', () => {
    expect(occupancy(10, ['home', 'away'], -2)).toEqual({ home: 1, away: 1 })
  })
})

describe('checkSides: the invariant every side change ends with', () => {
  const HOST = 1
  const rows = (sides: string): SidePlayer[] =>
    [...sides].map((s, i) => ({ userId: i + 1, side: s === 'h' ? 'home' : 'away', memberOf: [] }))

  it('passes a legal game and reports its counts', () => {
    expect(checkSides(OPEN, rows('hhaa'), 2, HOST)).toEqual({ ok: true, counts: { home: 4, away: 2 } })
  })

  it('catches a side over half after a host move', () => {
    const moved = applyAssignments(rows('hhhha'), [{ userId: 5, side: 'home' }])
    expect(moved.ok && checkSides(OPEN, moved.players, 0, HOST)).toEqual({ ok: true, counts: { home: 5, away: 0 } })
    const tooMany = applyAssignments(rows('hhhhha'), [{ userId: 6, side: 'home' }])
    expect(tooMany.ok && checkSides(OPEN, tooMany.players, 0, HOST)).toEqual({ ok: false, code: 'SIDE_FULL' })
  })

  it('catches a resize that leaves a side over half, guests included', () => {
    // 10 → 8 players: each side now holds 4, but five players already stand on home.
    expect(checkSides({ ...OPEN, maxPlayers: 8 }, rows('hhhhha'), 0, HOST)).toEqual({ ok: false, code: 'SIDE_FULL' })
    // Guests are no reason to refuse: they spill over to the other side.
    expect(checkSides({ ...OPEN, maxPlayers: 8 }, rows('hhha'), 2, HOST)).toEqual({ ok: true, counts: { home: 4, away: 2 } })
    expect(checkSides({ ...OPEN, maxPlayers: 8 }, rows('hhhha'), 4, HOST)).toEqual({ ok: false, code: 'SIDE_FULL' })
  })

  it('catches a club added to a side its players are not members of', () => {
    expect(checkSides(CLUB_VS_OPEN, rows('ha'), 0, HOST)).toEqual({ ok: false, code: 'NOT_A_MEMBER', userId: 1 })
    const members = rows('ha').map((p) => (p.side === 'home' ? { ...p, memberOf: [7] } : p))
    expect(checkSides(CLUB_VS_OPEN, members, 0, HOST).ok).toBe(true)
  })

  it('moves guests with the host', () => {
    const hostAway = rows('ah')
    expect(checkSides(OPEN, hostAway, 3, HOST)).toEqual({ ok: true, counts: { home: 1, away: 4 } })
  })

  it('refuses moving someone who is not in the game', () => {
    expect(applyAssignments(rows('ha'), [{ userId: 9, side: 'home' }])).toEqual({ ok: false, code: 'NOT_IN_GAME', userId: 9 })
  })

  it('agrees with autoBalance: a balance always passes the check when one exists', () => {
    const players: BalancePlayer[] = [0.9, 0.7, 0.6, 0.5, 0.4, 0.1].map((rating, i) => ({ userId: i + 1, rating, eligible: ['home', 'away'] }))
    const sides = autoBalance(players, 6)
    const balanced = players.map((p) => ({ userId: p.userId, side: sides.get(p.userId)!, memberOf: [] }))
    expect(checkSides({ ...OPEN, maxPlayers: 6 }, balanced, 0, HOST)).toEqual({ ok: true, counts: { home: 3, away: 3 } })
  })
})

describe('request bodies', () => {
  it('reads the join side, defaulting to random', () => {
    expect(parseSideChoice(undefined)).toBe('random')
    expect(parseSideChoice('away')).toBe('away')
    expect(parseSideChoice('both')).toBeNull()
  })

  it('reads a host move or a balance request', () => {
    expect(parseSidesBody({ balance: true })).toEqual({ ok: true, balance: true })
    expect(parseSidesBody({ assignments: [{ userId: 3, side: 'away' }] })).toEqual({
      ok: true,
      balance: false,
      assignments: [{ userId: 3, side: 'away' }],
    })
    expect(parseSidesBody({ assignments: [] })).toEqual({ ok: false })
    expect(parseSidesBody({ assignments: [{ userId: '3', side: 'away' }] })).toEqual({ ok: false })
    expect(parseSidesBody({ assignments: [{ userId: 3, side: 'middle' }] })).toEqual({ ok: false })
    expect(parseSidesBody(null)).toEqual({ ok: false })
  })

  it('accepts only whole scores in range', () => {
    expect(parseResultBody({ homeScore: 3, awayScore: 0 })).toEqual({ ok: true, homeScore: 3, awayScore: 0 })
    for (const bad of [{ homeScore: -1, awayScore: 0 }, { homeScore: 1.5, awayScore: 0 }, { homeScore: '2', awayScore: 1 }, { homeScore: 301, awayScore: 0 }, {}]) {
      expect(parseResultBody(bad)).toEqual({ ok: false })
    }
  })
})

describe('what counts toward stats', () => {
  const confirmed = { status: 'confirmed' as const, reportedAt: null }
  it('drops cancelled games and unconfirmed scores', () => {
    expect(resultCounts('finished', confirmed)).toBe(true)
    expect(resultCounts('cancelled', confirmed)).toBe(false)
    expect(resultCounts('finished', { status: 'disputed', reportedAt: null })).toBe(false)
    expect(resultCounts('finished', { status: null, reportedAt: null })).toBe(false)
  })

  it('keeps every sport in the per-sport breakdown', () => {
    const bySport = summarizeBySport(
      [{ sport: 'tennis', side: 'home', homeScore: 2, awayScore: 1, scheduledAt: '2026-10-01T18:00:00Z' }],
      ['football', 'tennis'],
    )
    expect(bySport.map((row) => [row.sport, row.wins])).toEqual([['football', 0], ['tennis', 1]])
  })
})

describe('clubs', () => {
  it('checks a game\'s clubs against its sport and each other', () => {
    expect(clubSidesError('football', { id: 1, sport: 'football' }, { id: 2, sport: 'football' })).toBeNull()
    expect(clubSidesError('football', { id: 1, sport: 'tennis' }, null)).toBe('TEAM_SPORT_MISMATCH')
    expect(clubSidesError('football', { id: 1, sport: 'football' }, { id: 1, sport: 'football' })).toBe('SAME_TEAM')
  })

  it('hands the captaincy to the longest-standing member', () => {
    expect(afterMemberLeaves([5, 8, 9], 5, 5)).toEqual({ members: [8, 9], captainId: 8 })
    expect(afterMemberLeaves([5, 8, 9], 5, 9)).toEqual({ members: [5, 8], captainId: 5 })
    expect(afterMemberLeaves([5], 5, 5)).toEqual({ members: [], captainId: null })
  })
})

describe('club requests', () => {
  it('parses a new club: a trimmed name of 2 to 40 characters and a known sport', () => {
    expect(parseCreateTeamBody({ name: '  Qarabağ   Veteranlar ', sport: 'football' })).toEqual({ ok: true, name: 'Qarabağ Veteranlar', sport: 'football' })
    for (const body of [{ name: 'A', sport: 'football' }, { name: 'x'.repeat(41), sport: 'football' }, { name: '   ', sport: 'tennis' }, { sport: 'tennis' }, null]) {
      expect(parseCreateTeamBody(body)).toEqual({ ok: false, code: 'INVALID_NAME' })
    }
    expect(parseCreateTeamBody({ name: 'Duo', sport: 'chess' })).toEqual({ ok: false, code: 'INVALID_SPORT' })
  })

  it('parses an edit: a new name and/or a new invite code, nothing else', () => {
    expect(parseUpdateTeamBody({ name: ' Yeni ad ' })).toEqual({ ok: true, name: 'Yeni ad', regenerateInviteCode: false })
    expect(parseUpdateTeamBody({ regenerateInviteCode: true })).toEqual({ ok: true, name: undefined, regenerateInviteCode: true })
    expect(parseUpdateTeamBody({ name: 'A' })).toEqual({ ok: false, code: 'INVALID_NAME' })
    for (const body of [{}, null, { regenerateInviteCode: false }, { regenerateInviteCode: 'yes' }]) {
      expect(parseUpdateTeamBody(body)).toEqual({ ok: false, code: 'INVALID_TEAM' })
    }
  })

  it('parses an invite code: a short non-empty string', () => {
    expect(parseJoinTeamBody({ code: 'abc_123-XYZ' })).toEqual({ ok: true, code: 'abc_123-XYZ' })
    for (const body of [{}, null, { code: '' }, { code: 5 }, { code: 'x'.repeat(65) }]) {
      expect(parseJoinTeamBody(body)).toEqual({ ok: false })
    }
  })
})

describe('invite requests', () => {
  it('reads the create body\'s invites: none, or one entry per player', () => {
    expect(parseInviteEntries(undefined)).toEqual({ ok: true, entries: [] })
    expect(parseInviteEntries(null)).toEqual({ ok: true, entries: [] })
    expect(parseInviteEntries([])).toEqual({ ok: true, entries: [] })
    expect(parseInviteEntries([{ userId: 4, side: 'away' }, { userId: 9, side: 'home' }])).toEqual({
      ok: true,
      entries: [{ userId: 4, side: 'away' }, { userId: 9, side: 'home' }],
    })
  })

  it('refuses anything else instead of trimming it', () => {
    const bad: unknown[] = [
      'all',
      {},
      [null],
      [{ userId: 4 }],
      [{ userId: 4, side: 'middle' }],
      [{ userId: '4', side: 'home' }],
      [{ userId: 0, side: 'home' }],
      [{ userId: 1.5, side: 'home' }],
      [{ userId: 4, side: 'home' }, { userId: 4, side: 'away' }],
      Array.from({ length: 22 }, (_, i) => ({ userId: i + 1, side: 'home' })),
    ]
    for (const value of bad) expect(parseInviteEntries(value), JSON.stringify(value)).toEqual({ ok: false })
    expect(parseInviteEntries(Array.from({ length: 21 }, (_, i) => ({ userId: i + 1, side: 'home' }))).ok).toBe(true)
  })

  it('tells one player from a whole club', () => {
    expect(parseInviteRequest({ userId: 4, side: 'away' })).toEqual({ ok: true, club: false, entry: { userId: 4, side: 'away' } })
    expect(parseInviteRequest({ clubSide: 'home' })).toEqual({ ok: true, club: true, side: 'home' })
    for (const body of [null, {}, { clubSide: 'both' }, { userId: 4 }, { userId: 4, side: 'x' }]) {
      expect(parseInviteRequest(body), JSON.stringify(body)).toEqual({ ok: false })
    }
  })
})
