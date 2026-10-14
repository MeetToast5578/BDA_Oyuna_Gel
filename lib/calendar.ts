// "Təqvimə əlavə et": a game as a calendar event. Pure, like lib/game-backend.ts.

import { SPORT_META } from '@/lib/game-backend'

/** The calendar reminds the player this long before kick-off, so the site needs no reminder job. */
export const REMINDER_MINUTES = 120

export type CalendarGame = {
  id: string
  title: string
  sport: string
  startsAt: string | null
  venue: { name: string; address: string | null }
}

/** Start and end, the end being the sport's usual length later; null for a game with no start time. */
function eventTimes(game: CalendarGame) {
  const start = game.startsAt ? new Date(game.startsAt) : null
  if (!start || Number.isNaN(start.getTime())) return null
  const { durationMinutes } = SPORT_META[game.sport] ?? SPORT_META.football
  return { start, end: new Date(start.getTime() + durationMinutes * 60_000) }
}

/** 20261018T150000Z: UTC, so the calendar shows it in whatever time zone the phone is in. */
const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** RFC 5545 text: backslash first, then the characters that would end or split the value. */
const escapeText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const encoder = new TextEncoder()

/**
 * RFC 5545 lines are at most 75 octets; longer ones continue on lines starting with a space. Counted
 * in bytes, not characters: ə, ş and ğ take two each, and a split inside one would corrupt it.
 */
function fold(line: string) {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const locationOf = (game: CalendarGame) => [game.venue.name, game.venue.address].filter(Boolean).join(', ')

/** The game as an .ics file with one event and a reminder. Null when the game has no start time. */
export function toIcs(game: CalendarGame, url: string, now = new Date()) {
  const times = eventTimes(game)
  if (!times) return null
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OyunaGel//Oyunlar//AZ',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable per game, so importing it again after an edit updates the event instead of adding one.
    `UID:game-${game.id}@oyunagel`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(times.start)}`,
    `DTEND:${icsDate(times.end)}`,
    `SUMMARY:${escapeText(game.title)}`,
    `LOCATION:${escapeText(locationOf(game))}`,
    `DESCRIPTION:${escapeText(url)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(game.title)}`,
    `TRIGGER:-PT${REMINDER_MINUTES}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The same event as a Google Calendar link, for Android phones that don't open .ics files. */
export function googleCalendarUrl(game: CalendarGame, url: string) {
  const times = eventTimes(game)
  if (!times) return null
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: game.title,
    dates: `${icsDate(times.start)}/${icsDate(times.end)}`,
    location: locationOf(game),
    details: url,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
