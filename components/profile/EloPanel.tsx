import detail from '@/components/games/GameDetail.module.css'
import { SPORT_EMOJI } from '@/components/games/sports'
import { ELO_START } from '@/lib/elo'
import type { MyProfile } from '@/lib/api-types'
import styles from './EloPanel.module.css'

type SportElo = MyProfile['elo'][number]

const W = 320
const H = 120
const PAD = { top: 14, right: 10, bottom: 18, left: 34 }

/** The rating after each game, from the 1000 everyone starts at, on one scale with the start line. */
function EloChart({ sport }: { sport: SportElo }) {
  const points = [{ gameId: 'start', at: '', rating: ELO_START }, ...sport.history]
  const values = points.map((point) => point.rating)
  // A little room above and below, and the start line always in view.
  const low = Math.min(...values, ELO_START) - 10
  const high = Math.max(...values, ELO_START) + 10
  const x = (index: number) => PAD.left + (index / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right)
  const y = (rating: number) => PAD.top + (1 - (rating - low) / (high - low)) * (H - PAD.top - PAD.bottom)
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.rating).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]

  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${sport.label} Elo: ${ELO_START}-dən ${sport.rating}-ə, ${sport.games} oyunda`}>
      <line className={styles.grid} x1={PAD.left} x2={W - PAD.right} y1={y(ELO_START)} y2={y(ELO_START)} />
      <text className={styles.tick} x={PAD.left - 6} y={y(ELO_START) + 4} textAnchor="end">
        {ELO_START}
      </text>
      <path className={styles.area} d={`${line} L${x(points.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`} />
      <path className={styles.line} d={line} pathLength={1} />
      {points.slice(1).map((point, index) => (
        // Bigger than the dot, so a finger or pointer finds it; the title is the tooltip.
        <circle key={point.gameId} className={styles.hit} cx={x(index + 1)} cy={y(point.rating)} r={7}>
          <title>{`${new Date(point.at).toLocaleDateString('az', { day: 'numeric', month: 'short', timeZone: 'Asia/Baku' })}: ${point.rating}`}</title>
        </circle>
      ))}
      {/* The current rating is the big number above; the dot marks where the line ends. */}
      <circle className={styles.end} cx={x(points.length - 1)} cy={y(last.rating)} r={4.5} />
    </svg>
  )
}

/** "Elo reytinqi": each sport's rating, its peak and its course, most-played sport first. */
export function EloPanel({ elo, emptyText }: { elo: SportElo[]; emptyText: string }) {
  return (
    <section className={detail.panel} aria-labelledby="elo-title">
      <h2 id="elo-title" className={detail.panelLabel}>
        Elo reytinqi
      </h2>
      {elo.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <>
          <div className={styles.sports}>
            {elo.map((sport) => (
              <figure key={sport.sport} className={styles.sport}>
                <figcaption className={styles.head}>
                  <span className={styles.label}>
                    <span aria-hidden="true">{SPORT_EMOJI[sport.sport] ?? '🏅'}</span> {sport.label}
                  </span>
                  <span className={styles.rating}>{sport.rating}</span>
                  <span className={styles.meta}>
                    {sport.games} oyun · ən yüksək {sport.peak}
                  </span>
                </figcaption>
                <EloChart sport={sport} />
              </figure>
            ))}
          </div>
          <p className={styles.note}>Hər kəs {ELO_START}-dən başlayır. Güclü rəqibə qalib gəlmək daha çox xal gətirir, zəif rəqibə uduzmaq daha çox apardır.</p>
        </>
      )}
    </section>
  )
}
