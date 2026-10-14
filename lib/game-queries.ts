import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { cacheLife, cacheTag } from 'next/cache'
import type { Payload, Where } from 'payload'

import { GAMES_CACHE_TAG, invalidateGamesCache } from '@/lib/cache-tags'
import {
  DEFAULT_CITY,
  FEATURED_WINDOW_HOURS,
  SPORT_META,
  SPORTS,
  countOpenGamesBySport,
  deriveAvailability,
  foldForSearch,
  isUpcoming,
  normalizeGameRecord,
  normalizePhone,
  normalizeVenue,
  rankFeatured,
  toGameCard,
  toPlayer,
  type CreateGameInput,
  type GameListQuery,
} from '@/lib/game-backend'

/**
 * Cached reads refresh at least this often; game, venue and join writes expire them immediately.
 * The `minutes` profile revalidates on the same 60s cadence these reads used before.
 */
const CACHE_PROFILE = 'minutes'
/** Rounding applied to the list window's start, so requests in the same minute share a cache entry. */
const LIST_BUCKET_MS = 60_000
const FEATURED_CANDIDATE_LIMIT = 100
const PARTICIPANT_PREVIEW_SIZE = 5
const HOUR_MS = 60 * 60 * 1000

const CARD_SELECT = {
  title: true,
  sport: true,
  level: true,
  arena: true,
  host: true,
  scheduledAt: true,
  maxPlayers: true,
  availablePlayers: true,
  status: true,
  coverImage: true,
  image: true,
} as const

const CARD_POPULATE = { users: { fullName: true, profilePicture: true, avatarUrl: true } } as const

type ParticipantPreview = ReturnType<typeof toPlayer>

export async function getPayloadClient() {
  const { getPayload } = await import('payload')
  const config = (await import('@/payload.config')).default
  return getPayload({ config })
}

function cityWhere(field: 'arena.city' | 'city', city: string): Where {
  // Venues created before the city field existed have no value and are in the default city.
  return city === DEFAULT_CITY
    ? { or: [{ [field]: { equals: city } }, { [field]: { exists: false } }] }
    : { [field]: { equals: city } }
}

function upcomingOpenWhere(city: string, from: Date, to?: Date): Where {
  return {
    and: [
      { status: { equals: 'scheduled' } },
      { scheduledAt: { greater_than: from.toISOString() } },
      ...(to ? [{ scheduledAt: { less_than: to.toISOString() } }] : []),
      { availablePlayers: { greater_than: 0 } },
      cityWhere('arena.city', city),
    ],
  }
}

/** First players to join each game, oldest first, for the avatar stacks. */
async function findParticipantPreviews(payload: Payload, gameIds: Array<number | string>) {
  const previews = new Map<string, ParticipantPreview[]>()
  if (gameIds.length === 0) return previews

  const { docs } = await payload.find({
    collection: 'game-participants',
    where: { game: { in: gameIds } },
    select: { game: true, user: true, name: true },
    populate: { ...CARD_POPULATE, games: { title: true } },
    sort: 'createdAt',
    depth: 2,
    pagination: false,
    overrideAccess: true,
  })

  for (const participant of docs) {
    const gameId = String(typeof participant.game === 'object' ? participant.game?.id : participant.game)
    const preview = previews.get(gameId) ?? []
    if (preview.length >= PARTICIPANT_PREVIEW_SIZE) continue
    preview.push(toPlayer(participant))
    previews.set(gameId, preview)
  }
  return previews
}

async function findOpenGameSlots(city: string) {
  'use cache'
  cacheLife(CACHE_PROFILE)
  cacheTag(GAMES_CACHE_TAG)

  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'games',
    where: upcomingOpenWhere(city, new Date()),
    select: { sport: true, status: true, scheduledAt: true, maxPlayers: true, availablePlayers: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

export async function getOpenGamesCountBySport(city: string, now = Date.now()) {
  // Availability is re-derived per request so a game that started since the cache fill is not counted.
  const slots = await findOpenGameSlots(city)
  return countOpenGamesBySport(
    slots.map((slot) => ({ sport: String(slot.sport), status: deriveAvailability(slot, now).status })),
  )
}

/**
 * The raw list read, cached per distinct filter set. `from` arrives bucketed (see `findGames`) so
 * repeat requests within the same bucket share one read instead of each paying a database round trip.
 */
async function findGameDocs(
  sport: string | null,
  city: string,
  fromIso: string,
  toIso: string,
  onlyOpen: boolean,
  level: string | null,
  venueId: number | null,
  page: number,
  limit: number,
) {
  'use cache'
  cacheLife(CACHE_PROFILE)
  cacheTag(GAMES_CACHE_TAG)

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'games',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { scheduledAt: { greater_than: fromIso } },
        { scheduledAt: { less_than: toIso } },
        cityWhere('arena.city', city),
        ...(sport ? [{ sport: { equals: sport } }] : []),
        ...(onlyOpen ? [{ availablePlayers: { greater_than: 0 } }] : []),
        ...(level ? [{ level: { equals: level } }] : []),
        ...(venueId ? [{ arena: { equals: venueId } }] : []),
      ],
    },
    select: CARD_SELECT,
    populate: CARD_POPULATE,
    sort: 'scheduledAt',
    page,
    limit,
    depth: 2,
    overrideAccess: true,
  })
  return {
    docs: result.docs,
    page: result.page ?? page,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
  }
}

export async function findGames(query: GameListQuery, now = new Date()) {
  if (query.when === 'past') return findPastGames(query, now)

  // `query.from` is "now", which would make every request a unique cache key. Bucketing it keeps the
  // key stable for a minute; availability is still re-derived per request below, and the games that
  // started inside the bucket are dropped so the list matches an unbucketed read exactly.
  const fromIso = bucketed(query.from)
  const result = await findGameDocs(
    query.sport,
    query.city,
    fromIso,
    query.to.toISOString(),
    query.onlyOpen,
    query.level,
    query.venueId,
    query.page,
    query.limit,
  )

  const games = result.docs
    .map((doc) => toGameCard(normalizeGameRecord(doc, now.getTime())))
    .filter((game) => isUpcoming(game.status))

  return {
    games,
    pagination: {
      page: result.page,
      limit: query.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
    },
  }
}

/** Games that have started, not cancelled, most recent first. Cached like the upcoming list. */
async function findPastGameDocs(sport: string | null, city: string, beforeIso: string, page: number, limit: number) {
  'use cache'
  cacheLife(CACHE_PROFILE)
  cacheTag(GAMES_CACHE_TAG)

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'games',
    where: {
      and: [
        { status: { not_equals: 'cancelled' } },
        { scheduledAt: { less_than_equal: beforeIso } },
        cityWhere('arena.city', city),
        ...(sport ? [{ sport: { equals: sport } }] : []),
      ],
    },
    select: CARD_SELECT,
    populate: CARD_POPULATE,
    sort: '-scheduledAt',
    page,
    limit,
    depth: 2,
    overrideAccess: true,
  })
  return {
    docs: result.docs,
    page: result.page ?? page,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
  }
}

/** Rounds "now" down to the list bucket, so requests in the same minute share a cache entry. */
function bucketed(now: Date) {
  return new Date(Math.floor(now.getTime() / LIST_BUCKET_MS) * LIST_BUCKET_MS).toISOString()
}

/**
 * "Keçmiş oyunlar": games that have already started, the most recent first. Cancelled games are
 * left out: this is the list of games that happened (a player's own history still shows them).
 */
async function findPastGames(query: GameListQuery, now: Date) {
  // A game that started inside the current minute joins the list with the next bucket.
  const result = await findPastGameDocs(query.sport, query.city, bucketed(now), query.page, query.limit)
  return {
    games: result.docs.map((doc) => toGameCard(normalizeGameRecord(doc, now.getTime()))),
    pagination: {
      page: result.page,
      limit: query.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
    },
  }
}

async function countPastGames(city: string, beforeIso: string) {
  'use cache'
  cacheLife(CACHE_PROFILE)
  cacheTag(GAMES_CACHE_TAG)

  const payload = await getPayloadClient()
  const counts = await Promise.all(
    SPORTS.map(async (sport) => {
      const { totalDocs } = await payload.count({
        collection: 'games',
        where: {
          and: [
            { sport: { equals: sport } },
            { status: { not_equals: 'cancelled' } },
            { scheduledAt: { less_than_equal: beforeIso } },
            cityWhere('arena.city', city),
          ],
        },
        overrideAccess: true,
      })
      return [sport, totalDocs] as const
    }),
  )
  return Object.fromEntries(counts) as Record<string, number>
}

/** Past games per sport, for the tabs above "Keçmiş oyunlar"; every sport listed, like the open counts. */
export async function getPastGamesCountBySport(city: string, now = new Date()) {
  const counts = await countPastGames(city, bucketed(now))
  return SPORTS.map((sport) => ({
    sport,
    label: SPORT_META[sport].label,
    iconKey: SPORT_META[sport].iconKey,
    count: counts[sport] ?? 0,
  }))
}

async function findFeaturedCandidates(city: string) {
  'use cache'
  cacheLife(CACHE_PROFILE)
  cacheTag(GAMES_CACHE_TAG)

  const payload = await getPayloadClient()
  const now = Date.now()
  const { docs } = await payload.find({
    collection: 'games',
    where: upcomingOpenWhere(city, new Date(now), new Date(now + FEATURED_WINDOW_HOURS * HOUR_MS)),
    select: CARD_SELECT,
    populate: CARD_POPULATE,
    sort: 'scheduledAt',
    limit: FEATURED_CANDIDATE_LIMIT,
    depth: 2,
    overrideAccess: true,
  })
  const previews = await findParticipantPreviews(payload, docs.map((doc) => doc.id))
  return docs.map((doc) => ({ doc, participants: previews.get(String(doc.id)) ?? [] }))
}

export async function getFeaturedGames(city: string, limit: number, now = Date.now()) {
  const candidates = await findFeaturedCandidates(city)
  const games = candidates.map(({ doc, participants }) => ({ ...normalizeGameRecord(doc, now), participants }))

  // Ranking and labels are computed per request so they never go stale with the cache.
  return rankFeatured(games, now, limit).map((game) => ({
    ...toGameCard(game),
    participants: { preview: game.participants, total: game.currentCount },
  }))
}

/**
 * The "Oyun Detalı" page. Not cached: `viewer` and the host's phone depend on who is asking.
 * The phone is only revealed to players who joined and to the host.
 *
 * `viewerId` may still be resolving (the page's session lookup): only the "has this viewer joined"
 * check waits for it, so the game itself is read in parallel with the session.
 */
export async function getGameDetail(
  gameId: number,
  viewerId: number | null | Promise<number | null>,
  now = Date.now(),
) {
  const payload = await getPayloadClient()
  const viewer = Promise.resolve(viewerId)

  // All three only need `gameId`, so they go out together: against a remote database each extra
  // sequential round trip costs a full network latency.
  const [doc, previews, [resolvedViewerId, joined]] = await Promise.all([
    payload.findByID({
      collection: 'games',
      id: gameId,
      select: { ...CARD_SELECT, contactPhone: true },
      populate: CARD_POPULATE,
      depth: 2,
      overrideAccess: true,
      disableErrors: true,
    }),
    findParticipantPreviews(payload, [gameId]),
    viewer.then(async (id) => {
      if (id === null) return [id, false] as const
      const { totalDocs } = await payload.count({
        collection: 'game-participants',
        where: { and: [{ game: { equals: gameId } }, { user: { equals: id } }] },
        overrideAccess: true,
      })
      return [id, totalDocs > 0] as const
    }),
  ])
  if (!doc) return null

  const game = normalizeGameRecord(doc, now)
  const hostId = typeof doc.host === 'object' ? doc.host?.id : doc.host
  const isHost = resolvedViewerId !== null && hostId === resolvedViewerId

  return {
    ...toGameCard(game),
    host: { ...game.host, phone: joined || isHost ? doc.contactPhone ?? null : null },
    participants: { preview: previews.get(String(gameId)) ?? [], total: game.currentCount },
    viewer: { joined, isHost },
  }
}

/**
 * Everyone in a game, for the "İştirakçılar" list the avatar row opens: the host first, then the
 * players in the order they joined, each with the account id their row links to. `you` marks the
 * viewer's own row.
 *
 * `others` is the rest of `currentCount`: players the host said were already coming when they
 * created the game (a count that includes the host), who have no account to list.
 *
 * Not cached: it is only read when someone opens the list, and must already show a join from a
 * second ago.
 */
export async function getGamePlayers(gameId: number, viewerId: number | null) {
  const payload = await getPayloadClient()
  const [doc, { docs }] = await Promise.all([
    payload.findByID({
      collection: 'games',
      id: gameId,
      select: CARD_SELECT,
      populate: CARD_POPULATE,
      depth: 2,
      overrideAccess: true,
      disableErrors: true,
    }),
    payload.find({
      collection: 'game-participants',
      where: { game: { equals: gameId } },
      select: { user: true, name: true },
      populate: CARD_POPULATE,
      sort: 'createdAt',
      depth: 2,
      pagination: false,
      overrideAccess: true,
    }),
  ])
  if (!doc) return null

  const game = normalizeGameRecord(doc)
  const isViewer = (id: string | null) => id !== null && viewerId !== null && id === String(viewerId)
  const players = docs
    .map(toPlayer)
    // The host's spot is the game itself; a stray participant row for them would list them twice.
    .filter((player) => player.id === null || player.id !== game.host.id)
    .map((player) => ({ ...player, you: isViewer(player.id) }))

  return {
    game: { id: game.id, title: game.title, currentCount: game.currentCount, maxCount: game.maxCount },
    host: { ...game.host, you: isViewer(game.host.id) },
    players,
    others: Math.max(0, game.currentCount - players.length - 1),
  }
}

type CreateGameResult =
  | { ok: true; game: NonNullable<Awaited<ReturnType<typeof getGameDetail>>> }
  | { ok: false; code: string; message: string }

/** Creates a game hosted by the signed-in user from a validated create-game form. */
export async function createGame(host: { id: number; phoneNumber?: string | null }, input: CreateGameInput): Promise<CreateGameResult> {
  const payload = await getPayloadClient()
  const venue = await payload.findByID({
    collection: 'arenas',
    id: input.venueId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!venue) return { ok: false, code: 'VENUE_NOT_FOUND', message: 'Meydança tapılmadı.' }
  if (venue.sportTypes?.length && !venue.sportTypes.includes(input.sport as (typeof venue.sportTypes)[number])) {
    return { ok: false, code: 'VENUE_SPORT_MISMATCH', message: 'Bu meydançada seçilmiş idman növü oynanmır.' }
  }

  // The design reveals this number to players after they join ("Bir addım qaldı").
  const contactPhone = input.contactPhone ?? normalizePhone(host.phoneNumber)
  if (!contactPhone) return { ok: false, code: 'PHONE_REQUIRED', message: 'Host telefon nömrəsi tələb olunur.' }

  // One transaction: the game and its first player, the host, are created together or not at all.
  const transactionID = (await payload.db.beginTransaction()) ?? undefined
  const req = { transactionID }
  let gameId: number
  try {
    const created = await payload.create({
      collection: 'games',
      overrideAccess: true,
      req,
      data: {
        title: input.title,
        sport: input.sport as 'football' | 'basketball' | 'tennis',
        level: input.level as 'beginner' | 'medium' | 'high',
        arena: venue.id,
        host: host.id,
        scheduledAt: input.scheduledAt.toISOString(),
        maxPlayers: input.maxCount,
        // currentCount includes the host (parseCreateGameBody), so the host's spot is already taken.
        availablePlayers: input.maxCount - input.currentCount,
        contactPhone,
        status: 'scheduled',
      },
    })
    await payload.create({
      collection: 'game-participants',
      overrideAccess: true,
      req,
      data: { game: created.id, user: host.id, phone: contactPhone },
    })
    if (transactionID !== undefined) await payload.db.commitTransaction(transactionID)
    gameId = created.id
  } catch (error) {
    if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  // The collection hooks already expired the cache, but before the commit; a read in between could refill it.
  invalidateGamesCache()

  const game = await getGameDetail(gameId, host.id)
  if (!game) throw new Error(`Game ${gameId} disappeared right after creation`)
  return { ok: true, game }
}

/** The host of a game, for the edit and delete permission checks. Null when the game is gone. */
export async function getGameHostId(gameId: number) {
  const payload = await getPayloadClient()
  const doc = await payload.findByID({
    collection: 'games',
    id: gameId,
    select: { host: true },
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!doc) return null
  const host = doc.host as { id?: number } | number | null
  return typeof host === 'object' ? (host?.id ?? null) : host
}

/**
 * Applies an edited create-game form to an existing game. The host and its players never change.
 *
 * The size is changed by Postgres on the locked row, not from the count the route read earlier: a
 * join or leave landing between that read and this save would otherwise be overwritten, overbooking
 * the game or losing a spot. `SET` sees the row as it was, so the free spots move by exactly the
 * change in size, and the same statement refuses a game that has started or would end up too small.
 */
export async function updateGame(gameId: number, input: CreateGameInput): Promise<CreateGameResult> {
  const payload = await getPayloadClient()
  const venue = await payload.findByID({
    collection: 'arenas',
    id: input.venueId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!venue) return { ok: false, code: 'VENUE_NOT_FOUND', message: 'Meydança tapılmadı.' }
  if (venue.sportTypes?.length && !venue.sportTypes.includes(input.sport as (typeof venue.sportTypes)[number])) {
    return { ok: false, code: 'VENUE_SPORT_MISMATCH', message: 'Bu meydançada seçilmiş idman növü oynanmır.' }
  }
  if (!input.contactPhone) return { ok: false, code: 'PHONE_REQUIRED', message: 'Host telefon nömrəsi tələb olunur.' }

  const transactionID = (await payload.db.beginTransaction()) ?? undefined
  const adapter = payload.db as unknown as PostgresAdapter
  const db = (transactionID !== undefined ? adapter.sessions[String(transactionID)]?.db : undefined) ?? adapter.drizzle
  try {
    const resized = await db.execute(sql`
      UPDATE games
      SET max_players = ${input.maxCount},
          available_players = available_players + (${input.maxCount} - max_players),
          updated_at = now()
      WHERE id = ${gameId}
        AND status = 'scheduled'
        AND scheduled_at > now()
        AND available_players + (${input.maxCount} - max_players) >= 0
      RETURNING id
    `)
    if (resized.rows.length === 0) {
      if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
      return await editRejection(adapter.drizzle, gameId)
    }

    await payload.update({
      collection: 'games',
      id: gameId,
      overrideAccess: true,
      req: { transactionID },
      data: {
        title: input.title,
        sport: input.sport as 'football' | 'basketball' | 'tennis',
        level: input.level as 'beginner' | 'medium' | 'high',
        arena: venue.id,
        scheduledAt: input.scheduledAt.toISOString(),
        contactPhone: input.contactPhone,
      },
    })
    if (transactionID !== undefined) await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  // The collection hook already expired the cache, but before the commit; a read in between could refill it.
  invalidateGamesCache()

  const game = await getGameDetail(gameId, null)
  if (!game) return { ok: false, code: 'GAME_NOT_FOUND', message: 'Oyun tapılmadı.' }
  return { ok: true, game }
}

/** Why the resize in `updateGame` matched no row, read after its transaction was rolled back. */
async function editRejection(db: PostgresAdapter['drizzle'], gameId: number): Promise<CreateGameResult> {
  const { rows } = await db.execute<{ upcoming: boolean; status: string; taken: number }>(sql`
    SELECT status, scheduled_at > now() AS upcoming, max_players - available_players AS taken
    FROM games
    WHERE id = ${gameId}
  `)
  const game = rows[0]
  if (!game) return { ok: false, code: 'GAME_NOT_FOUND', message: 'Oyun tapılmadı.' }
  if (game.status !== 'scheduled' || !game.upcoming) {
    return { ok: false, code: 'GAME_STARTED', message: 'Oyun artıq başlayıb — onu dəyişmək və ya silmək mümkün deyil.' }
  }
  return {
    ok: false,
    code: 'MAX_COUNT_BELOW_PLAYERS',
    message: `Oyunda artıq ${game.taken} oyunçu var, maksimum say bundan az ola bilməz.`,
  }
}

/**
 * Deletes a game and the participant rows that point at it.
 *
 * The participants have to go first and explicitly: their foreign key is ON DELETE SET NULL, so
 * dropping the game on its own would leave rows behind with a null game, which then show up in
 * every participant count. Both run in one transaction so a game is never left half-deleted.
 */
export async function deleteGame(gameId: number) {
  const payload = await getPayloadClient()
  const transactionID = (await payload.db.beginTransaction()) ?? undefined
  const req = { transactionID }
  try {
    await payload.delete({
      collection: 'game-participants',
      where: { game: { equals: gameId } },
      overrideAccess: true,
      req,
    })
    await payload.delete({ collection: 'games', id: gameId, overrideAccess: true, req })
    if (transactionID !== undefined) await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  // The collection hooks already expired the cache, but before the commit; a read in between could refill it.
  invalidateGamesCache()
}

async function findVenues(city: string) {
  'use cache'
  cacheLife(CACHE_PROFILE)
  cacheTag(GAMES_CACHE_TAG)

  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'arenas',
    where: cityWhere('city', city),
    select: { name: true, location: true, city: true, district: true, address: true, coordinates: true, sportTypes: true },
    sort: 'name',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

/** Venue picker options. Venues without sport types listed are offered for every sport. */
export async function listVenues(city: string, sport: string | null, search: string | null) {
  const needle = search?.trim() ? foldForSearch(search.trim()) : null
  return (await findVenues(city))
    .map((doc) => normalizeVenue(doc))
    .filter((venue) => !sport || venue.sportTypes.length === 0 || venue.sportTypes.includes(sport))
    .filter((venue) => !needle || [venue.name, venue.district, venue.address].some((text) => text && foldForSearch(text).includes(needle)))
}
