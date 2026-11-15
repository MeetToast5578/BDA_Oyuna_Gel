import Link from 'next/link'

import detail from '@/components/games/GameDetail.module.css'
import type { MyProfile } from '@/lib/api-types'
import styles from './GameHistory.module.css'
import profile from './Profile.module.css'

const OUTCOME = { win: { letter: 'Q', word: 'qələbə' }, draw: { letter: 'H', word: 'heç-heçə' }, loss: { letter: 'M', word: 'məğlubiyyət' } }

/**
 * "Oyun tarixçəsi": the latest played games, newest first. The score is from the person's side; the
 * result and the Elo change show once the score counts, a dash until then.
 */
export function GameHistory({ history, emptyText }: { history: MyProfile['history']; emptyText: string }) {
  return (
    <section className={detail.panel} aria-labelledby="history-title">
      <h2 id="history-title" className={detail.panelLabel}>
        Oyun tarixçəsi
      </h2>
      {history.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <ol className={styles.list}>
          {history.map((game) => (
            <li key={game.id} className={styles.row}>
              <span className={styles.date}>{game.dateLabel}</span>
              <span className={styles.what}>
                <Link href={`/games/${game.id}`} className={styles.title}>
                  {game.title}
                </Link>
                <span className={styles.where}>{[game.sportLabel, game.venue].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={styles.result}>
                {game.outcome && (
                  <span className={`${profile.pill} ${profile.pillSmall} ${profile[`pill${game.outcome}`]}`}>
                    <span aria-hidden="true">{OUTCOME[game.outcome].letter}</span>
                    <span className="visually-hidden">{OUTCOME[game.outcome].word}</span>
                  </span>
                )}
                <span className={styles.score}>{game.score ? `${game.score.mine}:${game.score.theirs}` : <span className={styles.none}>hesab yoxdur</span>}</span>
              </span>
              <span className={styles.elo}>
                {game.eloDelta === null ? (
                  <span className={styles.none}>
                    <span aria-hidden="true">—</span>
                    <span className="visually-hidden">Elo dəyişməyib</span>
                  </span>
                ) : (
                  <>
                    <span className="visually-hidden">Elo </span>
                    {game.eloDelta > 0 ? `+${game.eloDelta}` : game.eloDelta < 0 ? `−${Math.abs(game.eloDelta)}` : '0'}
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
