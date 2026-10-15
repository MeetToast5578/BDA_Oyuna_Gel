import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { gameCancelledEmail, gameChangedEmail } from '@/lib/emails'
import { isUpcoming, parseEditGameBody } from '@/lib/game-backend'
import { deleteGame, getGameDetail, getGameHostId, getPayloadClient, updateGame } from '@/lib/game-queries'
import { afterResponse, notify, participantIds } from '@/lib/notify'

/** "Oyun Detalı". Signing in is optional; it only affects `viewer` and whether the host's phone is shown. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gameId = Number((await params).id)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    const game = await getGameDetail(gameId, user ? Number(user.id) : null)
    return game ? NextResponse.json(game) : apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyunu yükləmək mümkün olmadı.', 500)
  }
}

/**
 * Resolves the game and checks the caller may change it. Only the host and admins can, and the
 * answer is the same 404 either way so a signed-in stranger can't probe which games exist.
 */
async function authorizeHost(request: Request, rawId: string) {
  const gameId = Number(rawId)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    return { error: apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400) } as const
  }

  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return { error: apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401) } as const

  const hostId = await getGameHostId(gameId)
  if (hostId === null) return { error: apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404) } as const

  const isAdmin = (user as { role?: string }).role === 'admin'
  const isOwner = hostId === Number(user.id) || isAdmin
  if (!isOwner) return { error: apiError('NOT_GAME_HOST', 'Yalnız oyunun hostu bu oyunu dəyişə bilər.', 403) } as const

  return { gameId, userId: Number(user.id), isAdmin } as const
}

/**
 * A game that has started is part of its players' history — their past games and stats — so it is
 * no longer the host's to change. Without this a host could move last week's game into the future
 * and revive it, players and all.
 */
const gameStarted = () =>
  apiError('GAME_STARTED', 'Oyun artıq başlayıb — onu dəyişmək və ya silmək mümkün deyil.', 409)

/** "Oyunu redaktə et". Host only; the players already in are untouched. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error

    const existing = await getGameDetail(auth.gameId, auth.userId)
    if (!existing) return apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
    // Admins included: the admin panel is where a past game is corrected.
    if (!isUpcoming(existing.status)) return gameStarted()

    const parsed = parseEditGameBody(await request.json().catch(() => null), existing.currentCount)
    if (!parsed.ok) return apiError(parsed.code, parsed.message, 400)

    const result = await updateGame(auth.gameId, parsed.input)
    if (!result.ok && result.code === 'GAME_STARTED') return gameStarted()
    if (!result.ok) return apiError(result.code, result.message, result.code === 'GAME_NOT_FOUND' ? 404 : result.code === 'SIDE_FULL' ? 409 : 400)

    // A new time or place is news to everyone who planned around the old one.
    const { game } = result
    if (game.startsAt !== existing.startsAt || game.venue.id !== existing.venue.id) {
      afterResponse(async () => {
        const payload = await getPayloadClient()
        await notify(payload, await participantIds(payload, auth.gameId, auth.userId), gameChangedEmail(game))
      })
    }

    return NextResponse.json({ game: result.game })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyunu yeniləmək mümkün olmadı.', 500)
  }
}

/** "Oyunu sil". Host only, until the game starts (admins any time); removes it and everyone's place in it. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeHost(request, (await params).id)
    if ('error' in auth) return auth.error

    const game = await getGameDetail(auth.gameId, auth.userId)
    if (!game) return apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
    if (!auth.isAdmin && !isUpcoming(game.status)) return gameStarted()

    // Read before the delete takes the participant rows with it. Only a game still to come is news.
    const payload = await getPayloadClient()
    const players = isUpcoming(game.status) ? await participantIds(payload, auth.gameId, auth.userId) : []
    await deleteGame(auth.gameId)
    if (players.length > 0) afterResponse(() => notify(payload, players, gameCancelledEmail(game)))
    return NextResponse.json({ ok: true, id: String(auth.gameId) })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyunu silmək mümkün olmadı.', 500)
  }
}
