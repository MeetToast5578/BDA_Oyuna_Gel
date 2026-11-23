import { SportIcon } from './bits'
import styles from './GamesGrid.module.css'

export function EmptyState({
  title,
  text,
  action,
  headingLevel = 'h3',
}: {
  title: string
  text: string
  action?: React.ReactNode
  headingLevel?: 'h1' | 'h2' | 'h3'
}) {
  const Heading = headingLevel
  return (
    <div className={styles.empty}>
      {/* Decorative: the three sport balls on a soft disc, drawn with the site's own icons. */}
      <div className={styles.emptyArt} aria-hidden="true">
        <svg className={styles.emptyArcs} viewBox="0 0 220 180" fill="none" strokeWidth="5" strokeLinecap="round">
          <path className={styles.arcFootball} d="M30 118c18 34 70 50 118 30" />
          <path className={styles.arcBasketball} d="M58 34c34-22 86-18 116 14" />
          <path className={styles.arcTennis} d="M186 82c8 26-2 52-24 68" />
        </svg>
        {['football', 'basketball', 'tennis'].map((sport) => (
          <span key={sport} data-sport={sport} className={styles.emptyBall}>
            <SportIcon sport={sport} size={44} />
          </span>
        ))}
      </div>
      <Heading className={styles.emptyTitle}>{title}</Heading>
      <p className={styles.emptyText}>{text}</p>
      {action}
    </div>
  )
}
