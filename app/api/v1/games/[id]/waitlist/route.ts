import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { normalizePhone } from '@/lib/game-backend'
import { getGameDetail, getPayloadClient } from '@/lib/game-queries'
import { isRateLimited, rateLimitedResponse } from '@/lib/rate-limit'
import { joinWaitlist, leaveWaitlist, type WaitlistErrorCode } from '@/lib/waitlist'

const WAITLIST_ERRORS: Record<WaitlistErrorCode, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: 'Oyun tapılmadı.' },
  GAME_NOT_JOINABLE: { status: 409, message: 'Bu oyun üçün artıq gözləmək mümkün deyil.' },
  GAME_NOT_FULL: { status: 409, message: 'Oyunda boş yer var — birbaşa qoşula bilərsiniz.' },
  ALREADY_JOINED: { status: 409, message: 'Siz artıq bu oyuna qoşulmusunuz.' },
  ALREADY_WAITING: { status: 409, message: 'Siz artıq gözləmə siyahısındasınız.' },
  HOST_CANNOT_WAIT: { status: 409, message: 'Siz bu oyunun hostusunuz.' },
  WAITLIST_FULL: { status: 409, message: 'Gözləmə siyahısı doludur.' },
}

async function signedIn(request: Request, rawId: string) {
  const gameId = Number(rawId)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return { error: apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400) } as const
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return { error: apiError('UNAUTHENTICATED', 'Gözləmə siyahısına yazılmaq üçün daxil olun.', 401) } as const
  return { payload, gameId, user } as const
}

/**
 * "Gözləmə siyahısına yaz". Signed-in, for a full game that hasn't started. The body is the join
 * form's `{ name, phone }` (a missing one falls back to the profile), kept so the host sees who
 * they are if a spot reaches them. When a spot comes back the first person waiting who can stand on
 * a side with room takes it, with no further step.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await signedIn(request, (await params).id)
    if ('error' in auth) return auth.error
    const { payload, gameId, user } = auth
    const userId = Number(user.id)

    // Counted with joins and leaves: signing up and withdrawing in a loop is the same kind of hammering.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    if (await isRateLimited(payload, 'spot', { userId, ip })) return rateLimitedResponse()

    const body = (await request.json().catch(() => null)) as { name?: unknown; phone?: unknown } | null
    const name = (typeof body?.name === 'string' ? body.name : '').trim() || (user.fullName ?? '').trim()
    if (!name) return apiError('INVALID_NAME', 'Ad və soyad tələb olunur.', 400)
    const phone = normalizePhone(body?.phone) ?? (body?.phone ? null : normalizePhone(user.phoneNumber))
    if (!phone) return apiError('INVALID_PHONE', 'Telefon nömrəsi yanlışdır, məsələn +994 50 210 34 56.', 400)

    const result = await joinWaitlist(payload, gameId, userId, phone, name)
    if (!result.ok) {
      const { status, message } = WAITLIST_ERRORS[result.code]
      return apiError(result.code, message, status)
    }
    const game = await getGameDetail(gameId, userId)
    return NextResponse.json({ position: result.position, waitlist: game?.waitlist ?? null })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Gözləmə siyahısına yazılmaq mümkün olmadı.', 500)
  }
}

/** "Siyahıdan çıx". */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await signedIn(request, (await params).id)
    if ('error' in auth) return auth.error
    if (!(await leaveWaitlist(auth.payload, auth.gameId, Number(auth.user.id)))) {
      return apiError('NOT_WAITING', 'Siz bu oyunun gözləmə siyahısında deyilsiniz.', 409)
    }
    const game = await getGameDetail(auth.gameId, Number(auth.user.id))
    return NextResponse.json({ waitlist: game?.waitlist ?? null })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Siyahıdan çıxmaq mümkün olmadı.', 500)
  }
}
