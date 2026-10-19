import { unstable_rethrow } from 'next/navigation'
import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import { listUsers, USER_FILTERS, USER_PAGE_MAX, USER_PAGE_SIZE, type UserFilter } from '@/lib/invites'

const positiveInt = (raw: string | null, fallback: number) => {
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 1 ? value : Number.NaN
}

/**
 * The player list behind "Oyunçu əlavə et". Signed-in only. `q` narrows by name (any length, ignoring
 * case and Azerbaijani letters), `filter` is `all` (default), `clubs` (members of the caller's clubs) or
 * `recent` (people they have played with), `page` and `limit` (1–50, default 20) page through it, and
 * `gameId` leaves out people already in or invited to that game. Never the caller, and only what a
 * public profile already shows: `{ users: [{ id, name, initials, avatarUrl }], hasMore }`.
 */
export async function GET(request: Request) {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Oyunçuları görmək üçün daxil olun.', 401)

    const params = new URL(request.url).searchParams
    const gameId = positiveInt(params.get('gameId'), 0)
    const page = positiveInt(params.get('page'), 1)
    const limit = positiveInt(params.get('limit'), USER_PAGE_SIZE)
    const filter = (params.get('filter') ?? 'all') as UserFilter
    if (Number.isNaN(gameId)) return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)
    if (Number.isNaN(page) || Number.isNaN(limit) || limit > USER_PAGE_MAX) return apiError('INVALID_PAGE', 'Səhifə və ya say yanlışdır.', 400)
    if (!USER_FILTERS.includes(filter)) return apiError('INVALID_FILTER', 'Filtr yanlışdır.', 400)

    const result = await listUsers(payload, { query: params.get('q') ?? '', filter, page, limit, viewerId: Number(user.id), gameId: gameId || null })
    return NextResponse.json({ ...result, page })
  } catch (error) {
    // Reading the headers bails out of prerendering by throwing; that belongs to Next, not this log.
    unstable_rethrow(error)
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyunçuları yükləmək mümkün olmadı.', 500)
  }
}
