import Link from 'next/link'
import type { ReactNode } from 'react'

import { SportIcon } from '@/components/games/bits'
import { buttonClass } from '@/components/ui/button'
import styles from './Hero.module.css'

/**
 * Everything here is static, so it prerenders into the shell and paints immediately. The carousel
 * is passed in as a slot because it needs the featured games, which are ranked at request time.
 */
export function Hero({ carousel, stats, gamesAnchor }: { carousel?: ReactNode; stats?: ReactNode; gamesAnchor: string }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.balls} aria-hidden="true">
        {['football', 'basketball', 'tennis'].map((sport) => (
          <span key={sport} data-sport={sport} className={styles.ball}>
            <SportIcon sport={sport} size={44} />
          </span>
        ))}
      </div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Bakı · Açıq oyunlar
        </p>
        <h1 id="hero-title" className={styles.title}>
          Sevdiyin idmanı seç, meydança <em className={styles.highlight}>tap</em>, oyuna qoşul
        </h1>
        <p className={styles.lead}>
          Bakı daxilində yüzlərlə aktiv oyun və meydança. Komanda yoldaşlarını tap və professional atmosferdə idman et.
        </p>
        <div className={styles.actions}>
          <a href={`#${gamesAnchor}`} className={buttonClass('accent', 'lg')}>
            Açıq oyunlara bax
          </a>
          <Link href="/games/new" className={buttonClass('outlineLight', 'lg')}>
            Oyun yarat
          </Link>
        </div>
        {stats}
      </div>

      {carousel}
    </section>
  )
}
