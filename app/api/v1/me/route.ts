import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { gameCancelledEmail } from '@/lib/emails'
import { parseProfileUpdate } from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { afterResponse, notify, participantIds } from '@/lib/notify'
import { deleteMyAccount, findMyGames, getMyProfile, updateMyProfile } from '@/lib/profile-queries'

/** The signed-in user, or a 401. Never leaks `role`, `googleId` or the lockout fields. */
async function requireUser(request: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return { error: apiError('UNAUTHENTICATED', 'Bu əməliyyat üçün daxil olun.', 401) } as const
  return { userId: Number(user.id) } as const
}

/** "Profilim". Identity, game counts and played-by-sport stats in one request. */
export async function GET(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const profile = await getMyProfile(auth.userId)
    return profile ? NextResponse.json(profile) : apiError('USER_NOT_FOUND', 'İstifadəçi tapılmadı.', 404)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Profili yükləmək mümkün olmadı.', 500)
  }
}

/** "Profilimi redaktə et": name, phone and profile picture. Email is the Google identity and fixed. */
export async function PATCH(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    const parsed = parseProfileUpdate(await request.json().catch(() => null))
    if (!parsed.ok) return apiError(parsed.code, parsed.message, 400)

    const result = await updateMyProfile(auth.userId, parsed.value)
    if (!result.ok) return apiError(result.code, result.message, result.code === 'PHONE_TAKEN' ? 409 : 400)

    return NextResponse.json({ profile: result.profile })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Profili yeniləmək mümkün olmadı.', 500)
  }
}

/**
 * "Hesabımı sil". Also deletes the games this user hosts, because `games.host_id` is
 * ON DELETE SET NULL and a hostless game is a required-field violation nobody can clean up.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireUser(request)
    if ('error' in auth) return auth.error

    // The upcoming games this account hosts are deleted with it; their players are told, so they are
    // read first. shortcut: the first 100 hosted games only; page this if a host ever has more.
    const payload = await getPayloadClient()
    const { games: cancelled } = await findMyGames(auth.userId, { role: 'hosting', when: 'upcoming', page: 1, limit: 100 })
    const players = await Promise.all(cancelled.map((game) => participantIds(payload, Number(game.id), auth.userId)))

    const { deletedGames } = await deleteMyAccount(auth.userId)
    afterResponse(() => Promise.all(cancelled.map((game, i) => notify(payload, players[i], gameCancelledEmail(game)))))

    // The session cookies outlive the account, so they are cleared here rather than by the client.
    const response = NextResponse.json({ ok: true, deletedGames })
    for (const name of ['google_session', 'payload-token']) {
      response.cookies.set(name, '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    }
    return response
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Hesabı silmək mümkün olmadı.', 500)
  }
}
