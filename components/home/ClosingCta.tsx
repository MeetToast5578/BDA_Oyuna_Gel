import Link from 'next/link'

import { SportIcon } from '@/components/games/bits'
import { buttonClass } from '@/components/ui/button'
import styles from './ClosingCta.module.css'

/** Last thing on the home page: one bold invitation to start a game, with the three balls floating. */
export function ClosingCta({ gamesAnchor }: { gamesAnchor: string }) {
  return (
    <section className={`container scroll-reveal ${styles.wrap}`} aria-labelledby="cta-title">
      <div className={styles.band}>
        <div className={styles.balls} aria-hidden="true">
          {['football', 'basketball', 'tennis'].map((sport) => (
            <span key={sport} className={styles.ball}>
              <SportIcon sport={sport} size={56} />
            </span>
          ))}
        </div>
        <h2 id="cta-title" className={styles.title}>
          Komandanı yığ, oyuna gəl
        </h2>
        <p className={styles.text}>Oyun yarat, dostlarını linklə çağır və meydançada görüş.</p>
        <div className={styles.actions}>
          <Link href="/games/new" className={buttonClass('accent', 'lg')}>
            Oyun yarat
          </Link>
          <a href={`#${gamesAnchor}`} className={buttonClass('outlineLight', 'lg')}>
            Açıq oyunlara bax
          </a>
        </div>
      </div>
    </section>
  )
}
