import { cacheLife } from 'next/cache'
import Link from 'next/link'

import styles from './Footer.module.css'
import { AnalyticsSettings } from './Analytics'

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
              OyunaGəl
            </Link>
            <p className={styles.tagline}>Birlikdə oynayaq.</p>
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
