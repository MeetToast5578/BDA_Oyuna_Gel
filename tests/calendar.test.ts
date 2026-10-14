import { describe, expect, it } from 'vitest'

import { googleCalendarUrl, toIcs, type CalendarGame } from '@/lib/calendar'
import { shareText } from '@/lib/game-backend'

const GAME: CalendarGame = {
  id: '42',
  title: 'Axşam futbolu',
  sport: 'football',
  startsAt: '2026-10-18T15:00:00.000Z',
  venue: { name: 'Aku Arena', address: 'Nizami küç. 5' },
}
const LINK = 'https://oyunagel.az/games/42'
const NOW = new Date('2026-10-14T09:00:00.000Z')

const unfold = (ics: string) => ics.replace(/\r\n /g, '')
const field = (ics: string, name: string) => unfold(ics).split('\r\n').find((line) => line.startsWith(`${name}:`))

describe('toIcs', () => {
  it('builds one event in UTC, lasting the sport\'s usual length, with a reminder two hours before', () => {
    const ics = toIcs(GAME, LINK, NOW)!
    expect(field(ics, 'DTSTART')).toBe('DTSTART:20261018T150000Z')
    expect(field(ics, 'DTEND')).toBe('DTEND:20261018T163000Z')
    expect(field(ics, 'UID')).toBe('UID:game-42@oyunagel')
    expect(field(ics, 'DTSTAMP')).toBe('DTSTAMP:20261014T090000Z')
    expect(ics).toContain('TRIGGER:-PT120M')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // Every line break is CRLF.
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('uses each sport\'s length', () => {
    expect(field(toIcs({ ...GAME, sport: 'basketball' }, LINK, NOW)!, 'DTEND')).toBe('DTEND:20261018T160000Z')
  })

  it('escapes the characters that would split a value', () => {
    const ics = toIcs({ ...GAME, title: 'A, B; C\\D\nE' }, LINK, NOW)!
    expect(field(ics, 'SUMMARY')).toBe('SUMMARY:A\\, B\\; C\\\\D\\nE')
    expect(field(ics, 'LOCATION')).toBe('LOCATION:Aku Arena\\, Nizami küç. 5')
  })

  it('folds long lines at 75 bytes without splitting an Azerbaijani letter', () => {
    const title = 'Şənbə günü ğəzəl futbol oyunu, hamı dəvətlidir: ə ş ğ ı ö ü ç '.repeat(3)
    const ics = toIcs({ ...GAME, title }, LINK, NOW)!
    const encoder = new TextEncoder()
    for (const line of ics.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
    expect(field(ics, 'SUMMARY')).toBe(`SUMMARY:${title.replace(/,/g, '\\,')}`)
    expect(ics).not.toContain('�')
  })

  it('has no event for a game without a start time', () => {
    expect(toIcs({ ...GAME, startsAt: null }, LINK, NOW)).toBeNull()
  })
})

describe('googleCalendarUrl', () => {
  it('carries the same times, place and link', () => {
    const url = new URL(googleCalendarUrl(GAME, LINK)!)
    expect(url.origin).toBe('https://calendar.google.com')
    expect(url.searchParams.get('dates')).toBe('20261018T150000Z/20261018T163000Z')
    expect(url.searchParams.get('text')).toBe('Axşam futbolu')
    expect(url.searchParams.get('location')).toBe('Aku Arena, Nizami küç. 5')
    expect(url.searchParams.get('details')).toBe(LINK)
  })
})

describe('shareText', () => {
  const base = { title: 'Axşam futbolu', dateLabel: 'Şən, 18 Okt', timeLabel: '19:00', venue: { name: 'Aku Arena' }, remainingSpots: 3 }
  it('says when, where and how many spots are left', () => {
    expect(shareText({ ...base, status: 'open' })).toBe('Axşam futbolu · Şən, 18 Okt, 19:00 · Aku Arena · 3 yer qalıb')
    expect(shareText({ ...base, status: 'full', remainingSpots: 0 })).toBe('Axşam futbolu · Şən, 18 Okt, 19:00 · Aku Arena · Oyun doludur')
    expect(shareText({ ...base, status: 'open', dateLabel: null, timeLabel: null, venue: { name: '' } })).toBe('Axşam futbolu · 3 yer qalıb')
  })
})
