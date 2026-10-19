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
  venueImageUrl,
  rankFeatured,
  toGameCard,
  toPlayer,
  type CreateGameInput,
  type GameListQuery,
} from '@/lib/game-backend'
import { addInvites, INVITE_ERRORS } from '@/lib/invites'
import { readSides } from '@/lib/join-game'
import {
  checkSides,
  clubSidesError,
  effectiveResultStatus,
  nextResultStatus,
  occupancy,
  sideCapacity,
  type ResultState,
  type ResultStatus,
} from '@/lib/team-logic'

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
  homeTeam: true,
  awayTeam: true,
} as const

const CARD_POPULATE = { users: { fullName: true, profilePicture: true, avatarUrl: true }, teams: { name: true } } as const

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
async function findPastGameDocs(
  sport: string | null,
  city: string,
  beforeIso: string,
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
        { status: { not_equals: 'cancelled' } },
        { scheduledAt: { less_than_equal: beforeIso } },
        cityWhere('arena.city', city),
        ...(sport ? [{ sport: { equals: sport } }] : []),
        ...(level ? [{ level: { equals: level } }] : []),
        ...(venueId ? [{ arena: { equals: venueId } }] : []),
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
  const result = await findPastGameDocs(query.sport, query.city, bucketed(now), query.level, query.venueId, query.page, query.limit)
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
  const [doc, previews, [resolvedViewerId, joined], sides] = await Promise.all([
    payload.findByID({
      collection: 'games',
      id: gameId,
      select: { ...CARD_SELECT, contactPhone: true, homeScore: true, awayScore: true, resultStatus: true, resultReportedAt: true },
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
    readSides((payload.db as unknown as PostgresAdapter).drizzle, gameId),
  ])
  if (!doc) return null

  // Free spots per side, for the join panel's side picker.
  const taken = occupancy(sides.game.maxPlayers, sides.players.map((player) => player.side), sides.guests, sides.hostSide)
  const cap = sideCapacity(sides.game.maxPlayers)

  const game = normalizeGameRecord(doc, now)
  const hostId = typeof doc.host === 'object' ? doc.host?.id : doc.host
  const isHost = resolvedViewerId !== null && hostId === resolvedViewerId

  // The score and what this viewer may do with it, decided by the same rules the result routes use.
  const resultState: ResultState = { status: doc.resultStatus ?? null, reportedAt: doc.resultReportedAt ?? null }
  const scored = typeof doc.homeScore === 'number' && typeof doc.awayScore === 'number' && resultState.status !== null
  const resultActor = {
    isHost,
    isAdmin: false,
    side: sides.players.find((player) => player.userId === resolvedViewerId)?.side ?? null,
    hostSide: sides.hostSide,
  }
  const finished = game.status === 'finished'
  const can = (action: 'report' | 'confirm') => nextResultStatus(resultState, action, resultActor, finished, now).ok

  // The club the host put against their own side; its captain may take it out of the game.
  const opponentClubId = sides.hostSide === 'home' ? sides.game.awayTeamId : sides.game.homeTeamId
  const canDeclineClub =
    resolvedViewerId !== null && opponentClubId !== null && isUpcoming(game.status) &&
    (await payload.count({
      collection: 'teams',
      where: { and: [{ id: { equals: opponentClubId } }, { captain: { equals: resolvedViewerId } }] },
      overrideAccess: true,
    }).then(({ totalDocs }) => totalDocs > 0))

  return {
    ...toGameCard(game),
    host: { ...game.host, phone: joined || isHost ? doc.contactPhone ?? null : null },
    participants: { preview: previews.get(String(gameId)) ?? [], total: game.currentCount },
    viewer: { joined, isHost, canDeclineClub },
    freeBySide: { home: Math.max(cap - taken.home, 0), away: Math.max(cap - taken.away, 0) },
    /** The side the host stands on, where their guests stand too. */
    hostSide: sides.hostSide,
    result: scored
      ? { homeScore: doc.homeScore as number, awayScore: doc.awayScore as number, status: effectiveResultStatus(resultState, now) as ResultStatus }
      : null,
    canReport: isHost && can('report'),
    canConfirm: resolvedViewerId !== null && can('confirm'),
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
      select: { user: true, name: true, side: true },
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
  const hostSide = docs.map(toPlayer).find((player) => player.id !== null && player.id === game.host.id)?.side ?? 'home'
  const players = docs
    .map(toPlayer)
    // The host's spot is the game itself; a stray participant row for them would list them twice.
    .filter((player) => player.id === null || player.id !== game.host.id)
    .map((player) => ({ ...player, you: isViewer(player.id) }))

  return {
    game: { id: game.id, title: game.title, currentCount: game.currentCount, maxCount: game.maxCount },
    host: { ...game.host, side: hostSide, you: isViewer(game.host.id) },
    // Only the host moves players, and only until kick-off; the sides route enforces the same.
    canMove: isViewer(game.host.id) && isUpcoming(game.status),
    // The clubs' names, where a side has one; the dialog says "A komandası" for an open side.
    sideNames: { home: game.teams.home?.name ?? null, away: game.teams.away?.name ?? null },
    players,
    others: Math.max(0, game.currentCount - players.length - 1),
  }
}

type CreateGameResult =
  | { ok: true; game: NonNullable<Awaited<ReturnType<typeof getGameDetail>>> }
  | { ok: false; code: string; message: string }

/** Why a game's clubs were refused, as the message the form shows. */
const CLUB_ERRORS = {
  TEAM_NOT_FOUND: 'Komanda tapılmadı.',
  TEAM_SPORT_MISMATCH: 'Seçilən komanda bu idman növünü oynamır.',
  SAME_TEAM: 'A və B komandaları eyni ola bilməz.',
} as const

/**
 * Checks the clubs a create or edit form picked: they exist, play the game's sport, and aren't the
 * same club. Who may stand on which side is `checkSides`' job once the game row holds the clubs.
 */
async function clubsError(payload: Awaited<ReturnType<typeof getPayloadClient>>, input: CreateGameInput): Promise<CreateGameResult | null> {
  const find = async (id: number | null) =>
    id === null ? null : await payload.findByID({ collection: 'teams', id, depth: 0, overrideAccess: true, disableErrors: true })
  const [home, away] = await Promise.all([find(input.homeTeamId), find(input.awayTeamId)])
  if ((input.homeTeamId !== null && !home) || (input.awayTeamId !== null && !away)) {
    return { ok: false, code: 'TEAM_NOT_FOUND', message: CLUB_ERRORS.TEAM_NOT_FOUND }
  }
  const code = clubSidesError(input.sport, home && { id: home.id, sport: home.sport }, away && { id: away.id, sport: away.sport })
  return code ? { ok: false, code, message: CLUB_ERRORS[code] } : null
}

/** The transaction's own database handle, so reads inside it see what it has written so far. */
function transactionDb(payload: Awaited<ReturnType<typeof getPayloadClient>>, transactionID: string | number | undefined) {
  const adapter = payload.db as unknown as PostgresAdapter
  return (transactionID !== undefined ? adapter.sessions[String(transactionID)]?.db : undefined) ?? adapter.drizzle
}

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
  const clubs = await clubsError(payload, input)
  if (clubs) return clubs

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
        homeTeam: input.homeTeamId,
        awayTeam: input.awayTeamId,
      },
    })
    await payload.create({
      collection: 'game-participants',
      overrideAccess: true,
      req,
      data: { game: created.id, user: host.id, phone: contactPhone, side: input.hostSide },
    })
    // The host stands on the side they chose, so that side's club, if it has one, must be one of theirs.
    const sides = await readSides(transactionDb(payload, transactionID), created.id)
    if (!checkSides(sides.game, sides.players, sides.guests, sides.hostId).ok) {
      if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
      return { ok: false, code: 'NOT_A_MEMBER', message: 'Seçdiyiniz tərəfin komandasının üzvü olmalısınız.' }
    }
    // The players the host named: checked and written with the game, so a refusal leaves no game behind.
    const refused = await addInvites(transactionDb(payload, transactionID), created.id, sides.game, host.id, input.invites)
    if (refused) {
      if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
      return { ok: false, code: refused.code, message: INVITE_ERRORS[refused.code].message }
    }
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
  const clubs = await clubsError(payload, input)
  if (clubs) return clubs

  const transactionID = (await payload.db.beginTransaction()) ?? undefined
  const adapter = payload.db as unknown as PostgresAdapter
  const db = transactionDb(payload, transactionID)
  try {
    // The clubs are written with the size, so the side check below sees them as they would stand.
    const resized = await db.execute(sql`
      UPDATE games
      SET max_players = ${input.maxCount},
          available_players = available_players + (${input.maxCount} - max_players),
          home_team_id = ${input.homeTeamId},
          away_team_id = ${input.awayTeamId},
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
    // The resize must leave neither side over half the game, and each club's side only its members;
    // the host moves players first.
    const sides = await readSides(db, gameId)
    const checked = checkSides(sides.game, sides.players, sides.guests, sides.hostId)
    if (!checked.ok) {
      if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
      return checked.code === 'NOT_A_MEMBER'
        ? { ok: false, code: 'NOT_A_MEMBER', message: 'Seçilən komandanın üzvü olmayan oyunçular var. Əvvəlcə onları köçürün.' }
        : { ok: false, code: 'SIDE_FULL', message: 'Komandalardan birində bu saydan çox oyunçu var. Əvvəlcə oyunçuları köçürün.' }
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
    select: {
      name: true,
      location: true,
      city: true,
      district: true,
      address: true,
      coordinates: true,
      sportTypes: true,
      image: true,
      imagePath: true,
      description: true,
    },
    sort: 'name',
    // The photo, for the venue pages; the picker only reads the other fields.
    depth: 1,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

/** "Meydançalar": every venue in the city with its photo and description, for `/venues`. */
export async function listVenuePages(city: string) {
  return (await findVenues(city)).map((doc) => ({
    ...normalizeVenue(doc),
    imageUrl: venueImageUrl(doc),
    description: typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
  }))
}

/** One venue's page; null when there is no such venue in the city. Read from the same cached list. */
export async function getVenuePage(id: number, city = DEFAULT_CITY) {
  return (await listVenuePages(city)).find((venue) => venue.id === String(id)) ?? null
}

/** Venue picker options. Venues without sport types listed are offered for every sport. */
export async function listVenues(city: string, sport: string | null, search: string | null) {
  const needle = search?.trim() ? foldForSearch(search.trim()) : null
  return (await findVenues(city))
    .map((doc) => normalizeVenue(doc))
    .filter((venue) => !sport || venue.sportTypes.length === 0 || venue.sportTypes.includes(sport))
    .filter((venue) => !needle || [venue.name, venue.district, venue.address].some((text) => text && foldForSearch(text).includes(needle)))
}
