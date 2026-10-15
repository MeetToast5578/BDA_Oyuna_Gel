import { ImageResponse } from 'next/og'

import { getGameDetail } from '@/lib/game-queries'

export const alt = 'OyunaGəl oyunu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The card WhatsApp and other apps show for a shared game link: what, when, where and how many
 * spots are left, so the message alone is enough to decide. Colours are the site's tokens.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const gameId = Number((await params).id)
  const game = Number.isSafeInteger(gameId) && gameId > 0 ? await getGameDetail(gameId, null) : null

  const spots = !game
    ? null
    : game.status === 'open'
      ? `${game.remainingSpots} yer qalıb · ${game.currentCount}/${game.maxCount} oyunçu`
      : game.status === 'full'
        ? 'Oyun doludur'
        : game.status === 'cancelled'
          ? 'Ləğv edilib'
          : 'Keçmiş oyun'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#3525cd',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, opacity: 0.85 }}>
          {game ? `OyunaGəl · ${game.sportLabel} · ${game.levelLabel}` : 'OyunaGəl'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 76, lineHeight: 1.1, fontWeight: 700 }}>
            {game?.title ?? 'Bakıda açıq oyunlar'}
          </div>
          {game && (
            <div style={{ display: 'flex', fontSize: 40, opacity: 0.9 }}>
              {[game.dateLabel, game.timeLabel, game.venue.name].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {spots && (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              padding: '14px 28px',
              borderRadius: 999,
              background: '#ffffff',
              color: '#3525cd',
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            {spots}
          </div>
        )}
      </div>
    ),
    size,
  )
}
