import { NextResponse } from 'next/server'

import { apiError } from '@/lib/api-response'
import { getPayloadClient } from '@/lib/game-queries'
import { getPublicProfile } from '@/lib/profile-queries'
import { clientIp, isRateLimited, rateLimitedResponse } from '@/lib/rate-limit'

/**
 * Another player's public profile, for linking a host's name somewhere. Open to anyone: it carries
 * only what a game card already shows about its host, plus the games they are running. Their email
 * and phone are never included — the host's number stays gated behind joining the game.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = Number((await params).id)
  if (!Number.isSafeInteger(userId) || userId <= 0) return apiError('INVALID_USER_ID', 'İstifadəçi ID-si yanlışdır.', 400)

  try {
    // Ids are sequential, so without a limit one loop would copy every player's name and picture.
    if (await isRateLimited(await getPayloadClient(), 'userLookup', { ip: clientIp(request) })) return rateLimitedResponse()
    const profile = await getPublicProfile(userId)
    return profile ? NextResponse.json(profile) : apiError('USER_NOT_FOUND', 'İstifadəçi tapılmadı.', 404)
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Profili yükləmək mümkün olmadı.', 500)
  }
}
