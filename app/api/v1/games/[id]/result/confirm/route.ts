import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { RESULT_ERRORS } from '@/lib/result-errors'
import { submitResult } from '@/lib/results'

/**
 * "Təsdiqlə" / "Etiraz et". A signed-in player on the other side from the host answers the
 * reported score; `{ action: 'confirm' | 'dispute' }`. Anyone else is refused (403 FORBIDDEN).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gameId = Number((await params).id)
    if (!Number.isSafeInteger(gameId) || gameId <= 0) return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)

    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401)

    const { action } = ((await request.json().catch(() => null)) ?? {}) as { action?: unknown }
    if (action !== 'confirm' && action !== 'dispute') return apiError('INVALID_ACTION', 'Əməliyyat yanlışdır.', 400)

    const userId = Number(user.id)
    const result = await submitResult(payload, gameId, { userId, isAdmin: (user as { role?: string }).role === 'admin' }, action)
    if (!result.ok) {
      const { status, message } = RESULT_ERRORS[result.code]
      return apiError(result.code, message, status)
    }
    return NextResponse.json({ game: await getGameDetail(gameId, userId) })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Cavabı yadda saxlamaq mümkün olmadı.', 500)
  }
}
