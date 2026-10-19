import Link from 'next/link'

import type { MyProfile } from '@/lib/api-types'
import type { Outcome } from '@/lib/team-logic'
import { SportBadge } from '@/components/games/bits'
import detail from '@/components/games/GameDetail.module.css'
import styles from './Profile.module.css'
import { StatTiles } from './ProfileStats'

const OUTCOME = { win: { letter: 'Q', word: 'qələbə' }, draw: { letter: 'H', word: 'heç-heçə' }, loss: { letter: 'M', word: 'məğlubiyyət' } }

/** The last five outcomes as Q / H / M pills, newest first. */
export function FormPills({ form }: { form: Outcome[] }) {
  return (
    <ol className={styles.form} aria-label="Son nəticələr, ən yenisi birinci">
      {form.map((outcome, index) => (
        <li key={index} className={`${styles.pill} ${styles[`pill${outcome}`]}`}>
          <span aria-hidden="true">{OUTCOME[outcome].letter}</span>
          <span className="visually-hidden">{OUTCOME[outcome].word}</span>
        </li>
      ))}
    </ol>
  )
}

/** Wins, draws, losses, win rate and goals, from games whose score was confirmed. */
export function RecordTiles({ record }: { record: MyProfile['record'] }) {
  return (
    <>
      <StatTiles
        tiles={[
          { value: record.wins, label: 'qələbə' },
          { value: record.draws, label: 'heç-heçə' },
          { value: record.losses, label: 'məğlubiyyət' },
          { value: Math.round(record.winRate * 100), label: 'qələbə, %' },
        ]}
      />
      <StatTiles
        tiles={[
          { value: record.scored, label: 'vurulan qol' },
          { value: record.conceded, label: 'buraxılan qol' },
        ]}
      />
      <FormPills form={record.form} />
    </>
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
        <RecordTiles record={record} />
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
