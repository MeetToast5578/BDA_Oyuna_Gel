import { connection } from 'next/server'
import { Suspense } from 'react'

import { GamesSection } from '@/components/games/GamesSection'
import { GamesSectionSkeleton, TicketCarouselSkeleton } from '@/components/games/skeletons'
import { Hero } from '@/components/home/Hero'
import { HowItWorks } from '@/components/home/HowItWorks'
import { MonthTop } from '@/components/home/MonthTop'
import { TicketCarousel } from '@/components/home/TicketCarousel'
import { DEFAULT_CITY, FEATURED_LIMIT } from '@/lib/game-backend'
import { getFeaturedGames } from '@/lib/game-queries'
import { loadGameList, sportFromSearchParams } from '@/lib/page-data'

const GAMES_ANCHOR = 'oyunlar'
/** One row of three cards; "Daha çox" reveals three more at a time. */
const HOME_PAGE_SIZE = 3
const GAMES_EYEBROW = 'Açıq oyunlar'
const GAMES_TITLE = 'Bu gün və sabah üçün qoşula biləcəyin oyunlar'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Featured games are ranked against the current time, so they stream in rather than prerender. */
async function FeaturedCarousel() {
  // Ranking reads the clock; `connection()` marks that as request-time work so the rest of the
  // page can still prerender without this value being baked into the shell.
  await connection()
  const featured = await getFeaturedGames(DEFAULT_CITY, FEATURED_LIMIT)
  return featured.length > 0 ? <TicketCarousel games={featured} /> : null
}

/** The grid is filtered by `?sport=`, which only exists at request time. */
async function OpenGames({ searchParams }: { searchParams: SearchParams }) {
  const sport = sportFromSearchParams(await searchParams)
  const { list, sports } = await loadGameList({ sport, limit: HOME_PAGE_SIZE })

  return (
    <GamesSection
      id={GAMES_ANCHOR}
      eyebrow={GAMES_EYEBROW}
      title={GAMES_TITLE}
      sports={sports}
      sport={sport}
      basePath="/"
      list={list}
      seeAllHref={sport ? `/games?sport=${sport}` : '/games'}
    />
  )
}

export default function HomePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Hero
        gamesAnchor={GAMES_ANCHOR}
        carousel={
          <Suspense fallback={<TicketCarouselSkeleton />}>
            <FeaturedCarousel />
          </Suspense>
        }
      />
      {/* Placeholders shaped like the real sections, so nothing jumps when the data arrives. */}
      <Suspense
        fallback={
          <GamesSectionSkeleton id={GAMES_ANCHOR} eyebrow={GAMES_EYEBROW} title={GAMES_TITLE} cards={HOME_PAGE_SIZE} />
        }
      >
        <OpenGames searchParams={searchParams} />
      </Suspense>
      {/* Nothing until this month has a result, so no placeholder either. */}
      <Suspense fallback={null}>
        <MonthTop />
      </Suspense>
      <HowItWorks />
    </>
  )
}
