import { after, NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { toIcs } from '@/lib/calendar'
import { joinedEmail } from '@/lib/emails'
import { invalidateGamesCache } from '@/lib/cache-tags'
import { normalizePhone } from '@/lib/game-backend'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { claimSpot, recordJoinAttempt, type JoinErrorCode } from '@/lib/join-game'
import { afterResponse, notify } from '@/lib/notify'
import { rememberPhone } from '@/lib/profile-queries'
import { SITE_URL } from '@/lib/site-url'

const JOIN_ERRORS: Record<JoinErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_NOT_JOINABLE: { status: 409, message: 'Bu oyuna artıq qoşulmaq mümkün deyil.' },
  GAME_FULL: { status: 409, message: 'Oyunda boş yer qalmayıb.' },
  ALREADY_JOINED: { status: 409, message: 'Siz artıq bu oyuna qoşulmusunuz.' },
}

/**
 * "Oyuna qoşul". Requires a signed-in user. The JSON body `{ name, phone }` is what step 1 of the join
 * modal collected; both are required and re-validated here, since the client's checks are only a
 * convenience. The response carries the game with the host's phone for the "Bir addım qaldı" step.
 * The number given is kept on the profile when it has none (or when `saveToProfile` asks), so the
 * next join or create form starts with it; `savedToProfile` says whether it was.
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
    return apiError('UNAUTHENTICATED', 'Oyuna qoşulmaq üçün daxil olun.', 401)
  }
  const userId = Number(user.id)

  const body = (await request.json().catch(() => null)) as { name?: unknown; phone?: unknown; saveToProfile?: unknown } | null

  // Falls back to the profile so a name or number left out still identifies the player to the host.
  const name = (typeof body?.name === 'string' ? body.name : '').trim() || (user.fullName ?? '').trim()
  if (!name) {
    after(() => recordJoinAttempt(payload, { outcome: 'INVALID_REQUEST', gameId, userId, ip }))
    return apiError('INVALID_NAME', 'Ad və soyad tələb olunur.', 400)
  }

  const phone = normalizePhone(body?.phone) ?? (body?.phone ? null : normalizePhone(user.phoneNumber))
  if (!phone) {
    after(() => recordJoinAttempt(payload, { outcome: 'INVALID_REQUEST', gameId, userId, ip }))
    return apiError('INVALID_PHONE', 'Telefon nömrəsi yanlışdır, məsələn +994 50 210 34 56.', 400)
  }

  try {
    const result = await claimSpot(payload, gameId, userId, phone, name)

    if (!result.ok) {
      after(() => recordJoinAttempt(payload, { outcome: result.code, gameId, userId, ip }))
      const { status, message } = JOIN_ERRORS[result.code]
      return apiError(result.code, message, status)
    }

    invalidateGamesCache()
    after(() =>
      recordJoinAttempt(payload, { outcome: 'JOINED', gameId, userId, remainingSpots: result.remainingSpots, ip }),
    )

    // The spot is already claimed, so a failure loading the detail must not turn this into an error.
    const game = await getGameDetail(gameId, userId).catch((error) => {
      console.error(error)
      return null
    })
    if (game) afterResponse(() => notify(payload, [userId], joinedEmail(game, toIcs(game, `${SITE_URL}/games/${game.id}`))))
    // A number typed in step 1 (not the profile's own fallback) is kept for the next form.
    const typedPhone = normalizePhone(body?.phone)
    const savedToProfile = typedPhone
      ? await rememberPhone(userId, typedPhone, { overwrite: body?.saveToProfile === true })
      : false

    return NextResponse.json({
      id: String(gameId),
      status: result.remainingSpots > 0 ? 'open' : 'full',
      remainingSpots: result.remainingSpots,
      currentCount: result.maxCount - result.remainingSpots,
      maxCount: result.maxCount,
      game,
      savedToProfile,
    })
  } catch (error) {
    console.error(error)
    after(() => recordJoinAttempt(payload, { outcome: 'ERROR', gameId, userId, ip }))
    return apiError('INTERNAL_ERROR', 'Hazırda oyuna qoşulmaq mümkün olmadı.', 500)
  }
}
