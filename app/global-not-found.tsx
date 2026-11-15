import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'

import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import NotFound from './(frontend)/not-found'
import './(frontend)/globals.css'

// A URL no route matches skips every layout (the site and /admin have separate root layouts), so this
// page brings the site's fonts, styles, header and footer itself. Same text as the in-site 404.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], variable: '--font-space-grotesk', display: 'swap' })
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Səhifə tapılmadı · OyunaGəl',
}

export default function GlobalNotFound() {
  return (
    <html lang="az" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <Header />
        <main id="main" tabIndex={-1}>
          <NotFound />
        </main>
        <Footer />
      </body>
    </html>
  )
}
