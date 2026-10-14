import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BackHomeLink, GamesSection } from '@/components/games/GamesSection'
import { GamesSectionSkeleton } from '@/components/games/skeletons'
import { SPORT_LABELS } from '@/components/games/sports'
import { DEFAULT_CITY } from '@/lib/game-backend'
import { listVenues } from '@/lib/game-queries'
import { listFiltersFromSearchParams, loadGameList, sportFromSearchParams } from '@/lib/page-data'

const PAGE_SIZE = 12
const TITLE = 'Keçmiş oyunlar'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sport = sportFromSearchParams(await searchParams)
  return { title: sport ? `${SPORT_LABELS[sport]} — keçmiş oyunlar` : TITLE }
}

/** Games that already happened, most recent first. Filtered by `?sport=`, level and venue, so it streams in. */
async function PastGames({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const sport = sportFromSearchParams(params)
  // The date presets (today, tomorrow, the weekend) only look ahead.
  const filters = { ...listFiltersFromSearchParams(params), date: null }
  const [{ list, sports }, venues] = await Promise.all([
    loadGameList({ sport, limit: PAGE_SIZE, when: 'past', filters }),
    listVenues(DEFAULT_CITY, sport, null),
  ])

  return (
    <GamesSection
      title={TITLE}
      titleLevel="h1"
      sports={sports}
      sport={sport}
      basePath="/games/past"
      list={list}
      when="past"
      filters={filters}
      venues={venues}
    />
  )
}

/**
 * "Keçmiş oyunlar", the other half of "Bütün oyunlar". A page of its own rather than `?when=past`,
 * so its static shell already carries the right title while the list streams in.
 */
export default function PastGamesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={<GamesSectionSkeleton title={TITLE} titleLevel="h1" cards={6} backLink={<BackHomeLink />} whenLinks />}
    >
      <PastGames searchParams={searchParams} />
    </Suspense>
  )
}
