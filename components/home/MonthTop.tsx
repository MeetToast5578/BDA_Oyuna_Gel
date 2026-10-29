import type { PostgresAdapter } from '@payloadcms/db-postgres'
import Link from 'next/link'
import { connection } from 'next/server'

import { SPORT_EMOJI, SPORT_LABELS, SPORT_ORDER } from '@/components/games/sports'
import { startOfBakuMonth } from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { playerStandings } from '@/lib/records'
import styles from './MonthTop.module.css'

/** "Ayın ən yaxşıları": the first three players of each sport this month; nothing until someone has a result. */
export async function MonthTop() {
  // The month comes from the clock, so this is request-time work.
  await connection()
  const payload = await getPayloadClient()
  const since = startOfBakuMonth(new Date())
  const boards = (
    await Promise.all(
      SPORT_ORDER.map(async (sport) => ({
        sport,
        top: (await playerStandings((payload.db as unknown as PostgresAdapter).drizzle, sport, since)).slice(0, 3),
      })),
    )
  ).filter((board) => board.top.length > 0)
  if (boards.length === 0) return null

  return (
    <section className={`container ${styles.section}`} aria-labelledby="month-top-title">
      <div className={styles.head}>
        <h2 id="month-top-title" className={styles.title}>
          Ayın ən yaxşıları
        </h2>
        <Link href="/leaderboard?period=month" className={styles.all}>
          Reytinqə bax <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className={styles.boards}>
        {boards.map(({ sport, top }) => (
          <Link key={sport} href={`/leaderboard?sport=${sport}&period=month`} className={styles.board}>
            <h3 className={styles.sport}>
              <span aria-hidden="true">{SPORT_EMOJI[sport]}</span> {SPORT_LABELS[sport]}
            </h3>
            <ol className={styles.list}>
              {top.map((player, index) => (
                <li key={player.id} className={styles.row}>
                  <span className={`${styles.rank} ${styles[`rank${index + 1}`]}`}>{index + 1}</span>
                  <span className={styles.name}>{player.name}</span>
                  <span className={styles.points}>{player.record.points} xal</span>
                </li>
              ))}
            </ol>
          </Link>
        ))}
      </div>
    </section>
  )
}
