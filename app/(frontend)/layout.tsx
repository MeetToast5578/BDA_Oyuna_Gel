import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import React, { Suspense } from 'react'

import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { NavigationProgress } from '@/components/site/NavigationProgress'
import { SITE_URL } from '@/lib/site-url'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  // Shared previews need absolute image URLs; on a Vercel preview this is the preview's own address.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'OyunaGəl — Bakıda açıq oyunlar',
    template: '%s · OyunaGəl',
  },
  description:
    'Sevdiyin idmanı seç, meydança tap, oyuna qoşul. Bakı daxilində futbol, tennis və basketbol üzrə açıq oyunlar.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az" data-scroll-behavior="smooth" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        {/* It reads the URL, which a prerender doesn't have; the bar simply starts after hydration. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <a href="#main" className="skip-link">
          Məzmuna keç
        </a>
        <Header />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
