import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, Where } from 'payload'

import { invalidateGamesCache } from '@/lib/cache-tags'
import {
  SPORT_META,
  SPORTS,
  formatBakuMonthYear,
  initialsOf,
  normalizeGameRecord,
  toGameCard,
  userAvatarUrl,
  type MyGamesQuery,
  type ProfileUpdate,
} from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { promoteWaiting } from '@/lib/join-game'
import type { Promotions } from '@/lib/promotions'
import { playerRecords } from '@/lib/records'
import { leaveAllClubs, userClubs } from '@/lib/teams'
import { summarize, summarizeBySport } from '@/lib/team-logic'

/**
 * A profile is always read for one signed-in person, so nothing here is cached: it would key on the
 * viewer and the entries would never be reused.
 */

function upcomingWhere(when: MyGamesQuery['when'], now: Date): Where {
  return when === 'upcoming'
    ? { and: [{ scheduledAt: { greater_than: now.toISOString() } }, { status: { equals: 'scheduled' } }] }
    : { scheduledAt: { less_than_equal: now.toISOString() } }
}

/**
 * Games that count as played in the stats: over, and not called off. The "past" lists still show
 * cancelled games, labelled as such, but nobody played them.
 */
function playedWhere(now: Date): Where {
  return { and: [upcomingWhere('past', now), { status: { not_equals: 'cancelled' } }] }
}

/**
 * Game ids this user holds a participant row for, for the "Qoşulduğum" list. Only the ids, so even a
 * few thousand stay cheap; the list itself is paged by the games query.
 */
async function participatedGameIds(payload: Payload, userId: number) {
  const { docs } = await payload.find({
    collection: 'game-participants',
    where: { user: { equals: userId } },
    select: { game: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
    .map((doc) => (typeof doc.game === 'object' ? doc.game?.id : doc.game))
    .filter((id): id is number => typeof id === 'number')
}

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

const EMPTY_LIST = {
  games: [],
  pagination: { page: 1, limit: 0, totalDocs: 0, totalPages: 0, hasNextPage: false },
}

/**
 * "Mənim oyunlarım" — the same card shape as `GET /api/v1/games`, so the profile page renders them
 * with the components it already has instead of re-deriving status and labels.
 */
export async function findMyGames(userId: number, query: MyGamesQuery, now = new Date()) {
  const payload = await getPayloadClient()

  let idFilter: Where | null = null
  if (query.role === 'joined') {
    const ids = await participatedGameIds(payload, userId)
    if (ids.length === 0) return { ...EMPTY_LIST, pagination: { ...EMPTY_LIST.pagination, limit: query.limit } }
    // A host is a participant in their own game, but those belong under "hosting".
    idFilter = { and: [{ id: { in: ids } }, { host: { not_equals: userId } }] }
  }

  const result = await payload.find({
    collection: 'games',
    where: {
      and: [
        upcomingWhere(query.when, now),
        ...(query.role === 'hosting' ? [{ host: { equals: userId } } as Where] : []),
        ...(idFilter ? [idFilter] : []),
      ],
    },
    select: CARD_SELECT,
    populate: CARD_POPULATE,
    // Upcoming games read forwards from now; past ones read backwards from the most recent.
    sort: query.when === 'upcoming' ? 'scheduledAt' : '-scheduledAt',
    page: query.page,
    limit: query.limit,
    depth: 2,
    overrideAccess: true,
  })

  return {
    games: result.docs.map((doc) => toGameCard(normalizeGameRecord(doc, now.getTime()))),
    pagination: {
      page: result.page ?? query.page,
      limit: query.limit,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
    },
  }
}

/**
 * How many games the user hosts and has joined, and the games played per sport, in one query over
 * everything they ever hosted or joined. The upcoming counts match the "Qarşıdakı" lists; the past ones
 * (`hostedPast`, `played`) leave out cancelled games, which nobody played. A host is a participant in
 * their own game, so "joined" means games hosted by someone else (or by a deleted account).
 */
async function gameCounts(payload: Payload, userId: number, now: Date) {
  const at = now.toISOString()
  const { rows } = await (payload.db as unknown as PostgresAdapter).drizzle.execute<{
    sport: string
    hosting_upcoming: string
    hosted_past: string
    joined_upcoming: string
    played: string
  }>(sql`
    SELECT g.sport,
      count(*) FILTER (WHERE g.host_id = ${userId} AND g.status = 'scheduled' AND g.scheduled_at > ${at}) AS hosting_upcoming,
      count(*) FILTER (WHERE g.host_id = ${userId} AND g.scheduled_at <= ${at} AND g.status <> 'cancelled') AS hosted_past,
      count(*) FILTER (WHERE g.host_id IS DISTINCT FROM ${userId} AND g.status = 'scheduled' AND g.scheduled_at > ${at}) AS joined_upcoming,
      count(*) FILTER (WHERE g.host_id IS DISTINCT FROM ${userId} AND g.scheduled_at <= ${at} AND g.status <> 'cancelled') AS played
    FROM games g
    WHERE g.host_id = ${userId} OR EXISTS (SELECT 1 FROM game_participants p WHERE p.game_id = g.id AND p.user_id = ${userId})
    GROUP BY g.sport
  `)
  const sum = (key: Exclude<keyof (typeof rows)[number], 'sport'>) => rows.reduce((total, row) => total + Number(row[key]), 0)
  const bySport = SPORTS.map((sport) => {
    const row = rows.find((candidate) => candidate.sport === sport)
    return {
      sport,
      label: SPORT_META[sport].label,
      iconKey: SPORT_META[sport].iconKey,
      // Played, hosted or joined: adds up to `played + hostedPast`.
      playedCount: row ? Number(row.hosted_past) + Number(row.played) : 0,
    }
  })
  return {
    counts: { hostingUpcoming: sum('hosting_upcoming'), hostedPast: sum('hosted_past'), joinedUpcoming: sum('joined_upcoming'), played: sum('played') },
    bySport,
  }
}

/**
 * A person's win/draw/loss record from games with a confirmed score (their side in each), overall and
 * per sport, and the clubs they are in. Games without a confirmed score count as played in the other
 * stats but have no result to add here.
 */
async function recordAndClubs(payload: Payload, userId: number) {
  const [records, clubs] = await Promise.all([
    playerRecords((payload.db as unknown as PostgresAdapter).drizzle, [userId]),
    userClubs(payload, userId),
  ])
  const games = records.get(userId) ?? []
  return { record: { ...summarize(games), bySport: summarizeBySport(games, SPORTS) }, clubs }
}

/** The signed-in user's own profile: identity, counts and stats in one request. */
export async function getMyProfile(userId: number, now = new Date()) {
  const payload = await getPayloadClient()
  const [user, { counts, bySport }, results] = await Promise.all([
    payload.findByID({
      collection: 'users',
      id: userId,
      depth: 1,
      overrideAccess: true,
      disableErrors: true,
    }),
    gameCounts(payload, userId, now),
    recordAndClubs(payload, userId),
  ])
  if (!user) return null

  const fullName = user.fullName?.trim() || user.email

  return {
    id: String(user.id),
    fullName,
    firstName: fullName.split(/\s+/)[0],
    initials: initialsOf(fullName),
    email: user.email,
    phoneNumber: user.phoneNumber ?? null,
    /** Accounts from before the setting existed have no value, which means on. */
    emailNotifications: user.emailNotifications !== false,
    avatarUrl: userAvatarUrl(user),
    memberSince: user.createdAt,
    memberSinceLabel: formatBakuMonthYear(user.createdAt),
    /** An uploaded picture is set, so "Şəkli sil" has something to remove (the Google one can't be). */
    hasUploadedPicture: relationId(user.profilePicture) !== null,
    /** What `avatarUrl` falls back to once the uploaded picture is removed. */
    googleAvatarUrl: user.avatarUrl?.trim() || null,
    counts: {
      hostingUpcoming: counts.hostingUpcoming,
      hostedPast: counts.hostedPast,
      joinedUpcoming: counts.joinedUpcoming,
      played: counts.played,
    },
    stats: {
      /** Every game played, hosted or joined: the sum of `playedBySport`. */
      totalPlayed: bySport.reduce((sum, sport) => sum + sport.playedCount, 0),
      playedBySport: bySport,
    },
    ...results,
  }
}

export type MyProfile = NonNullable<Awaited<ReturnType<typeof getMyProfile>>>

type UpdateResult = { ok: true; profile: MyProfile } | { ok: false; code: string; message: string }

/** Phone numbers are unique across accounts (`users.phone_number`). */
async function phoneTakenByOther(payload: Payload, phone: string, userId: number) {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: { and: [{ phoneNumber: { equals: phone } }, { id: { not_equals: userId } }] },
    overrideAccess: true,
  })
  return totalDocs > 0
}

/**
 * Keeps the number someone just used to create or join a game on their profile, so the next form
 * starts with it. It fills an empty profile number; a different one already there is only replaced
 * when they asked (`overwrite`, the forms' "Bu nömrəni profilimdə saxla"). A number another account
 * holds is left alone. Best effort: says whether it saved, and never fails the game action it follows.
 */
export async function rememberPhone(userId: number, phone: string, { overwrite = false } = {}) {
  try {
    const payload = await getPayloadClient()
    const user = await payload.findByID({
      collection: 'users',
      id: userId,
      select: { phoneNumber: true },
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!user || user.phoneNumber === phone) return false
    if (user.phoneNumber && !overwrite) return false
    if (await phoneTakenByOther(payload, phone, userId)) return false

    await payload.update({ collection: 'users', id: userId, data: { phoneNumber: phone }, overrideAccess: true })
    return true
  } catch (error) {
    // A race for the same number ends at the unique index; the game action has already succeeded.
    console.error('Failed to remember phone number', error)
    return false
  }
}

/** The id behind a relationship value, populated or not. */
function relationId(value: unknown) {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' ? id : null
}

/** Deletes uploads, file and all. Best effort: a leftover file must never fail what came before it. */
async function deleteUploads(payload: Payload, where: Where) {
  try {
    await payload.delete({ collection: 'media', where, overrideAccess: true })
  } catch (error) {
    console.error('Failed to delete uploads', error)
  }
}

/**
 * Applies a validated profile edit. Phone numbers are unique, so a clash is reported as such.
 *
 * A picture must be one this user uploaded: any other id — a venue photo, someone else's avatar —
 * is answered as if it did not exist, which also keeps quiet about what does. The picture it
 * replaces, if this user uploaded it, is deleted: nothing else can point at it, and it is theirs.
 */
export async function updateMyProfile(userId: number, update: ProfileUpdate): Promise<UpdateResult> {
  const payload = await getPayloadClient()

  const current = await payload.findByID({
    collection: 'users',
    id: userId,
    select: { profilePicture: true },
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!current) return { ok: false, code: 'USER_NOT_FOUND', message: 'İstifadəçi tapılmadı.' }
  const currentPictureId = relationId(current.profilePicture)

  if (update.profilePictureId != null && update.profilePictureId !== currentPictureId) {
    const media = await payload.findByID({
      collection: 'media',
      id: update.profilePictureId,
      select: { uploadedBy: true },
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!media || relationId(media.uploadedBy) !== userId) {
      return { ok: false, code: 'MEDIA_NOT_FOUND', message: 'Şəkil tapılmadı.' }
    }
  }

  if (update.phone && (await phoneTakenByOther(payload, update.phone, userId))) {
    return { ok: false, code: 'PHONE_TAKEN', message: 'Bu nömrə başqa hesabda istifadə olunur.' }
  }

  await payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    data: {
      ...(update.fullName !== undefined ? { fullName: update.fullName } : {}),
      ...(update.phone !== undefined ? { phoneNumber: update.phone } : {}),
      ...(update.profilePictureId !== undefined ? { profilePicture: update.profilePictureId } : {}),
      ...(update.emailNotifications !== undefined ? { emailNotifications: update.emailNotifications } : {}),
    },
  })
  // The host's name and picture are shown on every card they host.
  invalidateGamesCache()

  const replacedPicture = update.profilePictureId !== undefined && update.profilePictureId !== currentPictureId
  if (replacedPicture && currentPictureId !== null) {
    await deleteUploads(payload, { and: [{ id: { equals: currentPictureId } }, { uploadedBy: { equals: userId } }] })
  }

  const profile = await getMyProfile(userId)
  if (!profile) return { ok: false, code: 'USER_NOT_FOUND', message: 'İstifadəçi tapılmadı.' }
  return { ok: true, profile }
}

/**
 * Deletes an account and everything that would otherwise point at nothing.
 *
 * The games this user hosts that haven't started go with them, with their participant rows: nobody
 * would be left to run them. Games that already started stay, because they are part of the other
 * players' history and stats; `games.host_id` is ON DELETE SET NULL, so they simply lose their host,
 * and the host's contact number is cleared from them. This user's own participations go too, and
 * their spots in upcoming games are handed back. One transaction, all or nothing. Their uploaded
 * pictures are deleted afterwards.
 */
export async function deleteMyAccount(userId: number) {
  const payload = await getPayloadClient()

  // Exactly the "Qarşıdakı" hosting list (hostingUpcoming), which the confirm dialog counts.
  const hosted = await payload.find({
    collection: 'games',
    where: {
      and: [
        { host: { equals: userId } },
        { status: { equals: 'scheduled' } },
        { scheduledAt: { greater_than: new Date().toISOString() } },
      ],
    },
    select: { title: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const hostedIds = hosted.docs.map((doc) => doc.id)
  const uploads = await payload.find({
    collection: 'media',
    where: { uploadedBy: { equals: userId } },
    select: { alt: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const uploadIds = uploads.docs.map((doc) => doc.id)

  const transactionID = (await payload.db.beginTransaction()) ?? undefined
  const req = { transactionID }
  const promotions: Promotions = []
  const adapter = payload.db as unknown as PostgresAdapter
  const db = (transactionID !== undefined ? adapter.sessions[String(transactionID)]?.db : undefined) ?? adapter.drizzle
  try {
    if (hostedIds.length > 0) {
      // Joins take these rows' locks too: one landing mid-delete waits, then finds no game, instead of
      // leaving a participant row behind. Locked in id order, like everything else that locks games.
      await db.execute(sql`SELECT id FROM games WHERE id IN (${sql.join(hostedIds.map((id) => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`)
      await payload.delete({
        collection: 'game-participants',
        where: { game: { in: hostedIds } },
        overrideAccess: true,
        req,
      })
      await payload.delete({ collection: 'games', where: { id: { in: hostedIds } }, overrideAccess: true, req })
    }
    // Spots this user held in other people's games that have not started go back to those games, as
    // if they had left each one ("Oyundan çıx"); past games keep their numbers as they were played.
    // Runs before the participant rows go, since it finds the games through them. LEAST keeps a
    // game from ever showing more free spots than it has places.
    // The games where their leaving frees a spot, read (and locked, in id order, so two deletions sharing
    // games can't deadlock) before their rows go: whoever is waiting for each takes it once the rows are gone.
    const freeing = await db.execute<{ id: number }>(sql`
      SELECT g.id FROM games g JOIN game_participants p ON p.game_id = g.id
      WHERE p.user_id = ${userId} AND g.host_id IS DISTINCT FROM ${userId} AND g.status = 'scheduled' AND g.scheduled_at > now()
      ORDER BY g.id
      FOR UPDATE OF g
    `)
    // The games that stay keep no trace of how to reach the person who deleted their account.
    await db.execute(sql`UPDATE games SET contact_phone = NULL, updated_at = now() WHERE host_id = ${userId}`)
    await db.execute(sql`
      UPDATE games
      SET available_players = LEAST(games.available_players + 1, games.max_players), updated_at = now()
      FROM game_participants
      WHERE game_participants.game_id = games.id
        AND game_participants.user_id = ${userId}
        AND games.host_id IS DISTINCT FROM ${userId}
        AND games.status = 'scheduled'
        AND games.scheduled_at > now()
    `)
    await payload.delete({
      collection: 'game-participants',
      where: { user: { equals: userId } },
      overrideAccess: true,
      req,
    })
    for (const { id } of freeing.rows) promotions.push({ gameId: id, userIds: await promoteWaiting(db, id) })
    // Each club they captain goes to its longest-standing member first: once the account is gone the
    // captain column only empties, which would leave a club with members and nobody in charge.
    await leaveAllClubs(db, userId)
    await payload.delete({ collection: 'users', id: userId, overrideAccess: true, req })
    if (transactionID !== undefined) await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (transactionID !== undefined) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  invalidateGamesCache()
  // Their pictures go too. After the commit, because deleting an upload also deletes its files, which
  // no transaction can bring back; `uploadedBy` is ON DELETE SET NULL, so they are found by the ids
  // collected before.
  if (uploadIds.length > 0) await deleteUploads(payload, { id: { in: uploadIds } })

  return { deletedGames: hostedIds.length, promotions }
}

/**
 * Another player's public profile — what a game card already reveals about a host, plus the games
 * they are running. Never their email or phone: the host's number stays gated behind joining.
 */
export async function getPublicProfile(userId: number, now = new Date()) {
  const payload = await getPayloadClient()
  // All three need only the id, so they go out together rather than the games waiting on the user.
  const [user, hosting, hostedPast, results] = await Promise.all([
    payload.findByID({
      collection: 'users',
      id: userId,
      select: { fullName: true, profilePicture: true, avatarUrl: true, createdAt: true },
      depth: 1,
      overrideAccess: true,
      disableErrors: true,
    }),
    payload.find({
      collection: 'games',
      where: { and: [{ host: { equals: userId } }, upcomingWhere('upcoming', now)] },
      select: CARD_SELECT,
      populate: CARD_POPULATE,
      sort: 'scheduledAt',
      limit: 20,
      depth: 2,
      overrideAccess: true,
    }),
    payload.count({
      collection: 'games',
      where: { and: [{ host: { equals: userId } }, playedWhere(now)] },
      overrideAccess: true,
    }),
    recordAndClubs(payload, userId),
  ])
  if (!user) return null

  const fullName = user.fullName?.trim() || 'OyunaGəl istifadəçisi'
  return {
    id: String(user.id),
    fullName,
    firstName: fullName.split(/\s+/)[0],
    initials: initialsOf(fullName),
    avatarUrl: userAvatarUrl(user),
    memberSince: user.createdAt,
    memberSinceLabel: formatBakuMonthYear(user.createdAt),
    counts: { hostingUpcoming: hosting.totalDocs, hostedPast: hostedPast.totalDocs },
    hostedGames: hosting.docs.map((doc) => toGameCard(normalizeGameRecord(doc, now.getTime()))),
    ...results,
  }
}
