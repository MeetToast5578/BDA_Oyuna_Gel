import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { authorizeHost } from '@/lib/authorize-host'
import { invalidateGamesCache } from '@/lib/cache-tags'
import { removedFromGameEmail } from '@/lib/emails'
import { getGameDetail, getGamePlayers, getPayloadClient } from '@/lib/game-queries'
import { releaseSpot, type LeaveErrorCode } from '@/lib/join-game'
import { afterResponse, noticeFor, notify } from '@/lib/notify'
import { notifyPromoted } from '@/lib/promotions'

const REMOVE_ERRORS: Record<LeaveErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_STARTED: { status: 409, message: 'Oyun başlayıb — oyunçunu çıxarmaq mümkün deyil.' },
  HOST_CANNOT_LEAVE: { status: 409, message: 'Hostu oyundan çıxarmaq olmaz — oyunu silin.' },
  NOT_JOINED: { status: 409, message: 'Bu oyunçu oyunda deyil.' },
}

/**
 * "Çıxar". The host (or an admin) takes a player out of a game that hasn't started, which gives the
 * spot back exactly as the player's own "Oyundan çıx" does (`releaseSpot`). Answers with the players
 * list, the same shape as `GET /participants`, so the dialog can redraw it.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params
    const auth = await authorizeHost(request, id)
    if ('error' in auth) return auth.error

    const playerId = Number(userId)
    if (!Number.isSafeInteger(playerId) || playerId <= 0) return apiError('INVALID_USER_ID', 'Oyunçu ID-si yanlışdır.', 400)

    const payload = await getPayloadClient()
    const result = await releaseSpot(payload, auth.gameId, playerId)
    if (!result.ok) {
      const { status, message } = REMOVE_ERRORS[result.code]
      return apiError(result.code, message, status)
    }

    invalidateGamesCache()
    const [players, game] = await Promise.all([getGamePlayers(auth.gameId, auth.userId), getGameDetail(auth.gameId, auth.userId)])
    if (game) afterResponse(() => notify(payload, [playerId], noticeFor('removed', game), removedFromGameEmail(game)))
    // Their spot went to the first person waiting, if there was one.
    if (result.promoted.length > 0) afterResponse(() => notifyPromoted(payload, [{ gameId: auth.gameId, userIds: result.promoted }]))
    return players ? NextResponse.json(players) : apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyunçunu çıxarmaq mümkün olmadı.', 500)
  }
}
