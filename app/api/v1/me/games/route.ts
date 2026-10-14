import { unstable_rethrow } from 'next/navigation'
import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { parseMyGamesParams } from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { findMyGames } from '@/lib/profile-queries'

/**
 * "Mənim oyunlarım": `?role=hosting|joined&when=upcoming|past`. Returns the same game-card shape as
 * `GET /api/v1/games`, so the profile page renders it with the components it already has.
 */
export async function GET(request: Request) {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401)

    const parsed = parseMyGamesParams(new URL(request.url).searchParams)
    if (!parsed.ok) return apiError(parsed.code, parsed.message, 400)

    return NextResponse.json(await findMyGames(Number(user.id), parsed.value))
  } catch (error) {
    // Reading the headers bails out of prerendering by throwing; that belongs to Next, not this log.
    unstable_rethrow(error)
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyunları yükləmək mümkün olmadı.', 500)
  }
}
