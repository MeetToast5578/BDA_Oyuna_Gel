// Response shapes of the /api/v1 endpoints, derived from the functions that build them so the
// frontend can't drift from the backend. Type-only imports: nothing server-side reaches the client bundle.
import type { AvailabilityStatus, countOpenGamesBySport, normalizeVenue, toGameCard } from '@/lib/game-backend'
import type { findGames, getFeaturedGames, getGameDetail, getGamePlayers } from '@/lib/game-queries'
import type { findMyGames, getMyProfile, getPublicProfile } from '@/lib/profile-queries'

export type { AvailabilityStatus }
export type GameCard = ReturnType<typeof toGameCard>
export type FeaturedGame = Awaited<ReturnType<typeof getFeaturedGames>>[number]
export type GameDetail = NonNullable<Awaited<ReturnType<typeof getGameDetail>>>
export type GameListResponse = Awaited<ReturnType<typeof findGames>>
/** One page of game cards: `GET /api/v1/games` and `GET /api/v1/me/games` both answer with this. */
export type GamePage = { games: GameCard[]; pagination: GameListResponse['pagination'] }
export type SportSummary = ReturnType<typeof countOpenGamesBySport>[number]
/** One sport tab above a game list: its games counted for that list (open ones, or past ones). */
export type SportTab = { sport: string; label: string; iconKey: string; count: number }
export type Venue = ReturnType<typeof normalizeVenue>
export type Participant = FeaturedGame['participants']['preview'][number]
/** `GET /api/v1/games/{id}/participants`: the "İştirakçılar" list. */
export type GamePlayers = NonNullable<Awaited<ReturnType<typeof getGamePlayers>>>
export type GamePlayer = GamePlayers['players'][number]

export type CreateGameRequest = {
  sport: string
  level: string
  venueId: number
  scheduledDate: string
  scheduledTime: string
  currentCount: number
  maxCount: number
  hostPhone?: string
  title?: string
  /** The club on each side (home must be one of the host's); absent or null leaves the side open. */
  homeTeamId?: number | null
  awayTeamId?: number | null
  /** Replace the profile's number with `hostPhone` ("Bu nömrəni profilimdə saxla"). */
  saveToProfile?: boolean
}

export type MyProfile = NonNullable<Awaited<ReturnType<typeof getMyProfile>>>
export type PublicProfile = NonNullable<Awaited<ReturnType<typeof getPublicProfile>>>
export type MyGamesResponse = Awaited<ReturnType<typeof findMyGames>>
export type PlayedBySport = MyProfile['stats']['playedBySport'][number]

export type ProfileUpdateRequest = {
  fullName?: string
  phone?: string | null
  profilePictureId?: number | null
}

export type LeaveResponse = {
  id: string
  status: AvailabilityStatus
  remainingSpots: number
  currentCount: number
  maxCount: number
  game: GameDetail | null
}

export type CurrentUser = {
  id: number
  fullName: string
  firstName: string
  initials: string
  avatarUrl: string | null
  email: string
  phoneNumber: string | null
}
