import Link from 'next/link'

import detail from '@/components/games/GameDetail.module.css'
import styles from '@/components/games/Invites.module.css'
import { buttonClass } from '@/components/ui/button'
import { placeLabel } from '@/lib/game-backend'
import type { myWaitlist } from '@/lib/waitlist'
import { LeaveWaitlist } from './LeaveWaitlist'

type Waitlist = Awaited<ReturnType<typeof myWaitlist>>

const when = (game: Waitlist['promoted'][number]) =>
  `${game.sportLabel} · ${game.dateLabel}, ${game.timeLabel}${game.venueName ? ` · ${game.venueName}` : ''}`

/**
 * "Gözləmə siyahısı": the spots a person was handed from a waitlist in the last few days (a game they
 * are now in, so they can tell it is theirs), and the full games they are still waiting for, with their
 * place. Not rendered at all when there is neither.
 */
export function WaitlistPanel({ waitlist }: { waitlist: Waitlist }) {
  if (waitlist.promoted.length === 0 && waitlist.waiting.length === 0) return null
  return (
    <section className={detail.panel} aria-labelledby="waitlist-title">
      <h2 id="waitlist-title" className={detail.panelLabel}>
        Gözləmə siyahısı
      </h2>
      <ul className={styles.invites}>
        {waitlist.promoted.map((game) => (
          <li key={`in-${game.gameId}`} className={styles.invite}>
            <span className={styles.inviteText}>
              <span className={styles.inviteTitle}>{game.title}</span>
              <span className={styles.sub}>{when(game)}</span>
              <span className={styles.sub}>Gözləmə siyahısından sizə yer verildi — artıq bu oyundasınız.</span>
            </span>
            <span className={styles.actions}>
              <Link href={`/games/${game.gameId}`} className={buttonClass('primary', 'sm')}>
                Oyuna bax
              </Link>
            </span>
          </li>
        ))}
        {waitlist.waiting.map((game) => (
          <li key={`wait-${game.gameId}`} className={styles.invite}>
            <span className={styles.inviteText}>
              <span className={styles.inviteTitle}>{game.title}</span>
              <span className={styles.sub}>{when(game)}</span>
              <span className={styles.sub}>Siz {placeLabel(game.position)}</span>
            </span>
            <span className={styles.actions}>
              <Link href={`/games/${game.gameId}`} className={buttonClass('outlinePrimary', 'sm')}>
                Oyuna bax
              </Link>
              <LeaveWaitlist gameId={game.gameId} title={game.title} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
