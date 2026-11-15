import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { authorizeHost } from '@/lib/authorize-host'
import { getGamePlayers, getPayloadClient } from '@/lib/game-queries'
import { reassignSides, type SidesErrorCode } from '@/lib/sides'
import { parseSidesBody } from '@/lib/team-logic'

const SIDES_ERRORS: Record<SidesErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_STARTED: { status: 409, message: 'Oyun başlayıb — komandaları dəyişmək mümkün deyil.' },
  NOT_IN_GAME: { status: 409, message: 'Bu oyunçu oyunda deyil.' },
  NOT_A_MEMBER: { status: 409, message: 'Bu oyunçu həmin komandada oynaya bilməz.' },
  SIDE_FULL: { status: 409, message: 'Komandada yer yoxdur.' },
}

/**
 * "Komandaları dəyiş". Host or admin, before kick-off. The body is `{ assignments: [{ userId, side }] }`
 * to move players, or `{ balance: true }` for "Balansla". Answers with the players list, the same
 * shape as `GET /participants`, so the page can redraw it.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error

    const body = parseSidesBody(await request.json().catch(() => null))
    if (!body.ok) return apiError('INVALID_SIDES', 'Komanda dəyişikliyi sorğusu yanlışdır.', 400)

    const payload = await getPayloadClient()
    const result = await reassignSides(payload, auth.gameId, body)
    if (!result.ok) {
      const { status, message } = SIDES_ERRORS[result.code]
      return apiError(result.code, message, status)
    }

    const players = await getGamePlayers(auth.gameId, auth.userId)
    return players ? NextResponse.json(players) : apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Komandaları dəyişmək mümkün olmadı.', 500)
  }
}
