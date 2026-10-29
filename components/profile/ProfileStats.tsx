import type { CSSProperties } from 'react'

import type { MyProfile } from '@/lib/api-types'
import { ProgressBar } from '@/components/games/bits'
import detail from '@/components/games/GameDetail.module.css'
import { SPORT_EMOJI, sortSports } from '@/components/games/sports'
import styles from './Profile.module.css'
import { ActivityChart } from './StatCharts'

/** Big numbers with a label underneath. A <dl>: each label names its number for screen readers. */
export function StatTiles({ tiles }: { tiles: Array<{ value: number; label: string }> }) {
  return (
    <dl className={styles.tiles} style={{ '--tiles': tiles.length } as CSSProperties}>
      {tiles.map((tile) => (
        <div key={tile.label} className={styles.tile}>
          {/* Label first for screen readers; the tile shows it under the number. */}
          <dt className={styles.tileLabel}>{tile.label}</dt>
          <dd className={styles.tileValue}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** "Etibarlılıq": how many of the games their hosts marked the person came to. Only shown from 3 marked games. */
export function ReliabilityMeter({ reliability }: { reliability: { marked: number; came: number } | null }) {
  if (!reliability) return null
  return (
    <div className={styles.reliability}>
      <p className={styles.reliabilityText}>
        <span className={styles.reliabilityLabel}>Etibarlılıq</span>
        <span>
          {reliability.came}/{reliability.marked} oyuna gəlib
        </span>
      </p>
      <ProgressBar
        value={reliability.came}
        max={reliability.marked}
        label={`Etibarlılıq: ${reliability.marked} oyundan ${reliability.came}`}
        className={styles.sportBar}
      />
    </div>
  )
}

/** "Statistika" on "Profilim": three totals, reliability, games played per sport, then the last six months. */
export function ProfileStats({ profile }: { profile: MyProfile }) {
  const { counts, stats } = profile

  return (
    <section className={detail.panel} aria-labelledby="stats-title">
      <h2 id="stats-title" className={detail.panelLabel}>
        Statistika
      </h2>
      <StatTiles
        tiles={[
          { value: stats.totalPlayed, label: 'oynanılan oyun' },
          { value: counts.hostedPast + counts.hostingUpcoming, label: 'təşkil edilən oyun' },
          { value: counts.joinedUpcoming + counts.hostingUpcoming, label: 'qarşıdakı oyun' },
        ]}
      />
      <ReliabilityMeter reliability={profile.reliability} />
      <hr className={styles.divider} />
      {stats.totalPlayed === 0 ? (
        <p className={styles.statsEmpty}>Hələ heç bir oyunda iştirak etməmisiniz.</p>
      ) : (
        <ul className={styles.sports} aria-label="İdman növləri üzrə oynanılan oyunlar">
          {sortSports(stats.playedBySport).map((sport) => (
            <li key={sport.sport} className={styles.sport}>
              <span className={styles.sportLabel}>
                <span aria-hidden="true">{SPORT_EMOJI[sport.iconKey] ?? '🏅'}</span>
                {sport.label}
              </span>
              <ProgressBar
                value={sport.playedCount}
                max={stats.totalPlayed}
                label={`${sport.label}: ${sport.playedCount} oyun`}
                className={styles.sportBar}
              />
              <span className={styles.sportCount}>{sport.playedCount}</span>
            </li>
          ))}
        </ul>
      )}
      {stats.totalPlayed > 0 && (
        <>
          <hr className={styles.divider} />
          <ActivityChart months={stats.playedByMonth} />
        </>
      )}
    </section>
  )
}
