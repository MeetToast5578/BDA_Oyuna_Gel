import Link from 'next/link'

import type { MyProfile } from '@/lib/api-types'
import type { Outcome } from '@/lib/team-logic'
import { SportBadge } from '@/components/games/bits'
import detail from '@/components/games/GameDetail.module.css'
import styles from './Profile.module.css'
import { GoalsBars, RecordBar } from './StatCharts'

const OUTCOME = { win: { letter: 'Q', word: 'qələbə' }, draw: { letter: 'H', word: 'heç-heçə' }, loss: { letter: 'M', word: 'məğlubiyyət' } }

/** The last five outcomes as Q / H / M pills, newest first; `small` for a table row. */
export function FormPills({ form, small = false }: { form: Outcome[]; small?: boolean }) {
  return (
    <ol className={styles.form} aria-label="Son nəticələr, ən yenisi birinci">
      {form.map((outcome, index) => (
        <li key={index} className={`${styles.pill} ${styles[`pill${outcome}`]} ${small ? styles.pillSmall : ''}`}>
          <span aria-hidden="true">{OUTCOME[outcome].letter}</span>
          <span className="visually-hidden">{OUTCOME[outcome].word}</span>
        </li>
      ))}
    </ol>
  )
}

/** Win rate, wins/draws/losses, goals and the last five results, from games whose score was confirmed. */
export function RecordCharts({ record }: { record: MyProfile['record'] }) {
  return (
    <div className={styles.recordGrid}>
      <RecordBar record={record} />
      <GoalsBars scored={record.scored} conceded={record.conceded} />
      <div className={styles.formRow}>
        <span className={styles.formLabel}>Son nəticələr</span>
        <FormPills form={record.form} />
      </div>
    </div>
  )
}

/**
 * "Nəticələr" on a profile: the record from confirmed scores, then the clubs the person is in. A
 * game whose score nobody confirmed counts as played elsewhere but has no result to show here.
 */
export function RecordPanel({
  record,
  clubs,
  emptyClubs,
}: {
  record: MyProfile['record']
  clubs: MyProfile['clubs']
  emptyClubs: React.ReactNode
}) {
  return (
    <section className={detail.panel} aria-labelledby="record-title">
      <h2 id="record-title" className={detail.panelLabel}>
        Nəticələr
      </h2>
      {record.played === 0 ? (
        <p className={styles.statsEmpty}>Hələ təsdiqlənmiş nəticə yoxdur.</p>
      ) : (
        <RecordCharts record={record} />
      )}
      <hr className={styles.divider} />
      <h3 className={detail.panelLabel}>Komandalar</h3>
      {clubs.length === 0 ? (
        <p className={styles.statsEmpty}>{emptyClubs}</p>
      ) : (
        <ul className={styles.clubs}>
          {clubs.map((club) => (
            <li key={club.id}>
              <Link href={`/teams/${club.id}`} className={styles.clubLink}>
                {club.name}
                <SportBadge sport={club.sport} label={club.sportLabel} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
