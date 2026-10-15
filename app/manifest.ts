import type { MetadataRoute } from 'next'

/** Lets phones install the site to the home screen. Colours are the tokens in globals.css. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OyunaGəl — Bakıda açıq oyunlar',
    short_name: 'OyunaGəl',
    description: 'Sevdiyin idmanı seç, meydança tap, oyuna qoşul.',
    lang: 'az',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#3525cd',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
