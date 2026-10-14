import { after, NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { invalidateGamesCache } from '@/lib/cache-tags'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { recordJoinAttempt, releaseSpot, tooManyRecentAttempts, type LeaveErrorCode } from '@/lib/join-game'

const LEAVE_ERRORS: Record<LeaveErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_STARTED: { status: 409, message: 'Oyun başlayıb, ondan çıxmaq mümkün deyil.' },
  HOST_CANNOT_LEAVE: { status: 409, message: 'Siz bu oyunun hostusunuz — çıxmaq üçün oyunu silin.' },
  NOT_JOINED: { status: 409, message: 'Siz bu oyuna qoşulmamısınız.' },
}

/**
 * "Oyundan çıx". Requires a signed-in user, and gives their spot back to the game. Allowed right up
 * to kick-off; the host leaves by deleting the game instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gameId = Number((await params).id)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const payload = await getPayloadClient()

  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    after(() => recordJoinAttempt(payload, { outcome: 'INVALID_REQUEST', gameId: null, userId: null, ip }))
    return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)
  }

  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    after(() => recordJoinAttempt(payload, { outcome: 'UNAUTHENTICATED', gameId, userId: null, ip }))
    return apiError('UNAUTHENTICATED', 'Oyundan çıxmaq üçün daxil olun.', 401)
  }
  const userId = Number(user.id)

  if (await tooManyRecentAttempts(payload, userId, ip)) {
    return apiError('RATE_LIMITED', 'Çox tez-tez cəhd edirsiniz. Bir dəqiqə sonra yenidən yoxlayın.', 429)
  }

  try {
    const result = await releaseSpot(payload, gameId, userId)

    if (!result.ok) {
      after(() => recordJoinAttempt(payload, { outcome: result.code, gameId, userId, ip }))
      const { status, message } = LEAVE_ERRORS[result.code]
      return apiError(result.code, message, status)
    }

    invalidateGamesCache()
    after(() =>
      recordJoinAttempt(payload, { outcome: 'LEFT', gameId, userId, remainingSpots: result.remainingSpots, ip }),
    )

    // The spot is already released, so a failure loading the detail must not turn this into an error.
    const game = await getGameDetail(gameId, userId).catch((error) => {
      console.error(error)
      return null
    })

    return NextResponse.json({
      id: String(gameId),
      status: result.remainingSpots > 0 ? 'open' : 'full',
      remainingSpots: result.remainingSpots,
      currentCount: result.maxCount - result.remainingSpots,
      maxCount: result.maxCount,
      game,
    })
  } catch (error) {
    console.error(error)
    after(() => recordJoinAttempt(payload, { outcome: 'ERROR', gameId, userId, ip }))
    return apiError('INTERNAL_ERROR', 'Hazırda oyundan çıxmaq mümkün olmadı.', 500)
  }
}
