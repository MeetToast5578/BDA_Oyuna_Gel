import { cacheLife } from 'next/cache'
import Link from 'next/link'

import { Icon } from '@/components/ui/Icon'
import styles from './Footer.module.css'
import { AnalyticsSettings } from './Analytics'

/** OyunaGəl's own channels; also listed on the contact page. */
export const SOCIAL_LINKS = [
  { href: 'https://www.instagram.com/oyunagel.az/', label: 'Instagram', icon: 'instagram' },
  { href: 'https://whatsapp.com/channel/0029Vb9MolH96H4JPXNHTu2p', label: 'WhatsApp kanalı', icon: 'chat' },
] as const

const LINKS = [
  { href: '/about', label: 'Haqqımızda' },
  { href: '/rules', label: 'Qaydalar' },
  { href: '/privacy', label: 'Məxfilik' },
  { href: '/contact', label: 'Əlaqə' },
]

// The copyright year is the only moving part; caching it daily keeps the footer in the static shell
// instead of forcing every page that renders it to wait for request time.
export async function Footer() {
  'use cache'
  cacheLife('days')

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Link href="/" className={styles.logo}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing */}
              <img src="/icons/oyunagel.svg" alt="" width={36} height={36} className={styles.mark} />
              OyunaGəl
            </Link>
            <p className={styles.tagline}>Birlikdə oynayaq.</p>
            <ul className={styles.social}>
              {SOCIAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                    <Icon name={link.icon} size={18} />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <nav aria-label="Footer">
            <ul className={styles.links}>
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className={styles.bottom}>
          <p className={styles.copyright}>© {new Date().getFullYear()} OyunaGəl. Bütün hüquqlar qorunur.</p>
          <AnalyticsSettings />
        </div>
      </div>
    </footer>
  )
}
