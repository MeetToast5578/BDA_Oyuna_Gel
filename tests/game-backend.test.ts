import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  countOpenGamesBySport,
  deriveAvailability,
  foldForSearch,
  formatBakuLabel,
  formatBakuMonthYear,
  formatBakuShortDate,
  initialsOf,
  isUpcoming,
  normalizeCity,
  normalizeGameRecord,
  normalizePhone,
  parseCoordinates,
  parseCreateGameBody,
  parseEditGameBody,
  parseGameListParams,
  parseMyGamesParams,
  parseProfileTabs,
  parseProfileUpdate,
  profileTabsQuery,
  rankFeatured,
  startOfBakuDay,
  toGameCard,
  toPlayer,
} from '@/lib/game-backend'
import {
  addDays,
  addMonths,
  DIAL_RINGS,
  dialValue,
  formatDateInput,
  formatDateText,
  formatTimeInput,
  formatTimeText,
  monthCells,
  parseDateText,
  parseTimeText,
} from '@/lib/date-input'
import { formatLocalPhone } from '@/lib/phone'

const HOUR_MS = 60 * 60 * 1000
// Sunday 13 September 2026, 14:00 in Baku.
const NOW = Date.parse('2026-09-13T10:00:00Z')
const inHours = (hours: number) => new Date(NOW + hours * HOUR_MS).toISOString()

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('deriveAvailability', () => {
  const game = (overrides: Record<string, unknown> = {}) => ({
    status: 'scheduled',
    scheduledAt: inHours(3),
    maxPlayers: 10,
    availablePlayers: 5,
    ...overrides,
  })

  it('is full with 0 spots left', () => {
    expect(deriveAvailability(game({ availablePlayers: 0 }), NOW)).toEqual({
      status: 'full',
      remainingSpots: 0,
      currentCount: 10,
      maxCount: 10,
    })
  })

  it('is open with exactly 1 spot left', () => {
    expect(deriveAvailability(game({ availablePlayers: 1 }), NOW)).toEqual({
      status: 'open',
      remainingSpots: 1,
      currentCount: 9,
      maxCount: 10,
    })
  })

  it('caps overflowing availablePlayers at maxPlayers', () => {
    expect(deriveAvailability(game({ availablePlayers: 15 }), NOW)).toEqual({
      status: 'open',
      remainingSpots: 10,
      currentCount: 0,
      maxCount: 10,
    })
  })

  it('treats negative or non-numeric counts as no spots', () => {
    expect(deriveAvailability(game({ availablePlayers: -3 }), NOW).status).toBe('full')
    expect(deriveAvailability(game({ availablePlayers: 'abc' }), NOW).remainingSpots).toBe(0)
    expect(deriveAvailability(game({ maxPlayers: null, availablePlayers: 4 }), NOW)).toMatchObject({
      status: 'full',
      remainingSpots: 0,
      maxCount: 0,
    })
  })

  it('defaults a missing availablePlayers to every spot free', () => {
    expect(deriveAvailability(game({ availablePlayers: undefined }), NOW).remainingSpots).toBe(10)
  })

  it('is live from its start for the sport\'s usual length, then finished — no job needed', () => {
    const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
    // Football lasts 90 minutes.
    expect(deriveAvailability(game({ sport: 'football', scheduledAt: new Date(NOW).toISOString() }), NOW).status).toBe('live')
    expect(deriveAvailability(game({ sport: 'football', scheduledAt: minutesAgo(89) }), NOW).status).toBe('live')
    expect(deriveAvailability(game({ sport: 'football', scheduledAt: minutesAgo(90) }), NOW).status).toBe('finished')
    // Basketball, 60.
    expect(deriveAvailability(game({ sport: 'basketball', scheduledAt: minutesAgo(59) }), NOW).status).toBe('live')
    expect(deriveAvailability(game({ sport: 'basketball', scheduledAt: minutesAgo(61) }), NOW).status).toBe('finished')
    // A week-old game that nobody touched since it was created is simply over.
    expect(deriveAvailability(game({ scheduledAt: inHours(-24 * 7) }), NOW).status).toBe('finished')
  })

  it('keeps a stored cancellation over the clock', () => {
    expect(deriveAvailability(game({ status: 'cancelled', scheduledAt: inHours(-1) }), NOW).status).toBe('cancelled')
  })

  it.each(['cancelled', 'finished', 'live'])('keeps the %s status even with spots left', (status) => {
    expect(deriveAvailability(game({ status }), NOW).status).toBe(status)
  })

  it('ends a stored live status with the clock, like any other game', () => {
    const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
    const live = (overrides: Record<string, unknown>) => deriveAvailability(game({ status: 'live', ...overrides }), NOW).status
    expect(live({ sport: 'basketball', scheduledAt: minutesAgo(30) })).toBe('live')
    // The seed's "live" game, hours later: over, not "Davam edir".
    expect(live({ sport: 'basketball', scheduledAt: minutesAgo(61) })).toBe('finished')
    expect(live({ sport: 'football', scheduledAt: inHours(-24) })).toBe('finished')
    // Set live before its start time: it holds until the sport's usual end after that start.
    expect(live({ sport: 'football', scheduledAt: inHours(1) })).toBe('live')
    expect(live({ scheduledAt: undefined })).toBe('live')
  })
})

describe('formatBakuLabel', () => {
  it('labels today, tomorrow, this week and later in Baku time', () => {
    const now = new Date(NOW)
    expect(formatBakuLabel('2026-09-13T13:00:00Z', now)).toBe('Bu gün · 17:00')
    expect(formatBakuLabel('2026-09-14T15:30:00Z', now)).toBe('Sabah · 19:30')
    expect(formatBakuLabel('2026-09-17T13:00:00Z', now)).toBe('Cümə axşamı · 17:00')
    expect(formatBakuLabel('2026-10-01T13:00:00Z', now)).toBe('1 oktyabr · 17:00')
  })

  it('uses the Baku calendar day, not the UTC one', () => {
    // 20:30 UTC on the 13th is already 00:30 on the 14th in Baku.
    expect(formatBakuLabel('2026-09-13T20:30:00Z', new Date(NOW))).toBe('Sabah · 00:30')
    // At 01:00 Baku (21:00 UTC the previous day), a 02:00 Baku game is today.
    expect(formatBakuLabel('2026-09-13T22:00:00Z', new Date('2026-09-13T21:00:00Z'))).toBe('Bu gün · 02:00')
  })

  it('handles missing and invalid dates', () => {
    expect(formatBakuLabel(null)).toBe('Təyin edilmədi')
    expect(formatBakuLabel('not a date')).toBe('Təyin edilmədi')
  })
})

describe('formatBakuShortDate', () => {
  it('formats "Cüm, 2 Avq" style dates on the Baku calendar day', () => {
    expect(formatBakuShortDate('2026-08-02T16:00:00Z')).toBe('Baz, 2 Avq')
    // 21:30 UTC Thursday is 01:30 Friday in Baku.
    expect(formatBakuShortDate('2026-09-17T21:30:00Z')).toBe('Cüm, 18 Sen')
    expect(formatBakuShortDate(null)).toBeNull()
  })
})

describe('formatBakuMonthYear', () => {
  it('names the month of the Baku calendar day', () => {
    expect(formatBakuMonthYear('2026-02-11T09:12:00Z')).toBe('fevral 2026')
    // 21:00 UTC on 31 January is 01:00 on 1 February in Baku.
    expect(formatBakuMonthYear('2026-01-31T21:00:00Z')).toBe('fevral 2026')
    // And the year turns over on Baku's New Year's Eve, not London's.
    expect(formatBakuMonthYear('2025-12-31T20:30:00Z')).toBe('yanvar 2026')
    expect(formatBakuMonthYear(null)).toBeNull()
    expect(formatBakuMonthYear('not a date')).toBeNull()
  })
})

describe('startOfBakuDay', () => {
  it('returns midnight in Baku', () => {
    expect(startOfBakuDay(new Date(NOW)).toISOString()).toBe('2026-09-12T20:00:00.000Z')
    expect(startOfBakuDay(new Date(NOW), 2).toISOString()).toBe('2026-09-14T20:00:00.000Z')
  })
})

describe('countOpenGamesBySport', () => {
  it('counts only open games and lists every sport', () => {
    expect(
      countOpenGamesBySport([
        { sport: 'football', status: 'open' },
        { sport: 'football', status: 'open' },
        { sport: 'football', status: 'full' },
        { sport: 'tennis', status: 'live' },
        { sport: 'curling', status: 'open' },
      ]),
    ).toEqual([
      { sport: 'football', label: 'Futbol', iconKey: 'football', openGamesCount: 2 },
      { sport: 'basketball', label: 'Basketbol', iconKey: 'basketball', openGamesCount: 0 },
      { sport: 'tennis', label: 'Tennis', iconKey: 'tennis', openGamesCount: 0 },
    ])
  })
})

describe('isUpcoming', () => {
  it('is true only before the start', () => {
    expect(isUpcoming('open')).toBe(true)
    expect(isUpcoming('full')).toBe(true)
    for (const status of ['live', 'finished', 'cancelled'] as const) expect(isUpcoming(status)).toBe(false)
  })
})

describe('rankFeatured', () => {
  const game = (id: string, hours: number, currentCount: number, status: 'open' | 'full' | 'live' = 'open') => ({
    id,
    status,
    startsAt: inHours(hours),
    currentCount,
    maxCount: 10,
  })

  it('ranks sooner and fuller games first and skips unjoinable ones', () => {
    const ranked = rankFeatured(
      [
        game('far-empty', 150, 0),
        game('soon-half', 2, 5),
        game('soon-almost-full', 2, 9),
        game('full', 1, 10, 'full'),
        game('started', -1, 5, 'live'),
      ],
      NOW,
    )
    expect(ranked.map((g) => g.id)).toEqual(['soon-almost-full', 'soon-half', 'far-empty'])
  })

  it('returns at most the limit', () => {
    const games = Array.from({ length: 12 }, (_, i) => game(`g${i}`, i + 1, 3))
    expect(rankFeatured(games, NOW)).toHaveLength(8)
    expect(rankFeatured(games, NOW, 3).map((g) => g.id)).toEqual(['g0', 'g1', 'g2'])
  })
})

describe('normalizeCity', () => {
  it('defaults to Baku and accepts its spellings', () => {
    expect(normalizeCity(null)).toBe('baku')
    expect(normalizeCity('')).toBe('baku')
    expect(normalizeCity('Bakı')).toBe('baku')
    expect(normalizeCity('BAKI')).toBe('baku')
    expect(normalizeCity('baku')).toBe('baku')
  })

  it('rejects unknown cities', () => {
    expect(normalizeCity('Gəncə')).toBeNull()
  })
})

describe('parseCoordinates', () => {
  it('parses "lat,lng" and rejects invalid values', () => {
    expect(parseCoordinates('40.3755, 49.8335')).toEqual({ lat: 40.3755, lng: 49.8335 })
    expect(parseCoordinates('40.3755')).toBeNull()
    expect(parseCoordinates('95,49')).toBeNull()
    expect(parseCoordinates(null)).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('accepts Azerbaijani numbers in common formats', () => {
    expect(normalizePhone('+994 50 210 34 56')).toBe('+994502103456')
    expect(normalizePhone('050 210 34 56')).toBe('+994502103456')
    expect(normalizePhone('994-50-210-34-56')).toBe('+994502103456')
  })

  it('rejects anything else', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('+7 999 123 45 67')).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
})

describe('formatLocalPhone', () => {
  it('groups the digits after +994 as they are typed', () => {
    expect(formatLocalPhone('7')).toBe('7')
    expect(formatLocalPhone('775')).toBe('77 5')
    expect(formatLocalPhone('775386')).toBe('77 538 6')
    expect(formatLocalPhone('775386004')).toBe('77 538 60 04')
    expect(formatLocalPhone('77 538 60 049')).toBe('77 538 60 04')
  })

  it('drops pasted or autofilled prefixes', () => {
    expect(formatLocalPhone('+994 77 538 60 04')).toBe('77 538 60 04')
    expect(formatLocalPhone('+994775386004')).toBe('77 538 60 04')
    expect(formatLocalPhone('077 538 60 04')).toBe('77 538 60 04')
    // A local number that happens to start with 994 (Bakcell 99) is kept.
    expect(formatLocalPhone('994123456')).toBe('99 412 34 56')
  })

  it('round-trips through normalizePhone', () => {
    expect(normalizePhone(`+994 ${formatLocalPhone('77abc5386004')}`)).toBe('+994775386004')
  })
})

describe('typed date and time', () => {
  it('reads a date in the chosen order, with any separator and 2- or 4-digit years', () => {
    expect(parseDateText('19.09.2026', 'dd.mm.yyyy')).toBe('2026-09-19')
    expect(parseDateText('19/9/26', 'dd.mm.yyyy')).toBe('2026-09-19')
    expect(parseDateText('19 09 2026', 'dd/mm/yyyy')).toBe('2026-09-19')
    expect(parseDateText('09/19/2026', 'mm/dd/yyyy')).toBe('2026-09-19')
    expect(parseDateText('2026-09-19', 'yyyy-mm-dd')).toBe('2026-09-19')
    // The same text means a different day depending on the format.
    expect(parseDateText('01/02/2026', 'dd/mm/yyyy')).toBe('2026-02-01')
    expect(parseDateText('01/02/2026', 'mm/dd/yyyy')).toBe('2026-01-02')
  })

  it('rejects dates that do not exist or are incomplete', () => {
    expect(parseDateText('31.02.2026', 'dd.mm.yyyy')).toBeNull()
    expect(parseDateText('19.13.2026', 'dd.mm.yyyy')).toBeNull()
    expect(parseDateText('19.09', 'dd.mm.yyyy')).toBeNull()
    expect(parseDateText('19.09.202', 'dd.mm.yyyy')).toBeNull()
    expect(parseDateText('sabah', 'dd.mm.yyyy')).toBeNull()
  })

  it('formats a date back in every format', () => {
    expect(formatDateText('2026-09-05', 'dd.mm.yyyy')).toBe('05.09.2026')
    expect(formatDateText('2026-09-05', 'mm/dd/yyyy')).toBe('09/05/2026')
    expect(formatDateText('2026-09-05', 'yyyy-mm-dd')).toBe('2026-09-05')
  })

  it('reads 24-hour and AM/PM times', () => {
    expect(parseTimeText('19:30', '24h')).toBe('19:30')
    expect(parseTimeText('19.30', '24h')).toBe('19:30')
    expect(parseTimeText('1930', '24h')).toBe('19:30')
    expect(parseTimeText('7', '24h')).toBe('07:00')
    expect(parseTimeText('7:30 PM', '12h')).toBe('19:30')
    expect(parseTimeText('7pm', '12h')).toBe('19:00')
    expect(parseTimeText('12:15 a.m.', '12h')).toBe('00:15')
    expect(parseTimeText('12 PM', '24h')).toBe('12:00')
    // In the 12-hour format, 19:30 is still unambiguous; 7:30 without AM/PM is not.
    expect(parseTimeText('19:30', '12h')).toBe('19:30')
    expect(parseTimeText('7:30', '12h')).toBeNull()
  })

  it('lays a month out Monday first, with month and year rollover', () => {
    // 1 September 2026 is a Tuesday: one blank, then 30 days.
    const september = monthCells('2026-09')
    expect(september.slice(0, 2)).toEqual([null, '2026-09-01'])
    expect(september.filter(Boolean)).toHaveLength(30)
    expect(monthCells('2028-02').filter(Boolean)).toHaveLength(29)
    expect(monthCells('2026-06')[0]).toBe('2026-06-01') // a Monday: no blanks
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('reads the time dial like an Android clock', () => {
    const at = (degrees: number, radius = DIAL_RINGS.outer) => {
      const radians = (degrees * Math.PI) / 180
      return [radius * Math.sin(radians), -radius * Math.cos(radians)] as const
    }
    // 24 saat: 12 and 1–11 outside, 00 and 13–23 inside.
    expect(dialValue(...at(0), 'hour', '24h', false)).toBe(12)
    expect(dialValue(...at(0, DIAL_RINGS.inner), 'hour', '24h', false)).toBe(0)
    expect(dialValue(...at(90), 'hour', '24h', false)).toBe(3)
    expect(dialValue(...at(90, DIAL_RINGS.inner), 'hour', '24h', false)).toBe(15)
    expect(dialValue(...at(205, DIAL_RINGS.inner), 'hour', '24h', false)).toBe(19) // 205° is nearer 7 than 6
    // 12 saat: one ring, in the half AM/PM shows.
    expect(dialValue(...at(0), 'hour', '12h', false)).toBe(0)
    expect(dialValue(...at(0), 'hour', '12h', true)).toBe(12)
    expect(dialValue(...at(210, DIAL_RINGS.inner), 'hour', '12h', true)).toBe(19)
    // Minutes snap to 5, and just before the top is :00, not :60.
    expect(dialValue(...at(180), 'minute', '24h', false)).toBe(30)
    expect(dialValue(...at(270), 'minute', '12h', true)).toBe(45)
    expect(dialValue(...at(356), 'minute', '24h', false)).toBe(0)
  })

  it('masks a date as it is typed, in the chosen format', () => {
    // Separators appear on their own, so the user only types digits.
    expect(formatDateInput('1', 'dd.mm.yyyy')).toBe('1')
    expect(formatDateInput('19', 'dd.mm.yyyy')).toBe('19')
    expect(formatDateInput('190', 'dd.mm.yyyy')).toBe('19.0')
    expect(formatDateInput('19092026', 'dd.mm.yyyy')).toBe('19.09.2026')
    // Each format groups and punctuates the same digits its own way.
    expect(formatDateInput('19092026', 'dd/mm/yyyy')).toBe('19/09/2026')
    expect(formatDateInput('20260919', 'yyyy-mm-dd')).toBe('2026-09-19')
    expect(formatDateInput('2026', 'yyyy-mm-dd')).toBe('2026')
    expect(formatDateInput('202609', 'yyyy-mm-dd')).toBe('2026-09')
    // Typing or pasting other punctuation lands on the same text.
    expect(formatDateInput('19/09/2026', 'dd.mm.yyyy')).toBe('19.09.2026')
    expect(formatDateInput('19.09.2026', 'yyyy-mm-dd')).toBe('1909-20-26')
    // A separator typed after a full part is kept, so it does not vanish under the caret.
    expect(formatDateInput('19.', 'dd.mm.yyyy')).toBe('19.')
    expect(formatDateInput('19.09.', 'dd.mm.yyyy')).toBe('19.09.')
    // Overtyping past the end is dropped rather than shifting the parts along.
    expect(formatDateInput('190920269999', 'dd.mm.yyyy')).toBe('19.09.2026')
    expect(formatDateInput('', 'dd.mm.yyyy')).toBe('')
  })

  it('masks a time as it is typed', () => {
    expect(formatTimeInput('1')).toBe('1')
    expect(formatTimeInput('19')).toBe('19')
    expect(formatTimeInput('193')).toBe('19:3')
    expect(formatTimeInput('1930')).toBe('19:30')
    // Two digits lead only when they could be an hour, so these are 7:3 and 7:30, not 73:0.
    expect(formatTimeInput('73')).toBe('7:3')
    expect(formatTimeInput('730')).toBe('7:30')
    expect(formatTimeInput('0730')).toBe('07:30')
    // A typed separator decides the split, so half past two stays half past two.
    expect(formatTimeInput('2:30')).toBe('2:30')
    expect(formatTimeInput('19:30')).toBe('19:30')
    expect(formatTimeInput('19.30')).toBe('19:30')
    expect(formatTimeInput('7:')).toBe('7:')
    // AM/PM is only upper-cased, never completed, so backspace can still remove it.
    expect(formatTimeInput('7:30 p')).toBe('7:30 P')
    expect(formatTimeInput('7:30 pm')).toBe('7:30 PM')
    expect(formatTimeInput('7:30 ')).toBe('7:30')
    expect(formatTimeInput('')).toBe('')
  })

  it('hands the mask back to the parser, so what is typed is what is read', () => {
    expect(parseDateText(formatDateInput('19092026', 'dd.mm.yyyy'), 'dd.mm.yyyy')).toBe('2026-09-19')
    expect(parseDateText(formatDateInput('09192026', 'mm/dd/yyyy'), 'mm/dd/yyyy')).toBe('2026-09-19')
    expect(parseTimeText(formatTimeInput('730'), '24h')).toBe('07:30')
    expect(parseTimeText(formatTimeInput('1930'), '24h')).toBe('19:30')
    expect(parseTimeText(formatTimeInput('7:30 pm'), '12h')).toBe('19:30')
  })

  it('rejects impossible times', () => {
    expect(parseTimeText('24:00', '24h')).toBeNull()
    expect(parseTimeText('19:60', '24h')).toBeNull()
    expect(parseTimeText('13 PM', '12h')).toBeNull()
    expect(parseTimeText('axşam', '24h')).toBeNull()
  })

  it('formats a time back in either format', () => {
    expect(formatTimeText('19:30', '12h')).toBe('7:30 PM')
    expect(formatTimeText('00:05', '12h')).toBe('12:05 AM')
    expect(formatTimeText('12:00', '12h')).toBe('12:00 PM')
    expect(formatTimeText('19:30', '24h')).toBe('19:30')
  })
})

describe('foldForSearch', () => {
  it('matches regardless of case, dotted/dotless i and Azerbaijani letters', () => {
    expect(foldForSearch('Inter Arena')).toBe('inter arena')
    expect(foldForSearch('İNTER')).toBe('inter')
    expect(foldForSearch('ınter')).toBe('inter')
    expect(foldForSearch('Nərimanov')).toBe('nerimanov')
    expect(foldForSearch('Şüvəlan Göyçay')).toBe('suvelan goycay')
    expect(foldForSearch('Inter Arena').includes(foldForSearch('inter'))).toBe(true)
  })
})

describe('initialsOf', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('Elvin Məmmədov')).toBe('EM')
    expect(initialsOf('Aysel Nuri Qasımova')).toBe('AN')
    expect(initialsOf('  ')).toBe('?')
  })
})

describe('toPlayer', () => {
  it("names a player after their account, so the list matches the profile it opens", () => {
    const player = toPlayer({
      name: 'Rəşad (qapıçı)',
      user: { id: 7, fullName: 'Rəşad Babayev', profilePicture: { url: '/api/media/file/resad.png' } },
    })
    expect(player).toEqual({ id: '7', name: 'Rəşad Babayev', initials: 'RB', avatarUrl: '/api/media/file/resad.png' })
  })

  it('falls back to the name typed into the join form, then to a placeholder', () => {
    expect(toPlayer({ name: '  Günel Hüseynova ', user: { id: 3, fullName: '  ' } })).toMatchObject({
      id: '3',
      name: 'Günel Hüseynova',
      initials: 'GH',
    })
    expect(toPlayer({ user: { id: 4 } })).toMatchObject({ name: 'OyunaGəl istifadəçisi', initials: 'Oİ' })
  })

  it('keeps the account id when the relationship is not populated', () => {
    expect(toPlayer({ name: 'Ramil', user: 12 })).toMatchObject({ id: '12', name: 'Ramil', avatarUrl: null })
  })

  it('has no profile to link to once the account is gone', () => {
    expect(toPlayer({ name: 'Səbinə Əliyeva', user: null })).toEqual({
      id: null,
      name: 'Səbinə Əliyeva',
      initials: 'SƏ',
      avatarUrl: null,
    })
  })
})

describe('parseGameListParams', () => {
  const parse = (query: string) => parseGameListParams(new URLSearchParams(query), new Date(NOW))

  it('defaults to open-or-full games from now until the end of tomorrow in Baku', () => {
    expect(parse('')).toEqual({
      ok: true,
      query: {
        when: 'upcoming',
        sport: null,
        city: 'baku',
        from: new Date(NOW),
        to: new Date('2026-09-14T20:00:00.000Z'),
        onlyOpen: false,
        page: 1,
        limit: 12,
      },
    })
  })

  it('clamps paging and never starts in the past', () => {
    const result = parse('page=0&limit=500&from=2026-01-01T00:00:00Z&status=open&sport=tennis')
    expect(result).toMatchObject({ ok: true, query: { page: 1, limit: 50, from: new Date(NOW), onlyOpen: true, sport: 'tennis' } })
  })

  it('rejects invalid input', () => {
    expect(parse('sport=curling')).toMatchObject({ ok: false, code: 'INVALID_SPORT' })
    expect(parse('city=Paris')).toMatchObject({ ok: false, code: 'UNKNOWN_CITY' })
    expect(parse('to=tomorrow')).toMatchObject({ ok: false, code: 'INVALID_DATE' })
    expect(parse('status=full')).toMatchObject({ ok: false, code: 'INVALID_STATUS' })
    expect(parse('when=later')).toMatchObject({ ok: false, code: 'INVALID_WINDOW' })
  })

  it('switches to the games that already happened with when=past', () => {
    expect(parse('when=past&sport=football&page=2')).toMatchObject({
      ok: true,
      query: { when: 'past', sport: 'football', page: 2, limit: 12 },
    })
  })
})

describe('parseCreateGameBody', () => {
  // The "Yeni Oyun Yarat" form as the design shows it: labels, strings, Baku local time.
  const form = {
    sport: 'Futbol',
    level: 'Orta',
    venueId: '3',
    scheduledDate: '2026-09-14',
    scheduledTime: '19:00',
    currentCount: '2',
    maxCount: '10',
    hostPhone: '+994 50 210 34 56',
  }
  const parse = (overrides: Record<string, unknown> = {}) => parseCreateGameBody({ ...form, ...overrides }, new Date(NOW))

  it('accepts the form and treats currentCount as players already in', () => {
    expect(parse()).toEqual({
      ok: true,
      input: {
        title: 'Futbol oyunu',
        sport: 'football',
        level: 'medium',
        venueId: 3,
        scheduledAt: new Date('2026-09-14T15:00:00.000Z'),
        maxCount: 10,
        currentCount: 2,
        contactPhone: '+994502103456',
      },
    })
  })

  it('accepts stored values, a custom title and no phone', () => {
    expect(
      parse({ sport: 'tennis', level: 'high', title: '  Axşam tennisi ', hostPhone: '', maxCount: 4, currentCount: undefined }),
    ).toMatchObject({
      ok: true,
      input: { sport: 'tennis', level: 'high', title: 'Axşam tennisi', maxCount: 4, currentCount: 1, contactPhone: null },
    })
  })

  it("limits max players to an even number up to the sport's full size", () => {
    expect(parse({ maxCount: 22 })).toMatchObject({ ok: true, input: { maxCount: 22 } })
    expect(parse({ maxCount: 24 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
    expect(parse({ maxCount: 11 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
    expect(parse({ sport: 'basketball', maxCount: 10 })).toMatchObject({ ok: true })
    expect(parse({ sport: 'basketball', maxCount: 12 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
    expect(parse({ sport: 'tennis', maxCount: 4 })).toMatchObject({ ok: true })
    expect(parse({ sport: 'tennis', maxCount: 6 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
    expect(parse({ sport: 'tennis', maxCount: 3, currentCount: 1 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
  })

  it('always counts the host as the first player', () => {
    expect(parse({ currentCount: 0 })).toMatchObject({ ok: true, input: { currentCount: 1 } })
    expect(parse({ maxCount: 2, currentCount: 0 })).toMatchObject({ ok: true, input: { maxCount: 2, currentCount: 1 } })
    expect(parse({ maxCount: 1, currentCount: 0 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
  })

  it('rejects invalid forms', () => {
    expect(parse({ sport: 'curling' })).toMatchObject({ ok: false, code: 'INVALID_SPORT' })
    expect(parse({ level: 'pro' })).toMatchObject({ ok: false, code: 'INVALID_LEVEL' })
    expect(parse({ venueId: undefined })).toMatchObject({ ok: false, code: 'INVALID_VENUE' })
    expect(parse({ scheduledTime: '7pm' })).toMatchObject({ ok: false, code: 'INVALID_DATE' })
    expect(parse({ scheduledDate: '2026-09-13', scheduledTime: '13:00' })).toMatchObject({ ok: false, code: 'DATE_IN_PAST' })
    expect(parse({ maxCount: 0 })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
    expect(parse({ currentCount: 10 })).toMatchObject({ ok: false, code: 'INVALID_CURRENT_COUNT' })
    expect(parse({ currentCount: -1 })).toMatchObject({ ok: false, code: 'INVALID_CURRENT_COUNT' })
    expect(parse({ hostPhone: '12345' })).toMatchObject({ ok: false, code: 'INVALID_PHONE' })
    expect(parseCreateGameBody(null, new Date(NOW))).toMatchObject({ ok: false, code: 'INVALID_SPORT' })
  })
})

describe('parseEditGameBody', () => {
  // Same form as create, minus the participant count: on edit that is whoever has joined.
  const form = {
    sport: 'Futbol',
    level: 'Orta',
    venueId: '3',
    scheduledDate: '2026-09-14',
    scheduledTime: '19:00',
    maxCount: '10',
    hostPhone: '+994 50 210 34 56',
  }
  const parse = (currentCount: number, overrides: Record<string, unknown> = {}) =>
    parseEditGameBody({ ...form, ...overrides }, currentCount, new Date(NOW))

  it('keeps the players already in rather than reading a count from the form', () => {
    const result = parse(4, { currentCount: '1' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.input.currentCount).toBe(4)
    expect(result.ok && result.input.maxCount).toBe(10)
  })

  it('allows resizing down to exactly the players already in', () => {
    const result = parse(10, { maxCount: '10' })
    expect(result.ok).toBe(true)
  })

  it('refuses a size below the players already in', () => {
    const result = parse(8, { maxCount: '6' })
    expect(result).toMatchObject({ ok: false, code: 'MAX_COUNT_BELOW_PLAYERS' })
  })

  it('still refuses a past date and a sport the size does not fit', () => {
    expect(parse(2, { scheduledDate: '2026-09-12' })).toMatchObject({ ok: false, code: 'DATE_IN_PAST' })
    // Tennis tops out at 4 players, so a 10-player game cannot become tennis.
    expect(parse(2, { sport: 'Tennis' })).toMatchObject({ ok: false, code: 'INVALID_MAX_COUNT' })
  })
})

describe('parseMyGamesParams', () => {
  const parse = (query: string) => parseMyGamesParams(new URLSearchParams(query))

  it('defaults to the upcoming games the viewer joined', () => {
    expect(parse('')).toEqual({ ok: true, value: { role: 'joined', when: 'upcoming', page: 1, limit: 12 } })
  })

  it('accepts hosting and past', () => {
    const result = parse('role=hosting&when=past&page=3&limit=5')
    expect(result).toMatchObject({ ok: true, value: { role: 'hosting', when: 'past', page: 3, limit: 5 } })
  })

  it('rejects an unknown role or window', () => {
    expect(parse('role=everything')).toMatchObject({ ok: false, code: 'INVALID_ROLE' })
    expect(parse('when=someday')).toMatchObject({ ok: false, code: 'INVALID_WINDOW' })
  })

  it('clamps the page size to the shared list limits', () => {
    expect(parse('limit=9999')).toMatchObject({ ok: true, value: { limit: 50 } })
    expect(parse('limit=0&page=-4')).toMatchObject({ ok: true, value: { limit: 1, page: 1 } })
  })
})

describe('parseProfileTabs / profileTabsQuery', () => {
  it('reads the tab from the query and falls back to joined, upcoming', () => {
    expect(parseProfileTabs({})).toEqual({ role: 'joined', when: 'upcoming' })
    expect(parseProfileTabs({ games: 'hosting', when: 'past' })).toEqual({ role: 'hosting', when: 'past' })
    // A mistyped or repeated parameter opens the default tab rather than an error page.
    expect(parseProfileTabs({ games: 'everything', when: ['past', 'upcoming'] })).toEqual({
      role: 'joined',
      when: 'upcoming',
    })
  })

  it('leaves the defaults out of the URL', () => {
    expect(profileTabsQuery({ role: 'joined', when: 'upcoming' })).toBe('')
    expect(profileTabsQuery({ role: 'hosting', when: 'upcoming' })).toBe('?games=hosting')
    expect(profileTabsQuery({ role: 'joined', when: 'past' })).toBe('?when=past')
    expect(profileTabsQuery({ role: 'hosting', when: 'past' })).toBe('?games=hosting&when=past')
  })

  it('round-trips', () => {
    for (const role of ['joined', 'hosting'] as const) {
      for (const when of ['upcoming', 'past'] as const) {
        const query = Object.fromEntries(new URLSearchParams(profileTabsQuery({ role, when })))
        expect(parseProfileTabs(query)).toEqual({ role, when })
      }
    }
  })
})

describe('parseProfileUpdate', () => {
  it('normalizes the phone the same way the rest of the app does', () => {
    expect(parseProfileUpdate({ phone: '050 210 34 56' })).toEqual({
      ok: true,
      value: { phone: '+994502103456' },
    })
  })

  it('only carries the keys that were sent, so a patch never blanks a field', () => {
    expect(parseProfileUpdate({ fullName: '  Kərim Məmmədov  ' })).toEqual({
      ok: true,
      value: { fullName: 'Kərim Məmmədov' },
    })
  })

  it('treats null and empty string as "clear this field"', () => {
    expect(parseProfileUpdate({ phone: null })).toEqual({ ok: true, value: { phone: null } })
    expect(parseProfileUpdate({ profilePictureId: '' })).toEqual({ ok: true, value: { profilePictureId: null } })
  })

  it('refuses an empty name, a bad number and a bad upload id', () => {
    expect(parseProfileUpdate({ fullName: '   ' })).toMatchObject({ ok: false, code: 'INVALID_NAME' })
    expect(parseProfileUpdate({ fullName: 'x'.repeat(121) })).toMatchObject({ ok: false, code: 'INVALID_NAME' })
    expect(parseProfileUpdate({ phone: '12345' })).toMatchObject({ ok: false, code: 'INVALID_PHONE' })
    expect(parseProfileUpdate({ profilePictureId: -3 })).toMatchObject({ ok: false, code: 'INVALID_MEDIA' })
  })

  it('ignores fields that are not the user\'s to change', () => {
    // email, role and googleId tie the account to its Google identity.
    expect(parseProfileUpdate({ email: 'new@example.com', role: 'admin', googleId: 'x' })).toMatchObject({
      ok: false,
      code: 'NOTHING_TO_UPDATE',
    })
  })

  it('rejects a body that is not an object', () => {
    expect(parseProfileUpdate(null)).toMatchObject({ ok: false, code: 'INVALID_BODY' })
  })
})

describe('normalizeGameRecord / toGameCard', () => {
  const raw = {
    id: 7,
    title: 'Axşam futbolu',
    sport: 'football',
    level: 'medium',
    scheduledAt: inHours(3),
    maxPlayers: 10,
    availablePlayers: 1,
    status: 'scheduled',
    arena: { id: 3, name: 'Inter Arena', district: 'Nərimanov', location: 'Nərimanov, Bakı', city: 'baku', coordinates: '40.4,49.87', sportTypes: ['football'] },
    host: { id: 1, fullName: 'Elvin Məmmədov', email: 'elvin@example.com', profilePicture: { url: '/api/media/file/elvin.png' } },
  }

  it('returns the card fields the design needs, with the venue as an object and server-side status', () => {
    expect(toGameCard(normalizeGameRecord(raw, NOW))).toEqual({
      id: '7',
      title: 'Axşam futbolu',
      sport: 'football',
      sportLabel: 'Futbol',
      level: 'medium',
      levelLabel: 'Orta səviyyə',
      venue: {
        id: '3',
        name: 'Inter Arena',
        label: 'Inter Arena — Nərimanov, Bakı',
        district: 'Nərimanov',
        address: 'Nərimanov, Bakı',
        city: 'baku',
        cityLabel: 'Bakı',
        coordinates: { lat: 40.4, lng: 49.87 },
        sportTypes: ['football'],
      },
      district: 'Nərimanov',
      startsAt: inHours(3),
      dateLabel: 'Baz, 13 Sen',
      timeLabel: '17:00',
      relativeTimeLabel: 'Bu gün · 17:00',
      currentCount: 9,
      maxCount: 10,
      remainingSpots: 1,
      status: 'open',
      coverImageUrl: '/images/game-football-1-7880cc.png',
      coverImage: {
        thumbnailUrl: '/images/game-football-1-7880cc.png',
        fullUrl: '/images/game-football-1-7880cc.png',
        fallbackUrl: '/images/game-football-1-7880cc.png',
      },
      host: { id: '1', name: 'Elvin Məmmədov', initials: 'EM', avatarUrl: '/api/media/file/elvin.png' },
    })
  })

  it("carries the host's id for the profile link, populated or not", () => {
    expect(normalizeGameRecord({ ...raw, host: 12 }, NOW).host).toMatchObject({ id: '12', name: 'OyunaGəl istifadəçisi' })
    // ON DELETE SET NULL: a game whose host account is gone has nobody to link to.
    expect(normalizeGameRecord({ ...raw, host: null }, NOW).host.id).toBeNull()
  })

  it('never exposes the host email as their name', () => {
    const game = normalizeGameRecord({ ...raw, host: { id: 1, email: 'elvin@example.com' } }, NOW)
    expect(game.host.name).toBe('OyunaGəl istifadəçisi')
  })

  it('prefers uploaded cover sizes and prefixes them with MEDIA_BASE_URL', () => {
    vi.stubEnv('MEDIA_BASE_URL', 'https://cdn.example.com/')
    const game = normalizeGameRecord({
      ...raw,
      sport: 'tennis',
      coverImage: {
        url: '/api/media/file/court.jpg',
        sizes: {
          thumbnail: { url: '/api/media/file/court-480x270.webp' },
          full: { url: '/api/media/file/court-1600x900.webp' },
        },
      },
    }, NOW)
    expect(game.cover).toEqual({
      thumbnailUrl: 'https://cdn.example.com/api/media/file/court-480x270.webp',
      fullUrl: 'https://cdn.example.com/api/media/file/court-1600x900.webp',
      fallbackUrl: '/images/game-tennis-1-3ee73d.png',
    })
  })

  const venuePhoto = {
    url: '/api/media/file/inter.jpg',
    sizes: {
      thumbnail: { url: '/api/media/file/inter-480x270.webp' },
      full: { url: '/api/media/file/inter-1600x900.webp' },
    },
  }

  it('falls back to the venue photo when the game has no cover of its own', () => {
    const game = normalizeGameRecord({ ...raw, arena: { ...raw.arena, image: venuePhoto } }, NOW)
    expect(game.cover).toEqual({
      thumbnailUrl: '/api/media/file/inter-480x270.webp',
      fullUrl: '/api/media/file/inter-1600x900.webp',
      // Still the sport default, so a venue photo that 404s degrades to it.
      fallbackUrl: '/images/game-football-1-7880cc.png',
    })
  })

  it("prefers the game's own cover over the venue photo", () => {
    const game = normalizeGameRecord({
      ...raw,
      arena: { ...raw.arena, image: venuePhoto },
      coverImage: { url: '/api/media/file/own.jpg' },
    }, NOW)
    expect(game.cover.fullUrl).toBe('/api/media/file/own.jpg')
  })

  it("prefers the game's own image path over the venue photo", () => {
    const game = normalizeGameRecord({
      ...raw,
      arena: { ...raw.arena, image: venuePhoto },
      image: '/images/custom.png',
    }, NOW)
    expect(game.cover.fullUrl).toBe('/images/custom.png')
  })

  it('ignores a venue photo that has no file and uses the sport default', () => {
    const game = normalizeGameRecord({ ...raw, arena: { ...raw.arena, image: { alt: 'no file yet' } } }, NOW)
    expect(game.cover.fullUrl).toBe('/images/game-football-1-7880cc.png')
  })

  it("uses the venue's public image path when it has no uploaded photo", () => {
    const imagePath = '/images/arenas/inter-arena.png'
    const game = normalizeGameRecord({ ...raw, arena: { ...raw.arena, image: null, imagePath } }, NOW)
    expect(game.cover).toEqual({ thumbnailUrl: imagePath, fullUrl: imagePath, fallbackUrl: '/images/game-football-1-7880cc.png' })

    const uploaded = normalizeGameRecord({ ...raw, arena: { ...raw.arena, image: venuePhoto, imagePath } }, NOW)
    expect(uploaded.cover.fullUrl).toBe('/api/media/file/inter-1600x900.webp')
  })
})
