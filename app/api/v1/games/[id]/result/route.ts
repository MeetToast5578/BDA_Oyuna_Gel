import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { authorizeHost } from '@/lib/authorize-host'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { afterResponse, noticeFor, notify, participantIds } from '@/lib/notify'
import { RESULT_ERRORS } from '@/lib/result-errors'
import { submitResult } from '@/lib/results'
import { MAX_SCORE, parseResultBody } from '@/lib/team-logic'

/**
 * "Hesabı daxil et". Host (or an admin) reports the score once the game is over; a player on the
 * other side then confirms or disputes it (`POST /result/confirm`). Reporting again after a dispute
 * starts over; a confirmed score is final except for admins.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error

    const body = parseResultBody(await request.json().catch(() => null))
    if (!body.ok) return apiError('INVALID_RESULT', `Hesab 0 ilə ${MAX_SCORE} arasında tam ədədlər olmalıdır.`, 400)

    const payload = await getPayloadClient()
    const result = await submitResult(payload, auth.gameId, auth, 'report', body)
    if (!result.ok) {
      const { status, message } = RESULT_ERRORS[result.code]
      return apiError(result.code, message, status)
    }
    const game = await getGameDetail(auth.gameId, auth.userId)
    // The other side is who can confirm it, so they are the ones told.
    if (game) {
      const rivals = game.hostSide === 'home' ? 'away' : 'home'
      afterResponse(async () => notify(payload, await participantIds(payload, auth.gameId, auth.userId, rivals), noticeFor('resultReported', game)))
    }
    return NextResponse.json({ game })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Hesabı yadda saxlamaq mümkün olmadı.', 500)
  }
}
