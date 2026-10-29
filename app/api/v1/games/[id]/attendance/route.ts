import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { markAttendance } from '@/lib/attendance'
import { authorizeHost } from '@/lib/authorize-host'
import { getGamePlayers, getPayloadClient } from '@/lib/game-queries'
import { afterResponse, notify } from '@/lib/notify'

const ATTENDANCE_ERRORS = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  ATTENDANCE_CLOSED: { status: 409, message: 'Gələnləri oyun başlayandan sonra bir həftə ərzində qeyd etmək olar.' },
  NOT_A_PLAYER: { status: 409, message: 'Bu oyunçu oyunda deyil.' },
} as const

/**
 * "Gəldi" / "Gəlmədi". Host or admin, from kick-off until a week later: `{ userId, attendance }` with
 * `came`, `absent` or null to clear it. A player marked absent is told, so a mistake can be raised.
 * Answers with the players list, like `PATCH /sides`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error

    const body = ((await request.json().catch(() => null)) ?? {}) as { userId?: unknown; attendance?: unknown }
    const userId = Number(body.userId)
    const attendance = body.attendance
    if (!Number.isSafeInteger(userId) || userId <= 0 || (attendance !== 'came' && attendance !== 'absent' && attendance !== null)) {
      return apiError('INVALID_ATTENDANCE', 'Sorğu yanlışdır: userId və attendance (came, absent və ya null) lazımdır.', 400)
    }

    const payload = await getPayloadClient()
    const result = await markAttendance(payload, auth.gameId, userId, attendance)
    if (!result.ok) {
      const { status, message } = ATTENDANCE_ERRORS[result.code]
      return apiError(result.code, message, status)
    }

    const players = await getGamePlayers(auth.gameId, auth.userId)
    if (!players) return apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
    if (attendance === 'absent') {
      afterResponse(() => notify(payload, [userId], { kind: 'markedAbsent', gameId: auth.gameId, gameTitle: players.game.title }))
    }
    return NextResponse.json(players)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Gələnləri qeyd etmək mümkün olmadı.', 500)
  }
}
