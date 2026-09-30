/**
 * Fills the database with a realistic sample dataset: venues across Baku, players, teams, games in
 * every availability state, the join rows behind each game's player count, and an audit trail.
 *
 * Run with `npm run seed`. Re-running is safe: every game, venue and team is removed first (real ones
 * included), and it is deterministic, so the same run produces the same data. Only user accounts
 * outside the seed domain — your own admin login — are kept.
 */
import { getPayload } from 'payload'

import config from '../payload.config'
import { BAKU_UTC_OFFSET, SPORTS, startOfBakuDay } from '../lib/game-backend'

/** Seed accounts are recognised by this email domain; that is how the wipe leaves real users alone. */
const SEED_EMAIL_DOMAIN = 'seed.oyunagel.az'
const SEED_PASSWORD = 'OyunaGel2026!'
/** Fixed so a re-run reproduces exactly the same dataset. */
const RANDOM_SEED = 20260917

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

type Sport = 'football' | 'basketball' | 'tennis'
type Level = 'beginner' | 'medium' | 'high'
type GameStatus = 'scheduled' | 'live' | 'finished' | 'cancelled'

// ---------------------------------------------------------------------------- random

/** mulberry32: small, seeded and stable, so the dataset does not churn between runs. */
function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = createRandom(RANDOM_SEED)
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]
const pickInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))

function shuffled<T>(items: readonly T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// ---------------------------------------------------------------------------- people

const MALE_FIRST_NAMES = [
  'Elvin', 'Rəşad', 'Nicat', 'Orxan', 'Kamran', 'Tural', 'Fərid', 'Ramil', 'Emin', 'Anar',
  'Vüsal', 'Ceyhun', 'Murad', 'Samir', 'Elçin', 'Rüfət', 'Ayxan', 'Ülvi', 'Zaur', 'Nurlan',
  'Xəyal', 'Səbuhi', 'Fuad', 'İlkin', 'Toğrul', 'Kənan', 'Mahir', 'Şahin',
]
const FEMALE_FIRST_NAMES = [
  'Aysel', 'Nərmin', 'Gülnar', 'Leyla', 'Ülviyyə', 'Sevinc', 'Günel', 'Aytən', 'Nigar', 'Lalə',
  'Zeynəb', 'Fidan', 'Şəbnəm', 'Aysu',
]
const SURNAME_STEMS = [
  'Məmməd', 'Əli', 'Hüseyn', 'Quli', 'Həsən', 'İsmayıl', 'Rəhim', 'Abbas', 'Kərim', 'Mustafa',
  'Nəbi', 'Vəli', 'Səfər', 'Bayram', 'Cəfər', 'Axund', 'Salman', 'Oruc', 'Tağı', 'Şirin',
]

/** Azerbaijani letters have no place in an email local part or a slug. */
function slugify(text: string) {
  return text
    .toLocaleLowerCase('az')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

const PHONE_PREFIXES = ['50', '51', '55', '70', '77', '10']

function buildPeople(count: number) {
  const names = shuffled([
    ...MALE_FIRST_NAMES.map((first) => ({ first, female: false })),
    ...FEMALE_FIRST_NAMES.map((first) => ({ first, female: true })),
  ])

  return Array.from({ length: count }, (_, index) => {
    const { first, female } = names[index % names.length]
    const stem = SURNAME_STEMS[(index * 7 + 3) % SURNAME_STEMS.length]
    const last = `${stem}ov${female ? 'a' : ''}`
    const fullName = `${first} ${last}`
    return {
      fullName,
      email: `${slugify(fullName)}.${index + 1}@${SEED_EMAIL_DOMAIN}`,
      // Sequential digits keep every phone number and email unique without a retry loop.
      phoneNumber: `+994${PHONE_PREFIXES[index % PHONE_PREFIXES.length]}${3100000 + index * 37}`,
    }
  })
}

// ---------------------------------------------------------------------------- venues

const VENUES: Array<{
  name: string
  district: string
  address: string
  coordinates: string
  sportTypes: Sport[]
  description: string
}> = [
  { name: 'Inter Arena', district: 'Nərimanov', address: 'Ağa Nemətulla küç. 12', coordinates: '40.4093,49.8671', sportTypes: ['football', 'basketball', 'tennis'], description: 'Süni örtüklü açıq meydança, işıqlandırma və soyunub-geyinmə otaqları ilə.' },
  { name: 'Aku Arena', district: 'Nizami', address: 'Qara Qarayev pr. 41', coordinates: '40.4021,49.9245', sportTypes: ['football'], description: 'İki ədəd 5-ə-5 mini-futbol meydançası.' },
  { name: '707 Stadium', district: 'Xətai', address: 'Babək pr. 74', coordinates: '40.3856,49.9012', sportTypes: ['football'], description: 'Tribunalı örtülü stadion, gecə saatlarında da açıqdır.' },
  { name: 'Sahil Sport Mərkəzi', district: 'Səbail', address: 'Neftçilər pr. 18', coordinates: '40.3721,49.8402', sportTypes: ['basketball', 'tennis'], description: 'Dənizkənarı parkda yerləşən açıq basketbol və tennis kortları.' },
  { name: 'Yasamal Idman Kompleksi', district: 'Yasamal', address: 'Şərifzadə küç. 203', coordinates: '40.3948,49.8134', sportTypes: ['football', 'basketball'], description: 'Bələdiyyə idman kompleksi, qapalı zal və açıq meydança.' },
  { name: 'Binəqədi Futbol Parkı', district: 'Binəqədi', address: 'Ə. Naxçıvani küç. 55', coordinates: '40.4587,49.8213', sportTypes: ['football'], description: 'Üç açıq meydança və avtomobil dayanacağı.' },
  { name: 'Nəsimi Arena', district: 'Nəsimi', address: 'Azadlıq pr. 132', coordinates: '40.4012,49.8478', sportTypes: ['football', 'basketball'], description: 'Şəhər mərkəzinə yaxın, metroya 5 dəqiqəlik məsafədə.' },
  { name: 'Xəzər Tennis Klubu', district: 'Xəzər', address: 'Şüvəlan qəs., Sahil küç. 9', coordinates: '40.4712,50.1583', sportTypes: ['tennis'], description: 'Dörd torpaq kort, məşqçi dəstəyi ilə.' },
  { name: 'Sabunçu İdman Meydanı', district: 'Sabunçu', address: 'Bakıxanov qəs., Həzi Aslanov küç. 3', coordinates: '40.4359,49.9471', sportTypes: ['football', 'basketball'], description: 'Məhəllə idman meydanı, həftəsonları daha sıx olur.' },
  { name: 'Qaradağ Sport Hub', district: 'Qaradağ', address: 'Səngəçal qəs., Sahil yolu 2', coordinates: '40.2064,49.4531', sportTypes: ['football', 'tennis'], description: 'Şəhərdən kənarda, geniş dayanacaqlı yeni kompleks.' },
  { name: 'Suraxanı Basket Zalı', district: 'Suraxanı', address: 'Hövsan qəs., Nizami küç. 27', coordinates: '40.4148,50.0074', sportTypes: ['basketball'], description: 'Qapalı parket zal, il boyu istifadəyə uyğundur.' },
  { name: 'Dərnəgül Mini Futbol', district: 'Binəqədi', address: 'Dərnəgül şosesi 91', coordinates: '40.4423,49.8356', sportTypes: ['football'], description: 'Kiçik ölçülü iki meydança, sürətli oyunlar üçün.' },
]

// ---------------------------------------------------------------------------- teams

const TEAMS: Array<{ name: string; shortName: string; sport: Sport }> = [
  { name: 'Xəzər United', shortName: 'XZU', sport: 'football' },
  { name: 'Abşeron FC', shortName: 'ABS', sport: 'football' },
  { name: 'Neftçilər Pickup', shortName: 'NFT', sport: 'football' },
  { name: 'Odlar Yurdu FC', shortName: 'ODY', sport: 'football' },
  { name: 'Baku Ballers', shortName: 'BKB', sport: 'basketball' },
  { name: 'Nizami Hoops', shortName: 'NZH', sport: 'basketball' },
  { name: 'Sahil Streetball', shortName: 'SHS', sport: 'basketball' },
  { name: 'Xəzər Racket Club', shortName: 'XRC', sport: 'tennis' },
  { name: 'Baku Tennis Academy', shortName: 'BTA', sport: 'tennis' },
]

// ---------------------------------------------------------------------------- games

/** Sport-neutral names, safe at any time and for any size. */
const NEUTRAL_TITLES = ['Dostluq oyunu', 'Məhəllə oyunu', 'Yoldaşlıq oyunu']
/** The Azerbaijani suffix in "5-ə-5" follows the number: beş → ə, altı → ya, yeddi → yə. */
const SIDE_SUFFIX: Record<number, string> = { 3: 'ə', 4: 'ə', 5: 'ə', 6: 'ya', 7: 'yə' }

const LEVELS: Level[] = ['beginner', 'medium', 'high']
const MAX_PLAYERS: Record<Sport, number[]> = {
  // Even and within SPORT_META's maxPlayers, as the create-game API requires.
  football: [10, 12, 14],
  basketball: [6, 8, 10],
  tennis: [2, 4],
}
/** Baku local kick-off times; mornings and evenings are the busy ones. */
const SLOT_HOURS = [9, 11, 13, 15, 17, 18, 19, 20, 21, 22]

/** A kick-off time in Baku local hours, `dayOffset` days from today. */
function bakuSlot(dayOffset: number, hour: number, minute: number) {
  return new Date(startOfBakuDay(new Date(), dayOffset).getTime() + hour * HOUR_MS + minute * MINUTE_MS)
}

function bakuHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', hour: '2-digit', hourCycle: 'h23' }).format(date))
}

/**
 * Named after when and how the game is played, so a title never contradicts its own date, time or
 * size: "Axşam 5-ə-5" is an evening game of five a side, "Cümə axşamı …" really is on a Thursday.
 */
function titleFor(game: Pick<PlannedGame, 'sport' | 'maxPlayers' | 'scheduledAt'>) {
  if (random() < 0.25) return pick(NEUTRAL_TITLES)
  const side = game.maxPlayers / 2
  const format =
    game.sport === 'tennis' ? (side === 1 ? 'tək oyun' : 'cütlük oyunu') : `${side}-${SIDE_SUFFIX[side]}-${side}`
  const hour = bakuHour(game.scheduledAt)
  const dayPart = hour < 12 ? 'Səhər' : hour < 16 ? 'Günorta' : hour < 22 ? 'Axşam' : 'Gecə'
  const weekday = new Intl.DateTimeFormat('az', { timeZone: 'Asia/Baku', weekday: 'long' }).format(game.scheduledAt)
  return `${pick([dayPart, weekday.charAt(0).toLocaleUpperCase('az') + weekday.slice(1)])} ${format}`
}

type PlannedGame = {
  title: string
  sport: Sport
  level: Level
  venueIndex: number
  scheduledAt: Date
  maxPlayers: number
  /** Players already in, the host included (so always at least 1); the game gets one participant row per player but the host. */
  currentCount: number
  status: GameStatus
  homeScore: number
  awayScore: number
}

/**
 * Spreads games over the past week and the next two weeks. Past games are finished or cancelled,
 * upcoming ones are scheduled with a mix of availability, so every UI state has real data behind it:
 * plenty of free spots, a single spot left, and full.
 */
function planGames(): PlannedGame[] {
  const games: PlannedGame[] = []
  const nowHour = bakuHour()

  for (let dayOffset = -7; dayOffset <= 13; dayOffset++) {
    // Today can only host slots that have not started yet; the next two days are the busiest.
    const slots = SLOT_HOURS.filter((hour) => dayOffset !== 0 || hour >= nowHour + 2)
    const perDay = dayOffset < 0 ? 3 : dayOffset <= 2 ? 5 : 3
    const hours = shuffled(slots).slice(0, Math.min(perDay, slots.length))
    const booked = new Map<number, number[]>()

    for (const hour of hours) {
      // A venue hosts one game at a time: skip any that already has one within two hours (a game runs up to 90 minutes).
      let venueIndex: number
      do venueIndex = pickInt(0, VENUES.length - 1)
      while (booked.get(venueIndex)?.some((other) => Math.abs(other - hour) < 2))
      booked.set(venueIndex, [...(booked.get(venueIndex) ?? []), hour])
      const venue = VENUES[venueIndex]
      const sport = pick(venue.sportTypes)
      const maxPlayers = pick(MAX_PLAYERS[sport])

      let status: GameStatus = 'scheduled'
      let homeScore = 0
      let awayScore = 0
      // The host is always the first player, so no game is ever empty; a 2-player tennis game is 1 (open) or 2 (full).
      const fewest = Math.min(2, maxPlayers - 1)
      let currentCount = pickInt(fewest, Math.max(fewest, maxPlayers - 3))

      if (dayOffset < 0) {
        // One in five past games fell through; the rest were played to the end.
        status = random() < 0.2 ? 'cancelled' : 'finished'
        if (status === 'finished') {
          currentCount = maxPlayers
          homeScore = pickInt(0, sport === 'basketball' ? 98 : 6)
          awayScore = pickInt(0, sport === 'basketball' ? 98 : 6)
        }
      } else {
        const roll = random()
        if (roll < 0.15) currentCount = maxPlayers // full
        else if (roll < 0.4) currentCount = Math.max(1, maxPlayers - pickInt(1, 2)) // almost gone
      }

      games.push({
        title: '', // set below, once the live game has its final time
        sport,
        level: pick(LEVELS),
        venueIndex,
        scheduledAt: bakuSlot(dayOffset, hour, pick([0, 0, 30])),
        maxPlayers,
        currentCount,
        status,
        homeScore,
        awayScore,
      })
    }
  }

  // One game kicked off half an hour ago, so the "live" status is represented too.
  const live = games.find((game) => game.status === 'finished')
  if (live) {
    live.status = 'live'
    live.scheduledAt = new Date(Date.now() - 30 * MINUTE_MS)
    live.currentCount = live.maxPlayers
  }

  for (const game of games) game.title = titleFor(game)
  return games
}

// ---------------------------------------------------------------------------- run

const payload = await getPayload({ config })
const log = (message: string) => payload.logger.info(message)

/**
 * Payload's bulk delete removes documents one at a time, which against a remote database turns a
 * re-run into a ten-minute wait. These tables hold seed data only, so one TRUNCATE clears them:
 * CASCADE takes the relationship tables (teams_rels, arenas_sport_types) with them, and RESTART
 * IDENTITY puts ids back to 1 so re-running really does reproduce the same rows.
 */
log('Clearing previous seed data…')
const SEEDED_TABLES = ['game_participants', 'join_attempts', 'games', 'teams', 'arenas']
await payload.db.pool.query(`TRUNCATE TABLE ${SEEDED_TABLES.join(', ')} RESTART IDENTITY CASCADE`)

// Users are the exception: real accounts share the table, so only seed addresses are removed.
const removed = await payload.db.pool.query('DELETE FROM users WHERE email LIKE $1', [`%@${SEED_EMAIL_DOMAIN}`])
log(`Removed ${removed.rowCount ?? 0} seed accounts; anything outside @${SEED_EMAIL_DOMAIN} was left alone.`)

/** Postgres collections use numeric ids, as `payload-types.ts` reflects. */
type Id = number
type SeedUser = { id: Id; fullName: string; phoneNumber: string }

const PLAYER_COUNT = 36
log(`Creating ${PLAYER_COUNT} players…`)
const users: SeedUser[] = []
for (const [index, person] of buildPeople(PLAYER_COUNT).entries()) {
  const created = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email: person.email,
      password: SEED_PASSWORD,
      fullName: person.fullName,
      phoneNumber: person.phoneNumber,
      // A couple of seed moderators, so the admin panel has more than one role to look at.
      role: index < 2 ? 'admin' : 'user',
    },
  })
  users.push({ id: created.id, fullName: person.fullName, phoneNumber: person.phoneNumber })
}

log(`Creating ${VENUES.length} venues…`)
const arenaIds: Id[] = []
for (const venue of VENUES) {
  const created = await payload.create({
    collection: 'arenas',
    overrideAccess: true,
    data: {
      name: venue.name,
      location: `${venue.district}, Bakı`,
      city: 'baku',
      district: venue.district,
      address: venue.address,
      coordinates: venue.coordinates,
      // Each venue's photo ships in public/images/arenas, named after the venue.
      imagePath: `/images/arenas/${slugify(venue.name).replace(/\./g, '-')}.png`,
      sportTypes: venue.sportTypes,
      description: venue.description,
    },
  })
  arenaIds.push(created.id)
}

log(`Creating ${TEAMS.length} teams…`)
const teamsBySport = new Map<Sport, Id[]>()
for (const team of TEAMS) {
  const members = shuffled(users).slice(0, pickInt(5, 9)).map((user) => user.id)
  const created = await payload.create({
    collection: 'teams',
    overrideAccess: true,
    data: { name: team.name, shortName: team.shortName, sport: team.sport, members },
  })
  teamsBySport.set(team.sport, [...(teamsBySport.get(team.sport) ?? []), created.id])
}

const planned = planGames()
log(`Creating ${planned.length} games and their participants…`)
let participantCount = 0
const createdGames: Array<{ id: Id; players: Id[] }> = []

for (const [index, game] of planned.entries()) {
  // Round-robin, so the (at most five) games of one day all have different hosts.
  const host = users[index % users.length]
  // The host is the game itself and has no participant row; the rest of `currentCount` are joined players.
  const roster = shuffled(users.filter((user) => user.id !== host.id)).slice(0, game.currentCount - 1)
  const teams = shuffled(teamsBySport.get(game.sport) ?? [])

  const created = await payload.create({
    collection: 'games',
    overrideAccess: true,
    data: {
      title: game.title,
      sport: game.sport,
      level: game.level,
      arena: arenaIds[game.venueIndex],
      host: host.id,
      contactPhone: host.phoneNumber,
      scheduledAt: game.scheduledAt.toISOString(),
      maxPlayers: game.maxPlayers,
      // The join endpoint keeps these two in step; the seed has to do the same (the host takes a spot).
      availablePlayers: game.maxPlayers - game.currentCount,
      status: game.status,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      // Only matches that were actually played are recorded as team-vs-team.
      ...(game.status === 'finished' && teams.length > 1 ? { homeTeam: teams[0], awayTeam: teams[1] } : {}),
    },
  })

  for (const player of roster) {
    await payload.create({
      collection: 'game-participants',
      overrideAccess: true,
      data: { game: created.id, user: player.id, phone: player.phoneNumber },
    })
    participantCount++
  }

  createdGames.push({ id: created.id, players: roster.map((player) => player.id) })
}

// A believable audit trail: successful joins plus the rejections the endpoint records.
log('Writing join attempts…')
const REJECTIONS = ['GAME_FULL', 'ALREADY_JOINED', 'GAME_NOT_JOINABLE', 'UNAUTHENTICATED'] as const
let attempts = 0
for (const game of shuffled(createdGames).slice(0, 18)) {
  const outcome = random() < 0.55 ? 'JOINED' : pick(REJECTIONS)
  await payload.create({
    collection: 'join-attempts',
    overrideAccess: true,
    data: {
      outcome,
      gameId: Number(game.id),
      user: outcome === 'UNAUTHENTICATED' ? undefined : pick(game.players.length ? game.players : users.map((user) => user.id)),
      remainingSpots: outcome === 'JOINED' ? pickInt(0, 4) : undefined,
      ip: `94.20.${pickInt(0, 255)}.${pickInt(1, 254)}`,
    },
  })
  attempts++
}

const upcoming = planned.filter((game) => game.status === 'scheduled').length
const open = planned.filter((game) => game.status === 'scheduled' && game.currentCount < game.maxPlayers).length
log('─'.repeat(52))
log(`Seed complete — ${users.length} players, ${arenaIds.length} venues, ${TEAMS.length} teams,`)
log(`${planned.length} games (${upcoming} upcoming, ${open} with open spots), ${participantCount} participants, ${attempts} join attempts.`)
log(`Seed logins: any @${SEED_EMAIL_DOMAIN} address, password ${SEED_PASSWORD}`)
log(`Sports covered: ${SPORTS.join(', ')} · times are Baku local (UTC${BAKU_UTC_OFFSET})`)
