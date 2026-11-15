import type { CSSProperties } from 'react'

import type { WinLossRecord } from '@/lib/team-logic'
import styles from './StatCharts.module.css'

const OUTCOMES = [
  { key: 'wins', label: 'Qələbə', className: styles.win },
  { key: 'draws', label: 'Heç-heçə', className: styles.draw },
  { key: 'losses', label: 'Məğlubiyyət', className: styles.loss },
] as const

/**
 * The record as one bar split into wins, draws and losses, with the win rate as the headline. The
 * legend carries every count, so nothing depends on telling the colors apart.
 */
export function RecordBar({ record }: { record: WinLossRecord }) {
  const parts = OUTCOMES.filter((outcome) => record[outcome.key] > 0)
  return (
    <figure className={styles.figure}>
      <div className={styles.headline}>
        <p className={styles.hero}>
          {Math.round(record.winRate * 100)}%<span className={styles.heroLabel}>qələbə faizi</span>
        </p>
        <p className={styles.aside}>{record.played} oyun</p>
      </div>
      <div className={styles.stack} aria-hidden="true">
        {parts.map((outcome, index) => (
          <span
            key={outcome.key}
            className={`${styles.segment} ${outcome.className}`}
            style={{ flexGrow: record[outcome.key], '--i': index } as CSSProperties}
            title={`${outcome.label}: ${record[outcome.key]}`}
          />
        ))}
      </div>
      <figcaption>
        <ul className={styles.legend}>
          {OUTCOMES.map((outcome) => (
            <li key={outcome.key}>
              <span className={`${styles.swatch} ${outcome.className}`} aria-hidden="true" />
              {outcome.label} <strong>{record[outcome.key]}</strong>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

/** Goals for and against on one scale, with the difference beside them. */
export function GoalsBars({ scored, conceded }: { scored: number; conceded: number }) {
  const max = Math.max(scored, conceded, 1)
  const difference = scored - conceded
  const rows = [
    { label: 'Vurulan qol', value: scored, className: styles.win },
    { label: 'Buraxılan qol', value: conceded, className: styles.loss },
  ]
  return (
    <figure className={styles.figure}>
      <dl className={styles.bars}>
        {rows.map((row, index) => (
          <div key={row.label} className={styles.barRow}>
            <dt className={styles.barLabel}>{row.label}</dt>
            <dd className={styles.barTrack}>
              <span
                className={`${styles.bar} ${row.className}`}
                style={{ width: `${(row.value / max) * 100}%`, '--i': index } as CSSProperties}
              />
              <span className={styles.barValue}>{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>
      <figcaption className={styles.aside}>
        Qol fərqi: <strong>{difference > 0 ? `+${difference}` : difference}</strong>
      </figcaption>
    </figure>
  )
}

/** Games played in each of the last six months, the current one last. */
export function ActivityChart({ months }: { months: Array<{ key: string; label: string; played: number }> }) {
  const max = Math.max(...months.map((month) => month.played), 1)
  const total = months.reduce((sum, month) => sum + month.played, 0)
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.chartTitle}>
        Son 6 ay <span className={styles.aside}>{total} oyun</span>
      </figcaption>
      <ol className={styles.columns}>
        {months.map((month, index) => (
          <li key={month.key} className={styles.column} title={`${month.label}: ${month.played} oyun`}>
            <span className={styles.columnValue} aria-hidden="true">{month.played > 0 ? month.played : ''}</span>
            <span className={styles.columnTrack}>
              <span
                className={`${styles.columnBar} ${index === months.length - 1 ? styles.current : ''}`}
                style={{ height: `${(month.played / max) * 100}%`, '--i': index } as CSSProperties}
              />
            </span>
            <span className={styles.columnLabel}>
              {month.label}
              <span className="visually-hidden">: {month.played} oyun</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
