import { apiError } from '@/lib/api-response'
import { getGameHostId, getPayloadClient } from '@/lib/game-queries'

/**
 * Resolves the game and checks the caller may change it. Only the host and admins can: a missing
 * game is 404 and a signed-in stranger gets 403 (game pages are public, so nothing is hidden).
 */
export async function authorizeHost(request: Request, rawId: string) {
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
