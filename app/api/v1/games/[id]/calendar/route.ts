import { apiError } from '@/lib/api-response'
import { toIcs } from '@/lib/calendar'
import { getGameDetail } from '@/lib/game-queries'
import { SITE_URL } from '@/lib/site-url'

/** "Təqvimə əlavə et": the game as an .ics file with a reminder. Public, like the game page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gameId = Number((await params).id)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return apiError('INVALID_GAME_ID', 'Oyun ID-si yanlışdır.', 400)

  try {
    const game = await getGameDetail(gameId, null)
    const ics = game && toIcs(game, `${SITE_URL}/games/${game.id}`)
    if (!ics) return apiError('GAME_NOT_FOUND', 'Oyun tapılmadı.', 404)
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="oyun-${game.id}.ics"`,
      },
    })
  } catch (error) {
    console.error(error)
    return apiError('INTERNAL_ERROR', 'Təqvim faylını hazırlamaq mümkün olmadı.', 500)
  }
}
