// Client-safe parsing and formatting for the typed date and time fields on "Yeni Oyun Yarat".
// The form keeps what the user typed; the API values (YYYY-MM-DD, HH:mm) are derived from it.

type Part = 'd' | 'm' | 'y'

/** Labels use the Azerbaijani initials: GG = gün, AA = ay, İİİİ = il. */
export const DATE_FORMATS = {
  'dd.mm.yyyy': { label: 'GG.AA.İİİİ', order: ['d', 'm', 'y'], separator: '.' },
  'dd/mm/yyyy': { label: 'GG/AA/İİİİ', order: ['d', 'm', 'y'], separator: '/' },
  'mm/dd/yyyy': { label: 'AA/GG/İİİİ', order: ['m', 'd', 'y'], separator: '/' },
  'yyyy-mm-dd': { label: 'İİİİ-AA-GG', order: ['y', 'm', 'd'], separator: '-' },
} satisfies Record<string, { label: string; order: Part[]; separator: string }>

export type DateFormat = keyof typeof DATE_FORMATS

export const TIME_FORMATS = {
  '24h': { label: '24 saat', example: '19:30' },
  '12h': { label: '12 saat', example: '7:30 PM' },
}

export type TimeFormat = keyof typeof TIME_FORMATS

export const pad = (value: number) => String(value).padStart(2, '0')

/** "2026-09-30" moved by `days` → "2026-10-01". */
export function addDays(isoDate: string, days: number) {
  return new Date(Date.parse(isoDate) + days * 86_400_000).toISOString().slice(0, 10)
}

/** "2026-12" moved by `months` → "2027-01". */
export function addMonths(month: string, months: number) {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1 + months, 1)).toISOString().slice(0, 7)
}

/** A month ("2026-09") as calendar cells, Monday first: a null per blank before the 1st, then each day. */
export function monthCells(month: string): (string | null)[] {
  const [year, index] = month.split('-').map(Number)
  const blanks = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7
  const length = new Date(Date.UTC(year, index, 0)).getUTCDate()
  return [...Array<null>(blanks).fill(null), ...Array.from({ length }, (_, day) => `${month}-${pad(day + 1)}`)]
}

/**
 * "19.09.2026" (in `format`'s day/month/year order) → "2026-09-19", or null if it isn't a real date.
 * Any non-digit separates the parts, so "19/9/26" and "19 09 2026" work too; a 2-digit year is 20xx.
 */
export function parseDateText(text: string, format: DateFormat): string | null {
  const parts = text.split(/\D+/).filter(Boolean)
  const { order } = DATE_FORMATS[format]
  if (parts.length !== 3) return null

  const raw = Object.fromEntries(order.map((part, index) => [part, parts[index]])) as Record<Part, string>
  if (raw.y.length !== 2 && raw.y.length !== 4) return null
  const year = Number(raw.y) + (raw.y.length === 2 ? 2000 : 0)
  const month = Number(raw.m)
  const day = Number(raw.d)

  // Date.UTC rolls 31.02 over into March; comparing back catches it.
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** "2026-09-19" → "19.09.2026" etc. */
export function formatDateText(isoDate: string, format: DateFormat) {
  const [y, m, d] = isoDate.split('-')
  const values: Record<Part, string> = { y, m, d }
  const { order, separator } = DATE_FORMATS[format]
  return order.map((part) => values[part]).join(separator)
}

/**
 * "19:30", "19.30", "1930", "19", "7:30 PM", "7pm", "7.30 p.m." → "HH:mm", or null. AM/PM is understood in
 * either format; in the 12-hour format an hour from 1 to 12 without it is ambiguous, so it is rejected.
 */
export function parseTimeText(text: string, format: TimeFormat): string | null {
  const match = /^(\d{1,2})(?:\s*[:.]?\s*(\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?$/i.exec(text.trim())
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  const suffix = match[3]?.toLowerCase()
  if (minutes > 59) return null

  if (suffix) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (suffix === 'p' ? 12 : 0)
  } else if (format === '12h' && hours >= 1 && hours <= 12) {
    return null
  }
  return hours > 23 ? null : `${pad(hours)}:${pad(minutes)}`
}

/** "19:30" → "19:30" or "7:30 PM". */
export function formatTimeText(time: string, format: TimeFormat) {
  if (format === '24h') return time
  const [hours, minutes] = time.split(':').map(Number)
  return `${hours % 12 || 12}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`
}

/** Where the time dial's numbers sit, as a fraction of its radius. */
export const DIAL_RINGS = { outer: 0.8, inner: 0.52 }

/**
 * The number on the time dial at a point, laid out as on Android: 12 at the top, clockwise. `x`/`y` are
 * from the centre as a fraction of the radius, y down. Hours snap to the nearest mark; in 24-hour format
 * the outer ring is 12 and 1–11 and the inner one 00 and 13–23. Minutes snap to 5.
 */
export function dialValue(x: number, y: number, step: 'hour' | 'minute', format: TimeFormat, pm: boolean) {
  const degrees = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360
  const mark = Math.round(degrees / 30) % 12
  if (step === 'minute') return mark * 5
  if (format === '12h') return mark + (pm ? 12 : 0)
  const inner = Math.hypot(x, y) < (DIAL_RINGS.outer + DIAL_RINGS.inner) / 2
  return inner ? (mark ? mark + 12 : 0) : mark || 12
}

/** Digits each part takes, so a mask knows where one ends and the next begins. */
const WIDTHS: Record<Part, number> = { d: 2, m: 2, y: 4 }

/**
 * Masks a date while it is typed, the way the phone field does: digits are regrouped into the chosen
 * format and its separators are put in for the user, so "1909" shows as "19.09". Non-digits are
 * dropped, which means typing the separator yourself, or pasting a date punctuated another way, both
 * land on the same text. A separator typed right after a full part is kept, so "19." does not jump
 * back to "19" under the caret.
 */
export function formatDateInput(input: string, format: DateFormat) {
  const { order, separator } = DATE_FORMATS[format]
  const widths = order.map((part) => WIDTHS[part])
  const total = widths.reduce((sum, width) => sum + width, 0)
  const digits = input.replace(/\D/g, '').slice(0, total)

  const groups: string[] = []
  let at = 0
  for (const width of widths) {
    if (at >= digits.length) break
    groups.push(digits.slice(at, at + width))
    at += width
  }

  const last = groups.length - 1
  const openSeparator =
    groups.length > 0 && groups.length < widths.length && groups[last].length === widths[last] && /\D$/.test(input)
  return groups.join(separator) + (openSeparator ? separator : '')
}

/**
 * Masks a time while it is typed. A separator the user typed decides the split, so "2:30" stays half
 * past two. Without one, two leading digits are the hour when they can be one (00-23) and otherwise a
 * single digit is, which is what lets "73" and "730" read as 7:3 and 7:30. An "a"/"p" is only
 * upper-cased, never completed to "AM"/"PM", so backspace can still take it off; `formatTimeText`
 * spells it out on blur.
 */
export function formatTimeInput(input: string) {
  const marker = /([ap])\s*\.?\s*(m?)/i.exec(input)
  const tail = marker ? ` ${marker[1].toUpperCase()}${marker[2] ? 'M' : ''}` : ''

  const typed = /^\s*(\d{1,2})\s*[:.]\s*(\d{0,2})/.exec(input)
  const digits = input.replace(/\D/g, '').slice(0, 4)
  if (!typed && !digits) return ''

  // Two digits lead only when they could be an hour; "730" is 7:30, not 73:0.
  const hourLength = digits.length >= 2 && Number(digits.slice(0, 2)) <= 23 ? 2 : 1
  const hour = typed ? typed[1] : digits.slice(0, hourLength)
  const minute = typed ? typed[2] : digits.slice(hourLength, hourLength + 2)
  const openSeparator = minute === '' && /\d\s*[:.]/.test(input)

  return `${hour}${minute ? `:${minute}` : openSeparator ? ':' : ''}${tail}`
}
