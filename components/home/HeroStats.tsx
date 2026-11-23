import type { CSSProperties } from 'react'

import { Icon, type IconName } from '@/components/ui/Icon'
import { DEFAULT_CITY, heroStats } from '@/lib/game-backend'
import { getSiteStats } from '@/lib/game-queries'
import styles from './HeroStats.module.css'

const ICONS: Record<string, IconName> = { openGames: 'calendar', players: 'userPlus', venues: 'pin' }

/** Live numbers under the hero buttons. They count up from 0 in CSS; the real value is in the text. */
export async function HeroStats() {
  const stats = heroStats(await getSiteStats(DEFAULT_CITY))
  if (stats.length === 0) return null
  return (
    <ul className={styles.stats} aria-label="OyunaGəl rəqəmlərlə">
      {stats.map((stat) => (
        <li key={stat.key} className={styles.stat}>
          <Icon name={ICONS[stat.key]} size={18} className={styles.icon} />
          <span className={styles.value} style={{ '--to': stat.value } as CSSProperties} aria-hidden="true" />
          <span className="visually-hidden">{stat.value}</span> {stat.label}
        </li>
      ))}
    </ul>
  )
}

/** Same height as the real strip, so the carousel below doesn't move when the numbers arrive. */
export function HeroStatsSkeleton() {
  return <div className={`${styles.skeleton} skeleton skeleton-on-dark`} aria-hidden="true" />
}
