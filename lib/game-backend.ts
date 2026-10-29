// Pure game logic shared by the API routes, collections and tests. No Payload or Next imports here.

import { parseInviteEntries, type InviteEntry } from '@/lib/team-logic'

export type AvailabilityStatus = 'open' | 'full' | 'live' | 'finished' | 'cancelled'

type Doc = Record<string, unknown>

/** Asia/Baku has not observed daylight saving time since 2016, so its offset is fixed. */
export const BAKU_TIME_ZONE = 'Asia/Baku'
export const BAKU_UTC_OFFSET = '+04:00'

export const DEFAULT_CITY = 'baku'
export const CITY_OPTIONS = [{ label: 'Bakı', value: 'baku' }]
const CITY_ALIASES: Record<string, string> = { baku: 'baku', bakı: 'baku', baki: 'baku' }
const CITY_LABELS: Record<string, string> = Object.fromEntries(CITY_OPTIONS.map(({ label, value }) => [value, label]))

/**
 * `maxPlayers` is the most a game of that sport can have: two full sides (11, 5 and 2 a side).
 * `durationMinutes` is how long a game usually lasts; after that it counts as played (`finished`).
 */
export const SPORT_META: Record<
  string,
  {
    label: string
    iconKey: string
    image: string
    maxPlayers: number
    /** What a new game starts at on the form: most football here is 5- or 6-a-side, not 11. */
    defaultPlayers: number
    durationMinutes: number
  }
> = {
  football: { label: 'Futbol', iconKey: 'football', image: '/images/game-football-1-7880cc.png', maxPlayers: 22, defaultPlayers: 10, durationMinutes: 90 },
  basketball: { label: 'Basketbol', iconKey: 'basketball', image: '/images/game-basketball-1-4a0ddf.png', maxPlayers: 10, defaultPlayers: 10, durationMinutes: 60 },
  tennis: { label: 'Tennis', iconKey: 'tennis', image: '/images/game-tennis-1-3ee73d.png', maxPlayers: 4, defaultPlayers: 4, durationMinutes: 90 },
}
export const SPORTS = Object.keys(SPORT_META)

/** A game's max players is even (two equal sides), from one a side up to the sport's `maxPlayers`. */
export const MIN_MAX_PLAYERS = 2
export const PLAYER_COUNT_STEP = 2

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Başlanğıc',
  medium: 'Orta səviyyə',
  high: 'Yüksək',
}

/** Not started yet: can still be joined, left, edited or deleted by its host. */
export function isUpcoming(status: AvailabilityStatus) {
  return status === 'open' || status === 'full'
}

export const FEATURED_LIMIT = 8
/** Only games starting within this many hours are considered for the hero carousel. */
export const FEATURED_WINDOW_HOURS = 7 * 24

export const GAMES_DEFAULT_LIMIT = 12
export const GAMES_MAX_LIMIT = 50

/** Shown for an account with no name, the host's or a player's. */
const DEFAULT_USER_NAME = 'OyunaGəl istifadəçisi'
/** Shown for the host of a past game whose account was deleted (the game stays, with no host). */
const DELETED_USER_NAME = 'Silinmiş istifadəçi'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const BAKU_OFFSET_MS = 4 * HOUR_MS

// Short forms as used on the game cards ("Cüm, 2 Avq"); ICU's az-AZ short forms ("B.", "avq") differ.
export const WEEKDAYS_SHORT = ['Baz', 'B.e.', 'Ç.a.', 'Çər', 'C.a.', 'Cüm', 'Şən']
const MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek']
// Spelled out rather than taken from ICU, so the label is the same whatever ICU build the server runs.
export const MONTHS_LONG = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avqust',
  'sentyabr',
  'oktyabr',
  'noyabr',
  'dekabr',
]

function asDoc(value: unknown): Doc | null {
  return value && typeof value === 'object' ? (value as Doc) : null
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function toDate(value?: string | Date | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Coerces a stored player count to a non-negative integer; anything unparseable counts as 0. */
function toCount(value: unknown) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

/**
 * The single source of truth for whether a game can be joined. Clients must use the returned
 * `status` / `remainingSpots` instead of re-deriving them from the player counts.
 *
 * A game moves along with the clock, not by a job writing to it: `open`/`full` until it starts,
 * `live` for the sport's usual length (`SPORT_META.durationMinutes`), then `finished`. A stored
 * `cancelled` or `finished` always wins. A stored `live` (an admin's, or the seed's) holds only
 * until that usual end, then it is `finished` like any other game: nothing ever writes the status
 * back, so otherwise it would read "Davam edir" forever.
 */
export function deriveAvailability(raw: unknown, now = Date.now()) {
  const game = asDoc(raw) ?? {}
  const maxCount = toCount(game.maxPlayers)
  const remainingSpots = Math.min(toCount(game.availablePlayers ?? maxCount), maxCount)
  const startsAt = game.scheduledAt ? Date.parse(String(game.scheduledAt)) : Number.NaN
  const { durationMinutes } = SPORT_META[String(game.sport)] ?? SPORT_META.football
  const endsAt = startsAt + durationMinutes * 60_000

  let status: AvailabilityStatus
  if (game.status === 'cancelled' || game.status === 'finished') {
    status = game.status
  } else if (game.status === 'live' || startsAt <= now) {
    // A stored `live` without a start time has no end to reach, so it stays as stored.
    status = now < endsAt || Number.isNaN(startsAt) ? 'live' : 'finished'
  } else {
    status = remainingSpots > 0 ? 'open' : 'full'
  }

  return { status, remainingSpots, currentCount: maxCount - remainingSpots, maxCount }
}

const bakuDayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: BAKU_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const bakuTime = new Intl.DateTimeFormat('az-AZ', { timeZone: BAKU_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const bakuWeekday = new Intl.DateTimeFormat('az-AZ', { timeZone: BAKU_TIME_ZONE, weekday: 'long' })
const bakuDate = new Intl.DateTimeFormat('az-AZ', { timeZone: BAKU_TIME_ZONE, day: 'numeric', month: 'long' })

/** "2026-09-19": the calendar day `date` falls on in Baku, as the date inputs want it. */
export function formatBakuDateKey(date: Date) {
  return bakuDayKey.format(date)
}

/** Midnight in Baku of the day containing `date`, shifted by `addDays` days. */
export function startOfBakuDay(date: Date, addDays = 0) {
  const start = new Date(`${bakuDayKey.format(date)}T00:00:00${BAKU_UTC_OFFSET}`)
  return new Date(start.getTime() + addDays * DAY_MS)
}

/** "Bu gün · 17:00", "Sabah · 19:30", "Cümə axşamı · 17:00", or "1 oktyabr · 17:00", in Baku time. */
export function formatBakuLabel(dateInput?: string | Date | null, now = new Date()) {
  const date = toDate(dateInput)
  if (!date) return 'Təyin edilmədi'

  const dayOffset = Math.round((startOfBakuDay(date).getTime() - startOfBakuDay(now).getTime()) / DAY_MS)
  let dayLabel: string
  if (dayOffset === 0) dayLabel = 'Bu gün'
  else if (dayOffset === 1) dayLabel = 'Sabah'
  else if (dayOffset > 1 && dayOffset < 7) dayLabel = capitalize(bakuWeekday.format(date))
  else dayLabel = bakuDate.format(date)

  return `${dayLabel} · ${bakuTime.format(date)}`
}

/** "Cüm, 2 Avq" in Baku time. */
export function formatBakuShortDate(dateInput?: string | Date | null) {
  const date = toDate(dateInput)
  if (!date) return null
  const baku = new Date(date.getTime() + BAKU_OFFSET_MS)
  return `${WEEKDAYS_SHORT[baku.getUTCDay()]}, ${baku.getUTCDate()} ${MONTHS_SHORT[baku.getUTCMonth()]}`
}

/** "20:00" in Baku time. */
export function formatBakuTime(dateInput?: string | Date | null) {
  const date = toDate(dateInput)
  return date ? bakuTime.format(date) : null
}

/** The last `count` Baku calendar months up to `now`, oldest first: `{ key: '2026-10', label: 'Okt' }`. */
export function lastBakuMonths(now: Date, count: number) {
  const baku = new Date(now.getTime() + BAKU_OFFSET_MS)
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(Date.UTC(baku.getUTCFullYear(), baku.getUTCMonth() - count + 1 + index, 1))
    return {
      key: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`,
      label: MONTHS_SHORT[month.getUTCMonth()],
    }
  })
}

/** "fevral 2026", the Baku calendar month, for "Qeydiyyat: fevral 2026" on a profile. */
export function formatBakuMonthYear(dateInput?: string | Date | null) {
  const date = toDate(dateInput)
  if (!date) return null
  const baku = new Date(date.getTime() + BAKU_OFFSET_MS)
  return `${MONTHS_LONG[baku.getUTCMonth()]} ${baku.getUTCFullYear()}`
}

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase('az') + text.slice(1)
}

/** Maps a `city` query value to a stored city, defaulting to Baku; returns null for unknown cities. */
export function normalizeCity(input?: string | null) {
  if (!input?.trim()) return DEFAULT_CITY
  return CITY_ALIASES[input.trim().toLocaleLowerCase('az')] ?? null
}

/** Parses "lat,lng" into numbers; null when missing or out of range. */
export function parseCoordinates(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null
  const [lat, lng] = parts
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

/** Prefixes uploaded-media paths with MEDIA_BASE_URL (a CDN in front of the app) when it is set. */
export function mediaUrl(url: unknown) {
  if (!nonEmptyString(url)) return null
  const base = process.env.MEDIA_BASE_URL?.replace(/\/+$/, '')
  return base && (url as string).startsWith('/') ? `${base}${url}` : (url as string)
}

/**
 * Search key that ignores case and Azerbaijani letters: "Inter", "İnter" and "ınter" all become "inter",
 * and "nerimanov" finds "Nərimanov". Plain toLocaleLowerCase('az') maps "I" to "ı", so "inter" would
 * never match "Inter Arena".
 */
export function foldForSearch(text: string) {
  return text
    .toLocaleLowerCase('az')
    .replace(/ı/g, 'i')
    .replace(/ə/g, 'e')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function initialsOf(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('az'))
    .join('')
  return initials || '?'
}

export function normalizeVenue(value: unknown) {
  const arena = asDoc(value)
  const id = arena ? arena.id : value
  const name = nonEmptyString(arena?.name) ?? ''
  const district = nonEmptyString(arena?.district)
  const city = nonEmptyString(arena?.city) ?? DEFAULT_CITY
  const cityLabel = CITY_LABELS[city] ?? city
  return {
    id: typeof id === 'number' || typeof id === 'string' ? String(id) : null,
    name,
    // "Aku Arena — Nizami, Bakı", as in the venue picker.
    label: `${name} — ${[district, cityLabel].filter(Boolean).join(', ')}`,
    district,
    address: nonEmptyString(arena?.address) ?? nonEmptyString(arena?.location),
    city,
    cityLabel,
    coordinates: parseCoordinates(arena?.coordinates),
    sportTypes: Array.isArray(arena?.sportTypes) ? arena.sportTypes.map(String) : [],
  }
}

/** Normalizes an Azerbaijani phone number to +994XXXXXXXXX; null if it isn't one. */
export function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return null
  const compact = value.replace(/[\s().-]/g, '')
  const withCountry = compact.startsWith('+')
    ? compact
    : compact.startsWith('994')
      ? `+${compact}`
      : compact.startsWith('0')
        ? `+994${compact.slice(1)}`
        : compact
  return /^\+994\d{9}$/.test(withCountry) ? withCountry : null
}

const SPORT_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(SPORT_META).map(([sport, meta]) => [meta.label.toLocaleLowerCase('az'), sport]),
)
const LEVEL_BY_INPUT: Record<string, string> = {
  beginner: 'beginner',
  medium: 'medium',
  high: 'high',
  başlanğıc: 'beginner',
  orta: 'medium',
  'orta səviyyə': 'medium',
  yüksək: 'high',
}

export type CreateGameInput = {
  title: string
  sport: string
  level: string
  venueId: number
  scheduledAt: Date
  maxCount: number
  currentCount: number
  contactPhone: string | null
  /** The clubs standing on each side, or null for a side open to anyone. */
  homeTeamId: number | null
  awayTeamId: number | null
  /** The side the host stands on when creating the game (an edit ignores it: the host moves like anyone). */
  hostSide: 'home' | 'away'
  /** Players the host names at creation, each invited to a side; empty on an edit (the game page invites later). */
  invites: InviteEntry[]
}

type CreateGameParseResult = { ok: true; input: CreateGameInput } | { ok: false; code: string; message: string }

/**
 * Validates the create- and edit-game forms. `sport` and `level` accept the stored values or the
 * Azerbaijani labels; date and time are Baku local time.
 *
 * On create, `currentCount` is "Mövcud iştirakçı sayı", the players already in, so the game opens
 * with maxCount - currentCount free spots, and the host is always the first player. On edit the
 * count is not part of the form — it is whoever has joined by now — so it is passed in as
 * `fixedCurrentCount` and the only rule left is that the new size still fits them all.
 */
function parseGameForm(body: unknown, now: Date, fixedCurrentCount?: number): CreateGameParseResult {
  const fail = (code: string, message: string) => ({ ok: false as const, code, message })
  const data = asDoc(body) ?? {}

  const sportInput = String(data.sport ?? '').trim().toLocaleLowerCase('az')
  const sport = SPORTS.includes(sportInput) ? sportInput : SPORT_BY_LABEL[sportInput]
  if (!sport) return fail('INVALID_SPORT', `sport must be one of: ${SPORTS.join(', ')}`)

  const level = LEVEL_BY_INPUT[String(data.level ?? '').trim().toLocaleLowerCase('az')]
  if (!level) return fail('INVALID_LEVEL', 'level must be beginner, medium or high.')

  const venueId = Number(data.venueId)
  if (!Number.isSafeInteger(venueId) || venueId <= 0) return fail('INVALID_VENUE', 'venueId is required.')

  const date = String(data.scheduledDate ?? '')
  const time = String(data.scheduledTime ?? '')
  const scheduledAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)
    ? new Date(`${date}T${time}:00${BAKU_UTC_OFFSET}`)
    : null
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return fail('INVALID_DATE', 'scheduledDate must be YYYY-MM-DD and scheduledTime HH:mm.')
  }
  if (scheduledAt <= now) return fail('DATE_IN_PAST', 'The game must start in the future.')

  const maxCount = Number(data.maxCount)
  const sportMax = SPORT_META[sport].maxPlayers
  if (!Number.isInteger(maxCount) || maxCount < MIN_MAX_PLAYERS || maxCount > sportMax || maxCount % PLAYER_COUNT_STEP !== 0) {
    return fail('INVALID_MAX_COUNT', `maxCount must be an even number from ${MIN_MAX_PLAYERS} to ${sportMax} for ${sport}.`)
  }
  let currentCount: number
  if (fixedCurrentCount === undefined) {
    const rawCount = data.currentCount === undefined || data.currentCount === '' ? 1 : Number(data.currentCount)
    currentCount = Math.max(1, rawCount)
    if (!Number.isInteger(rawCount) || rawCount < 0 || currentCount >= maxCount) {
      return fail('INVALID_CURRENT_COUNT', 'currentCount must be an integer from 1 (the host) to maxCount - 1.')
    }
  } else {
    currentCount = fixedCurrentCount
    // Shrinking a game below the people already in it would leave them without a spot.
    if (maxCount < currentCount) {
      return fail('MAX_COUNT_BELOW_PLAYERS', `The game already has ${currentCount} players, so maxCount cannot be lower.`)
    }
  }

  const hasPhone = data.hostPhone !== undefined && data.hostPhone !== null && data.hostPhone !== ''
  const contactPhone = hasPhone ? normalizePhone(data.hostPhone) : null
  if (hasPhone && !contactPhone) return fail('INVALID_PHONE', 'hostPhone must be an Azerbaijani number, e.g. +994 50 210 34 56.')

  const title = nonEmptyString(data.title)?.trim().slice(0, 120) ?? `${SPORT_META[sport].label} oyunu`

  // A club per side, both optional: absent, null or "" leaves the side open to anyone.
  const teamId = (value: unknown) =>
    value === undefined || value === null || value === ''
      ? null
      : (typeof value === 'number' || typeof value === 'string') && Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? Number(value)
        : Number.NaN
  const homeTeamId = teamId(data.homeTeamId)
  const awayTeamId = teamId(data.awayTeamId)
  if (Number.isNaN(homeTeamId) || Number.isNaN(awayTeamId)) return fail('INVALID_TEAM', 'homeTeamId and awayTeamId must be club ids.')

  const hostSide = data.hostSide === undefined || data.hostSide === null || data.hostSide === '' ? 'home' : data.hostSide
  if (hostSide !== 'home' && hostSide !== 'away') return fail('INVALID_SIDE', 'hostSide must be home or away.')

  const invites = fixedCurrentCount === undefined ? parseInviteEntries(data.invites) : { ok: true as const, entries: [] as InviteEntry[] }
  if (!invites.ok) return fail('INVALID_INVITES', 'invites must be a list of { userId, side }, one entry per player.')

  return {
    ok: true,
    input: { title, sport, level, venueId, scheduledAt, maxCount, currentCount, contactPhone, homeTeamId, awayTeamId, hostSide, invites: invites.entries },
  }
}

export function parseCreateGameBody(body: unknown, now = new Date()) {
  return parseGameForm(body, now)
}

/** The edit form, where `currentCount` is the players already in rather than a field the host sets. */
export function parseEditGameBody(body: unknown, currentCount: number, now = new Date()) {
  return parseGameForm(body, now, currentCount)
}

/** An uploaded profile picture, else the Google picture saved at sign-in. */
export function userAvatarUrl(user: unknown) {
  const doc = asDoc(user)
  return mediaUrl(asDoc(doc?.profilePicture)?.url) ?? nonEmptyString(doc?.avatarUrl)
}

/**
 * One player of a game, from their `game-participants` row: an avatar in the stack, a row in the
 * "İştirakçılar" list. The account's name wins over the one typed into the join form, so the list
 * says what the profile it opens says. The typed name only stands in once the account is gone, and
 * then there is no profile to link to (`id` is null).
 */
export function toPlayer(participant: unknown) {
  const row = asDoc(participant)
  const user = asDoc(row?.user)
  // Populated or not, the relationship still names the account.
  const userId = user ? user.id : row?.user
  const name = (nonEmptyString(user?.fullName) ?? nonEmptyString(row?.name))?.trim() ?? DEFAULT_USER_NAME
  return {
    id: typeof userId === 'number' || typeof userId === 'string' ? String(userId) : null,
    name,
    initials: initialsOf(name),
    avatarUrl: userAvatarUrl(user),
    side: row?.side === 'away' ? ('away' as const) : ('home' as const),
  }
}

/** Full and thumbnail URLs of an uploaded media document, or null when there is no usable file. */
function mediaSizes(value: unknown) {
  const media = asDoc(value)
  if (!media) return null
  const sizes = asDoc(media.sizes)
  const full = mediaUrl(asDoc(sizes?.full)?.url) ?? mediaUrl(media.url)
  return full ? { full, thumbnail: mediaUrl(asDoc(sizes?.thumbnail)?.url) ?? full } : null
}

/** A venue's own photo: the uploaded one, else its `imagePath`; null when it has neither. */
export function venueImageUrl(arena: unknown) {
  const doc = asDoc(arena)
  return mediaSizes(doc?.image)?.thumbnail ?? nonEmptyString(doc?.imagePath)
}

/**
 * "Xəritədə aç": a Google Maps search, which opens the maps app on phones and needs no API key.
 * The coordinates pin the exact pitch; without them the name and address usually find it.
 */
export function mapsUrl(venue: { name: string; address: string | null; cityLabel: string; coordinates: { lat: number; lng: number } | null }) {
  const query = venue.coordinates
    ? `${venue.coordinates.lat},${venue.coordinates.lng}`
    : [venue.name, venue.address, venue.cityLabel].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/**
 * Cover for a game card, most specific source first: the game's own uploaded cover, then its
 * `image` path, then the venue's uploaded photo or `imagePath`, then the sport's default picture. The venue photo means a
 * host who uploads nothing still gets a picture of the place they are playing, not generic stock art.
 */
function resolveCoverImage(game: Doc, fallbackUrl: string) {
  const own = mediaSizes(game.coverImage)
  if (own) return { thumbnailUrl: own.thumbnail, fullUrl: own.full, fallbackUrl }

  const ownPath = nonEmptyString(game.image)
  if (ownPath) return { thumbnailUrl: ownPath, fullUrl: ownPath, fallbackUrl }

  const arena = asDoc(game.arena)
  const venue = mediaSizes(arena?.image)
  if (venue) return { thumbnailUrl: venue.thumbnail, fullUrl: venue.full, fallbackUrl }

  // Shipped in public/, so it loads on any deploy without depending on upload storage.
  const venuePath = nonEmptyString(arena?.imagePath)
  if (venuePath) return { thumbnailUrl: venuePath, fullUrl: venuePath, fallbackUrl }

  return { thumbnailUrl: fallbackUrl, fullUrl: fallbackUrl, fallbackUrl }
}

/** A game's club as the card shows it; null for an open side (or a relationship that wasn't populated). */
function teamRef(value: unknown) {
  const team = asDoc(value)
  return team && typeof team.name === 'string' ? { id: String(team.id), name: team.name } : null
}

/** "Qarabağ vs Açıq": the clubs on each side of a game, an open side being "Açıq"; null when neither side has a club. */
export function matchupLabel(teams: { home: { name: string } | null; away: { name: string } | null }) {
  return teams.home || teams.away ? `${teams.home?.name ?? 'Açıq'} vs ${teams.away?.name ?? 'Açıq'}` : null
}

export function normalizeGameRecord(raw: unknown, now = Date.now()) {
  const game = asDoc(raw) ?? {}
  const sport = String(game.sport ?? 'football')
  const sportMeta = SPORT_META[sport] ?? SPORT_META.football
  const level = String(game.level ?? 'medium')
  const host = asDoc(game.host)
  const hostName = game.host == null ? DELETED_USER_NAME : (nonEmptyString(host?.fullName) ?? DEFAULT_USER_NAME)
  // Populated or not, the relationship still names the host, which is what a profile link needs.
  const hostId = host ? host.id : game.host
  const startsAt = game.scheduledAt ? String(game.scheduledAt) : null

  return {
    id: String(game.id ?? ''),
    title: String(game.title ?? 'Oyun'),
    sport,
    sportLabel: sportMeta.label,
    level,
    levelLabel: LEVEL_LABELS[level] ?? level,
    venue: normalizeVenue(game.arena),
    startsAt,
    dateLabel: formatBakuShortDate(startsAt),
    timeLabel: formatBakuTime(startsAt),
    relativeTimeLabel: formatBakuLabel(startsAt, new Date(now)),
    ...deriveAvailability(game, now),
    teams: { home: teamRef(game.homeTeam), away: teamRef(game.awayTeam) },
    cover: resolveCoverImage(game, sportMeta.image),
    host: {
      /** For linking to `/users/{id}`; null only for a game whose host account is gone. */
      id: typeof hostId === 'number' || typeof hostId === 'string' ? String(hostId) : null,
      name: hostName,
      initials: initialsOf(hostName),
      avatarUrl: userAvatarUrl(host),
    },
  }
}

export type GameRecord = ReturnType<typeof normalizeGameRecord>

/** The card shape shared by the game list, featured and detail endpoints. */
export function toGameCard(game: GameRecord) {
  return {
    id: game.id,
    title: game.title,
    sport: game.sport,
    sportLabel: game.sportLabel,
    level: game.level,
    levelLabel: game.levelLabel,
    venue: game.venue,
    district: game.venue.district,
    startsAt: game.startsAt,
    dateLabel: game.dateLabel,
    timeLabel: game.timeLabel,
    relativeTimeLabel: game.relativeTimeLabel,
    currentCount: game.currentCount,
    maxCount: game.maxCount,
    remainingSpots: game.remainingSpots,
    status: game.status,
    teams: game.teams,
    coverImageUrl: game.cover.fullUrl,
    coverImage: game.cover,
    host: game.host,
  }
}

/** One entry per known sport, including sports with no open games, so tab counters never go missing. */
export function countOpenGamesBySport(games: Array<{ sport: string; status: AvailabilityStatus }>) {
  const counts = new Map<string, number>()
  for (const game of games) {
    if (game.status === 'open') counts.set(game.sport, (counts.get(game.sport) ?? 0) + 1)
  }
  return SPORTS.map((sport) => ({
    sport,
    label: SPORT_META[sport].label,
    iconKey: SPORT_META[sport].iconKey,
    openGamesCount: counts.get(sport) ?? 0,
  }))
}

type Rankable = { status: AvailabilityStatus; startsAt: string | null; currentCount: number; maxCount: number }

/**
 * Urgency score in [0, 1]: 60% how soon the game starts (linear over FEATURED_WINDOW_HOURS),
 * 40% how full it is. Documented in docs/api.md.
 */
export function featuredScore(game: Rankable, now: number) {
  const startsAtMs = game.startsAt ? Date.parse(game.startsAt) : Number.NaN
  const hoursUntilStart = Number.isFinite(startsAtMs) ? (startsAtMs - now) / HOUR_MS : FEATURED_WINDOW_HOURS
  const timeScore = Math.min(1, Math.max(0, 1 - hoursUntilStart / FEATURED_WINDOW_HOURS))
  const fillRatio = game.maxCount > 0 ? game.currentCount / game.maxCount : 0
  return 0.6 * timeScore + 0.4 * fillRatio
}

/** Open games only, highest score first, ties broken by the earlier start. */
export function rankFeatured<T extends Rankable>(games: T[], now: number, limit = FEATURED_LIMIT) {
  return games
    .filter((game) => game.status === 'open')
    .map((game) => ({ game, score: featuredScore(game, now) }))
    .sort((a, b) => b.score - a.score || (a.game.startsAt ?? '').localeCompare(b.game.startsAt ?? ''))
    .slice(0, limit)
    .map(({ game }) => game)
}

/** Shared shape for the parsers below: a validated value, or an API error code and message. */
type ParseOk<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

export type GameListQuery = {
  /** `upcoming`: from `from` to `to`, soonest first. `past`: games that have started, most recent first. */
  when: ProfileWindow
  sport: string | null
  city: string
  from: Date
  to: Date
  onlyOpen: boolean
  /** "Səviyyə" and "Meydança" on `/games`. The past list ignores them. */
  level: string | null
  venueId: number | null
  page: number
  limit: number
}

/** The "Tarix" filter on `/games`: `?date=` presets, each a window of whole Baku days. */
export const DATE_PRESETS = ['today', 'tomorrow', 'weekend'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

/**
 * The window a date preset covers. "Həftəsonu" is Saturday and Sunday in Baku; on a weekend day it
 * runs from now until Monday, otherwise it is the coming weekend.
 */
export function datePresetWindow(preset: DatePreset, now = new Date()) {
  if (preset === 'today') return { from: now, to: startOfBakuDay(now, 1) }
  if (preset === 'tomorrow') return { from: startOfBakuDay(now, 1), to: startOfBakuDay(now, 2) }
  const weekday = new Date(now.getTime() + BAKU_OFFSET_MS).getUTCDay() // 0 is Sunday, 6 Saturday
  if (weekday === 0) return { from: now, to: startOfBakuDay(now, 1) }
  if (weekday === 6) return { from: now, to: startOfBakuDay(now, 2) }
  return { from: startOfBakuDay(now, 6 - weekday), to: startOfBakuDay(now, 8 - weekday) }
}

type ParseResult = { ok: true; query: GameListQuery } | { ok: false; code: string; message: string }

/** Validates game-list query params. Defaults to the homepage window: now until the end of tomorrow in Baku. */
export function parseGameListParams(params: URLSearchParams, now = new Date()): ParseResult {
  const sport = params.get('sport')
  if (sport && !SPORTS.includes(sport)) {
    return { ok: false, code: 'INVALID_SPORT', message: `sport must be one of: ${SPORTS.join(', ')}` }
  }

  const city = normalizeCity(params.get('city'))
  if (!city) return { ok: false, code: 'UNKNOWN_CITY', message: 'Unknown city.' }

  const date = params.get('date')
  if (date && !DATE_PRESETS.includes(date as DatePreset)) {
    return { ok: false, code: 'INVALID_DATE_FILTER', message: `date must be one of: ${DATE_PRESETS.join(', ')}` }
  }
  // A preset replaces `from`/`to`: it is the whole window the visitor asked for.
  const preset = date ? datePresetWindow(date as DatePreset, now) : null
  const from = preset?.from ?? parseDateParam(params.get('from'), now)
  const to = preset?.to ?? parseDateParam(params.get('to'), startOfBakuDay(now, 2))
  if (!from || !to) return { ok: false, code: 'INVALID_DATE', message: 'from and to must be ISO 8601 timestamps.' }

  const level = params.get('level')
  if (level && !(level in LEVEL_LABELS)) {
    return { ok: false, code: 'INVALID_LEVEL', message: `level must be one of: ${Object.keys(LEVEL_LABELS).join(', ')}` }
  }
  const venue = params.get('venue')
  const venueId = venue ? Number(venue) : null
  if (venueId !== null && (!Number.isSafeInteger(venueId) || venueId <= 0)) {
    return { ok: false, code: 'INVALID_VENUE', message: 'venue must be a venue id.' }
  }

  const status = params.get('status')
  if (status && status !== 'open') return { ok: false, code: 'INVALID_STATUS', message: 'status only accepts "open".' }

  const when = params.get('when') ?? 'upcoming'
  if (!PROFILE_WINDOWS.includes(when as ProfileWindow)) {
    return { ok: false, code: 'INVALID_WINDOW', message: `when must be one of: ${PROFILE_WINDOWS.join(', ')}` }
  }

  return {
    ok: true,
    query: {
      when: when as ProfileWindow,
      sport,
      city,
      // Games that already started can't be joined, so the window never reaches into the past.
      from: from < now ? now : from,
      to,
      onlyOpen: status === 'open',
      level,
      venueId,
      page: clampInt(params.get('page'), 1, 1, Number.MAX_SAFE_INTEGER),
      limit: clampInt(params.get('limit'), GAMES_DEFAULT_LIMIT, 1, GAMES_MAX_LIMIT),
    },
  }
}

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export const PROFILE_ROLES = ['hosting', 'joined'] as const
export const PROFILE_WINDOWS = ['upcoming', 'past'] as const
export type ProfileRole = (typeof PROFILE_ROLES)[number]
export type ProfileWindow = (typeof PROFILE_WINDOWS)[number]

export type MyGamesQuery = { role: ProfileRole; when: ProfileWindow; page: number; limit: number }

/** Validates the "my games" list params. Defaults to the games the viewer joined, soonest first. */
export function parseMyGamesParams(params: URLSearchParams): ParseOk<MyGamesQuery> {
  const role = params.get('role') ?? 'joined'
  if (!PROFILE_ROLES.includes(role as ProfileRole)) {
    return { ok: false, code: 'INVALID_ROLE', message: `role must be one of: ${PROFILE_ROLES.join(', ')}` }
  }

  const when = params.get('when') ?? 'upcoming'
  if (!PROFILE_WINDOWS.includes(when as ProfileWindow)) {
    return { ok: false, code: 'INVALID_WINDOW', message: `when must be one of: ${PROFILE_WINDOWS.join(', ')}` }
  }

  return {
    ok: true,
    value: {
      role: role as ProfileRole,
      when: when as ProfileWindow,
      page: clampInt(params.get('page'), 1, 1, Number.MAX_SAFE_INTEGER),
      limit: clampInt(params.get('limit'), GAMES_DEFAULT_LIMIT, 1, GAMES_MAX_LIMIT),
    },
  }
}

type SearchParamsRecord = Record<string, string | string[] | undefined>

/**
 * The profile's "Mənim oyunlarım" tabs from `?games=joined|hosting&when=upcoming|past`. Unlike the
 * API params, anything unknown falls back to the default tab: a stale or mistyped link still opens
 * the page instead of failing.
 */
export function parseProfileTabs(params: SearchParamsRecord): { role: ProfileRole; when: ProfileWindow } {
  const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T) =>
    typeof value === 'string' && options.includes(value as T) ? (value as T) : fallback
  return {
    role: pick(params.games, PROFILE_ROLES, 'joined'),
    when: pick(params.when, PROFILE_WINDOWS, 'upcoming'),
  }
}

/** The query string for a profile tab, leaving the defaults out so the plain `/profile` stays canonical. */
export function profileTabsQuery({ role, when }: { role: ProfileRole; when: ProfileWindow }) {
  const params = new URLSearchParams()
  if (role !== 'joined') params.set('games', role)
  if (when !== 'upcoming') params.set('when', when)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const MAX_FULL_NAME_LENGTH = 120

/** Only the keys the request actually sent, so a PATCH never blanks a field it did not mention. */
export type ProfileUpdate = {
  fullName?: string
  /** null clears the stored number. */
  phone?: string | null
  /** null removes the uploaded picture. */
  profilePictureId?: number | null
  /** Emails about the games this user joined (lib/notify.ts). */
  emailNotifications?: boolean
}

/**
 * Validates "profilimi redaktə et". Email, role and googleId are deliberately not editable: the
 * account is a Google identity, and those three are what tie it to one.
 */
export function parseProfileUpdate(body: unknown): ParseOk<ProfileUpdate> {
  const fail = (code: string, message: string) => ({ ok: false as const, code, message })
  const data = asDoc(body)
  if (!data) return fail('INVALID_BODY', 'A JSON object is required.')

  const update: ProfileUpdate = {}

  if (data.fullName !== undefined) {
    const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : ''
    if (!fullName) return fail('INVALID_NAME', 'Ad və soyad boş ola bilməz.')
    if (fullName.length > MAX_FULL_NAME_LENGTH) {
      return fail('INVALID_NAME', `Ad və soyad ${MAX_FULL_NAME_LENGTH} simvoldan uzun ola bilməz.`)
    }
    update.fullName = fullName
  }

  if (data.phone !== undefined) {
    if (data.phone === null || data.phone === '') {
      update.phone = null
    } else {
      const phone = normalizePhone(data.phone)
      if (!phone) return fail('INVALID_PHONE', 'Telefon nömrəsi yanlışdır, məsələn +994 50 210 34 56.')
      update.phone = phone
    }
  }

  if (data.profilePictureId !== undefined) {
    if (data.profilePictureId === null || data.profilePictureId === '') {
      update.profilePictureId = null
    } else {
      const id = Number(data.profilePictureId)
      if (!Number.isSafeInteger(id) || id <= 0) return fail('INVALID_MEDIA', 'profilePictureId is not a valid upload.')
      update.profilePictureId = id
    }
  }

  if (data.emailNotifications !== undefined) {
    if (typeof data.emailNotifications !== 'boolean') return fail('INVALID_NOTIFICATIONS', 'emailNotifications must be true or false.')
    update.emailNotifications = data.emailNotifications
  }

  if (Object.keys(update).length === 0) return fail('NOTHING_TO_UPDATE', 'Dəyişdiriləcək heç nə göndərilmədi.')
  return { ok: true, value: update }
}

/**
 * What "Paylaş" sends along with the link: enough to decide from a WhatsApp message alone.
 * "Axşam futbolu · Şən, 18 Okt, 19:00 · Aku Arena · 3 yer qalıb".
 */
export function shareText(game: {
  title: string
  dateLabel: string | null
  timeLabel: string | null
  venue: { name: string }
  status: AvailabilityStatus
  remainingSpots: number
}) {
  const spots = game.status === 'open' ? `${game.remainingSpots} yer qalıb` : game.status === 'full' ? 'Oyun doludur' : null
  const when = [game.dateLabel, game.timeLabel].filter(Boolean).join(', ')
  return [game.title, when, game.venue.name, spots].filter(Boolean).join(' · ')
}

/**
 * "Siz 3-cüsünüz": a place in a queue, with the ordinal and "you are" suffixes in vowel harmony with
 * how the number is read. That is decided by its last spoken word: the units (üç → -cü), else the
 * tens (otuz → -cu), else yüz / min.
 */
export function placeLabel(n: number) {
  const UNITS = ['', 'i', 'i', 'ü', 'ü', 'i', 'ı', 'i', 'i', 'u'] // bir iki üç dörd beş altı yeddi səkkiz doqquz
  const TENS = ['', 'u', 'i', 'u', 'ı', 'i', 'ı', 'i', 'i', 'ı'] // on iyirmi otuz qırx əlli altmış yetmiş səksən doxsan
  const vowel = n % 10 ? UNITS[n % 10] : Math.floor(n / 10) % 10 ? TENS[Math.floor(n / 10) % 10] : n % 1000 ? 'ü' : 'i'
  const you = { i: 'siniz', ı: 'sınız', u: 'sunuz', ü: 'sünüz' }[vowel]
  return `${n}-c${vowel}${you}`
}
