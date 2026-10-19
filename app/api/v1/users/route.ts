import { unstable_rethrow } from 'next/navigation'
import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import { searchUsers } from '@/lib/invites'

/**
 * The host's player search: `?q=` (at least 2 characters) and, to leave out the people already in or
 * invited to a game, `&gameId=`. Signed-in only, at most 8 results, and only what a public profile
 * already shows (id, name, initials, picture): never an email or a phone number.
 */
export async function GET(request: Request) {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Oyunçu axtarmaq üçün daxil olun.', 401)

    const params = new URL(request.url).searchParams
    const rawGame = params.get('gameId')
    const gameId = rawGame === null ? null : Number(rawGame)
    if (gameId !== null && (!Number.isSafeInteger(gameId) || gameId <= 0)) return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)

    const users = await searchUsers(payload, params.get('q') ?? '', Number(user.id), gameId)
    return NextResponse.json({ users })
  } catch (error) {
    // Reading the headers bails out of prerendering by throwing; that belongs to Next, not this log.
    unstable_rethrow(error)
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Axtarış alınmadı.', 500)
  }
}
