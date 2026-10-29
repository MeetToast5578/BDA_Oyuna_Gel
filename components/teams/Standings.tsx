import Link from 'next/link'

import { FormPills } from '@/components/profile/RecordPanel'
import type { WinLossRecord } from '@/lib/team-logic'
import styles from './Teams.module.css'

export type StandingRow = { id: string; href: string; name: string; record: WinLossRecord }

const MEDALS = [styles.gold, styles.silver, styles.bronze]

/** A league table in the order given: played, wins, draws, losses, goals, points and the last five results (goals and form hide on phones, so points stay in view). */
export function StandingsTable({ caption, nameHeader, rows }: { caption: string; nameHeader: string; rows: StandingRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <abbr title="Sıra">#</abbr>
            </th>
            <th scope="col">{nameHeader}</th>
            <th scope="col">
              <abbr title="Oyun">O</abbr>
            </th>
            <th scope="col">
              <abbr title="Qələbə">Q</abbr>
            </th>
            <th scope="col">
              <abbr title="Heç-heçə">H</abbr>
            </th>
            <th scope="col">
              <abbr title="Məğlubiyyət">M</abbr>
            </th>
            <th scope="col" className={styles.wide}>
              <abbr title="Vurulan və buraxılan qol">Q:B</abbr>
            </th>
            <th scope="col">
              <abbr title="Xal: qələbə 3, heç-heçə 1">Xal</abbr>
            </th>
            <th scope="col" className={styles.wide}>
              Forma
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td>
                <span className={`${styles.rank} ${MEDALS[index] ?? ''}`}>{index + 1}</span>
              </td>
              <td>
                <Link href={row.href}>{row.name}</Link>
              </td>
              <td>{row.record.played}</td>
              <td>{row.record.wins}</td>
              <td>{row.record.draws}</td>
              <td>{row.record.losses}</td>
              <td className={styles.wide}>
                {row.record.scored}:{row.record.conceded}
              </td>
              <td className={styles.points}>{row.record.points}</td>
              <td className={styles.wide}>
                <FormPills form={row.record.form} small />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
