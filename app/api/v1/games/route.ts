import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { parseCreateGameBody, parseGameListParams } from '@/lib/game-backend'
import { createGame, findGames, getPayloadClient } from '@/lib/game-queries'
import { rememberPhone } from '@/lib/profile-queries'

export async function GET(request: Request) {
  const now = new Date()
  const parsed = parseGameListParams(new URL(request.url).searchParams, now)
  if (!parsed.ok) return apiError(parsed.code, parsed.message, 400)

  try {
    return NextResponse.json(await findGames(parsed.query, now))
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Unable to load games.', 500)
  }
}

/**
 * "Yeni Oyun Yarat": the signed-in user becomes the host. The number given is kept on the profile
 * when it has none, or when `saveToProfile` asks to replace it, so the next form starts with it.
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return apiError('UNAUTHENTICATED', 'Oyun yaratmaq üçün daxil olun.', 401)

    const body: unknown = await request.json().catch(() => null)
    const parsed = parseCreateGameBody(body)
    if (!parsed.ok) return apiError(parsed.code, parsed.message, 400)

    const userId = Number(user.id)
    const result = await createGame({ id: userId, phoneNumber: user.phoneNumber }, parsed.input)
    if (!result.ok) return apiError(result.code, result.message, result.code === 'NOT_A_MEMBER' ? 409 : 400)

    const phone = parsed.input.contactPhone
    const overwrite = (body as { saveToProfile?: unknown } | null)?.saveToProfile === true
    const savedToProfile = phone ? await rememberPhone(userId, phone, { overwrite }) : false

    return NextResponse.json({ game: result.game, savedToProfile }, { status: 201 })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Oyun yaratmaq mümkün olmadı.', 500)
  }
}
