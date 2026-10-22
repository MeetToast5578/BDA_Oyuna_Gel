import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { SportBadge } from '@/components/games/bits'
import { EmptyState } from '@/components/games/EmptyState'
import card from '@/components/games/GameCard.module.css'
import grid from '@/components/games/GamesGrid.module.css'
import { BackHomeLink } from '@/components/games/GamesSection'
import section from '@/components/games/GamesSection.module.css'
import { SPORT_LABELS, SPORT_ORDER } from '@/components/games/sports'
import { SportTabs } from '@/components/games/SportTabs'
import { TeamListSkeleton } from '@/components/games/skeletons'
import { buttonClass } from '@/components/ui/button'
import styles from '@/components/teams/Teams.module.css'
import { getPayloadClient } from '@/lib/game-queries'
import { sportFromSearchParams } from '@/lib/page-data'
import { byStanding, listTeams } from '@/lib/teams'

export const metadata: Metadata = { title: 'Komandalar' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type Team = Awaited<ReturnType<typeof listTeams>>[number]

/** "Reytinq": the clubs of one sport by points, then goal difference, then goals scored, from confirmed scores. */
function Standings({ teams, sport }: { teams: Team[]; sport: string }) {
  if (teams.every((team) => team.record.played === 0)) {
    return <p className={section.filter}>Hələ təsdiqlənmiş nəticə yoxdur — cədvəl ilk təsdiqlənmiş hesabdan sonra görünəcək.</p>
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{sport} · reytinq cədvəli</caption>
        <thead>
          <tr>
            <th scope="col">
              <abbr title="Sıra">#</abbr>
            </th>
            <th scope="col">Komanda</th>
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
            <th scope="col">
              <abbr title="Vurulan və buraxılan qol">Q:B</abbr>
            </th>
            <th scope="col">
              <abbr title="Xal: qələbə 3, heç-heçə 1">Xal</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, index) => (
            <tr key={team.id}>
              <td>{index + 1}</td>
              <td>
                <Link href={`/teams/${team.id}`}>{team.name}</Link>
              </td>
              <td>{team.record.played}</td>
              <td>{team.record.wins}</td>
              <td>{team.record.draws}</td>
              <td>{team.record.losses}</td>
              <td>
                {team.record.scored}:{team.record.conceded}
              </td>
              <td>{team.record.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The clubs with members, biggest first, under sport tabs that count clubs. */
async function TeamList({ searchParams }: { searchParams: SearchParams }) {
  const sport = sportFromSearchParams(await searchParams)
  const all = await listTeams(await getPayloadClient(), null)
  const teams = sport ? all.filter((team) => team.sport === sport) : all
  const tabs = SPORT_ORDER.map((value) => ({
    sport: value,
    label: SPORT_LABELS[value],
    iconKey: value,
    count: all.filter((team) => team.sport === value).length,
  }))

  return (
    <>
      <SportTabs sports={tabs} active={sport} basePath="/teams" countLabel="komanda" />
      {/* Different sports can't share a table, so it needs one sport chosen. */}
      {sport && teams.length > 0 && <Standings teams={[...teams].sort(byStanding)} sport={SPORT_LABELS[sport]} />}
      {teams.length === 0 ? (
        <EmptyState
          title="Hələ komanda yoxdur"
          text="İlk komandanı siz yaradın, dostlarınızı dəvət linki ilə çağırın."
          action={
            <Link href={sport ? `/teams/new?sport=${sport}` : '/teams/new'} className={buttonClass('primary', 'md')}>
              Komanda yarat
            </Link>
          }
        />
      ) : (
        <ul className={grid.grid}>
          {teams.map((team) => (
            <li key={team.id}>
              <article className={card.card}>
                <div className={card.body}>
                  <div className={card.meta}>
                    <h2 className={card.title}>
                      <Link href={`/teams/${team.id}`} className={card.titleLink}>
                        {team.name}
                      </Link>
                    </h2>
                    <p className={card.metaRow}>
                      <span className={card.metaItem}>{team.memberCount} üzv</span>
                    </p>
                  </div>
                  <p className={card.metaRow}>
                    <SportBadge sport={team.sport} label={team.sportLabel} />
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** "Komandalar": persistent clubs that stand on a side of a game. Creating one needs an account. */
export default function TeamsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className={`container ${section.section}`} aria-labelledby="teams-title">
      <div className={section.intro}>
        <BackHomeLink />
        <div className={section.headText}>
          <h1 id="teams-title" className={section.title}>
            Komandalar
          </h1>
          <p className={section.filter}>Dostlarınızla komanda qurun və oyunlarda birlikdə oynayın</p>
        </div>
        <Link href="/teams/new" className={buttonClass('primary', 'md')}>
          Komanda yarat
        </Link>
      </div>
      <Suspense fallback={<TeamListSkeleton />}>
        <TeamList searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
