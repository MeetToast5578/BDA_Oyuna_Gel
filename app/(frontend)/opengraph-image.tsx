import { ImageResponse } from 'next/og'

export const alt = 'OyunaGəl — Bakıda açıq oyunlar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** The card shown when any page without its own (a game has one) is shared. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 24,
          padding: 72,
          background: '#3525cd',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 700 }}>OyunaGəl</div>
        <div style={{ display: 'flex', fontSize: 44, opacity: 0.9 }}>
          Bakıda futbol, basketbol və tennis üzrə açıq oyunlar
        </div>
      </div>
    ),
    size,
  )
}
