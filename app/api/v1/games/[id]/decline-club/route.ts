import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { invalidateGamesCache } from '@/lib/cache-tags'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { declineOpponentClub, type DeclineErrorCode } from '@/lib/teams'

const DECLINE_ERRORS: Record<DeclineErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_STARTED: { status: 409, message: 'Oyun başlayıb — komandanı dəyişmək mümkün deyil.' },
  NO_OPPONENT_CLUB: { status: 409, message: 'Bu oyunda rəqib komanda yoxdur.' },
  NOT_CAPTAIN: { status: 403, message: 'Yalnız komandanın kapitanı oyundan çəkilə bilər.' },
}

/**
 * "Oyundan çəkil". The captain of the club the host put against their own side (or an admin) takes
 * it out of the game, before kick-off: that side becomes open to anyone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gameId = Number((await params).id)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401)

    const result = await declineOpponentClub(payload, gameId, Number(user.id), (user as { role?: string }).role === 'admin')
    if (!result.ok) {
      const { status, message } = DECLINE_ERRORS[result.code]
      return apiError(result.code, message, status)
    }

    invalidateGamesCache()
    const game = await getGameDetail(gameId, Number(user.id))
    return game ? NextResponse.json({ game }) : apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyundan çəkilmək mümkün olmadı.', 500)
  }
}
