import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { EmptyState } from '@/components/games/EmptyState'
import { BackHomeLink } from '@/components/games/GamesSection'
import section from '@/components/games/GamesSection.module.css'
import { SPORT_LABELS, SPORT_ORDER } from '@/components/games/sports'
import { SportTabs } from '@/components/games/SportTabs'
import { StandingsTable } from '@/components/teams/Standings'
import styles from '@/components/teams/Teams.module.css'
import { SegmentedLinks } from '@/components/ui/SegmentedLinks'
import { withQuery } from '@/lib/api-client'
import { getPayloadClient } from '@/lib/game-queries'
import { sportFromSearchParams } from '@/lib/page-data'
import { startOfBakuMonth } from '@/lib/game-backend'
import { playerStandings } from '@/lib/records'
import { getCurrentUser } from '@/lib/session'
import { byStanding, listTeams, userClubs } from '@/lib/teams'

export const metadata: Metadata = { title: 'Reytinq' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** One sport's table of players or clubs; a sport is always chosen, since sports can't share a table. */
async function Board({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const sport = sportFromSearchParams(params) ?? 'football'
  const teamsView = params.view === 'teams'
  const monthly = params.period === 'month'
  const since = monthly ? startOfBakuMonth(new Date()) : null
  const [payload, user] = await Promise.all([getPayloadClient(), getCurrentUser()])
  const mine = !user ? [] : teamsView ? (await userClubs(payload, user.id)).map((club) => String(club.id)) : [String(user.id)]

  // Only who has a counted result is ranked; a club's record is every game it stood on a side of.
  const bySport = teamsView
    ? await listTeams(payload, null, since).then((teams) =>
        SPORT_ORDER.map((value) =>
          teams
            .filter((team) => team.sport === value && team.record.played > 0)
            .sort(byStanding)
            .map((team) => ({ id: team.id, href: `/teams/${team.id}`, name: team.name, record: team.record })),
        ),
      )
    : await Promise.all(
        SPORT_ORDER.map(async (value) =>
          (await playerStandings((payload.db as unknown as PostgresAdapter).drizzle, value, since)).map((player) => ({
            ...player,
            href: `/users/${player.id}`,
          })),
        ),
      )
  const rows = bySport[SPORT_ORDER.indexOf(sport)]
  // Each switch keeps the others: view, period and sport travel together.
  const href = (next: { view?: 'teams' | null; period?: 'month' | null }) =>
    withQuery('/leaderboard', { sport, view: teamsView ? 'teams' : null, period: monthly ? 'month' : null, ...next })

  return (
    <>
      <div className={styles.switches}>
        <SegmentedLinks
          label="Reytinq"
          options={[
            { href: href({ view: null }), label: 'Oyunçular', active: !teamsView },
            { href: href({ view: 'teams' }), label: 'Komandalar', active: teamsView },
          ]}
        />
        <SegmentedLinks
          label="Dövr"
          options={[
            { href: href({ period: null }), label: 'Hamısı', active: !monthly },
            { href: href({ period: 'month' }), label: 'Bu ay', active: monthly },
          ]}
        />
      </div>
      <SportTabs
        sports={SPORT_ORDER.map((value, index) => ({ sport: value, label: SPORT_LABELS[value], iconKey: value, count: bySport[index].length }))}
        active={sport}
        basePath="/leaderboard"
        query={{ view: teamsView ? 'teams' : null, period: monthly ? 'month' : null }}
        countLabel={teamsView ? 'komanda' : 'oyunçu'}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={monthly ? 'Bu ay hələ nəticə yoxdur' : 'Hələ nəticə yoxdur'}
          text={
            teamsView
              ? 'Komanda cədvəli rəqib komanda hesabı təsdiqləyəndən sonra görünəcək.'
              : 'Cədvəl ilk təsdiqlənmiş hesabdan sonra görünəcək.'
          }
        />
      ) : (
        <StandingsTable
          caption={`${SPORT_LABELS[sport]} · ${teamsView ? 'komandalar' : 'oyunçular'}${monthly ? ' · bu ay' : ''}`}
          nameHeader={teamsView ? 'Komanda' : 'Oyunçu'}
          rows={rows}
          mine={mine}
          mineLabel={teamsView ? 'Sizin' : 'Siz'}
        />
      )}
    </>
  )
}

/** "Reytinq": players and clubs ranked by points from confirmed scores, one sport at a time. */
export default function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className={`container ${section.section}`} aria-labelledby="leaderboard-title">
      <div className={section.intro}>
        <BackHomeLink />
        <div className={section.headText}>
          <h1 id="leaderboard-title" className={section.title}>
            Reytinq
          </h1>
          <p className={section.filter}>Qələbə 3 xal, heç-heçə 1 xal. Yalnız təsdiqlənmiş hesablar sayılır.</p>
        </div>
      </div>
      <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
