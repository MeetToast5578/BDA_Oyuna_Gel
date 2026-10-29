import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { SportBadge } from '@/components/games/bits'
import { CoverImage } from '@/components/games/CoverImage'
import card from '@/components/games/GameCard.module.css'
import grid from '@/components/games/GamesGrid.module.css'
import { BackHomeLink } from '@/components/games/GamesSection'
import section from '@/components/games/GamesSection.module.css'
import { Icon } from '@/components/ui/Icon'
import { SegmentedLinks } from '@/components/ui/SegmentedLinks'
import { buttonClass } from '@/components/ui/button'
import { VenueMapLoader } from '@/components/venues/VenueMapLoader'
import { DEFAULT_CITY, SPORT_META } from '@/lib/game-backend'
import { listVenuePages } from '@/lib/game-queries'

export const metadata: Metadata = { title: 'Meydançalar' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Every venue in Baku, as cards or on a map, each linking to its page with directions and its games. */
async function VenueList({ searchParams }: { searchParams: SearchParams }) {
  const venues = await listVenuePages(DEFAULT_CITY)
  const onMap = (await searchParams).view === 'map'
  const views = (
    <SegmentedLinks
      label="Görünüş"
      options={[
        { href: '/venues', label: 'Siyahı', active: !onMap },
        { href: '/venues?view=map', label: 'Xəritə', active: onMap },
      ]}
    />
  )

  if (onMap) {
    const sports = (types: string[]) => types.map((sport) => SPORT_META[sport]?.label ?? sport).join(' · ')
    const pins = venues.flatMap((venue) =>
      venue.coordinates && venue.id
        ? [
            {
              id: venue.id,
              name: venue.name,
              place: [venue.address, venue.district].filter(Boolean).join(', '),
              sports: sports(venue.sportTypes),
              ...venue.coordinates,
            },
          ]
        : [],
    )
    const unmapped = venues.filter((venue) => !venue.coordinates)
    return (
      <>
        {views}
        <VenueMapLoader pins={pins} />
        {unmapped.length > 0 && (
          <p className={section.filter}>
            Xəritədə olmayanlar:{' '}
            {unmapped.map((venue, index) => (
              <span key={venue.id}>
                {index > 0 && ', '}
                <Link href={`/venues/${venue.id}`}>{venue.name}</Link>
              </span>
            ))}
          </p>
        )}
      </>
    )
  }

  return (
    <>
      {views}
      <ul className={grid.grid}>
        {venues.map((venue) => (
          <li key={venue.id}>
            <article className={card.card}>
              <div className={card.media}>
                <CoverImage
                  src={venue.imageUrl ?? SPORT_META.football.image}
                  fallbackSrc={SPORT_META.football.image}
                  alt=""
                  sizes="(max-width: 859px) 100vw, (max-width: 1023px) 50vw, 339px"
                />
              </div>
              <div className={card.body}>
                <div className={card.meta}>
                  <h2 className={card.title}>
                    <Link href={`/venues/${venue.id}`} className={card.titleLink}>
                      {venue.name}
                    </Link>
                  </h2>
                  <p className={card.metaRow}>
                    <span className={card.metaItem}>
                      <Icon name="pin" />
                      <span className="visually-hidden">Ünvan:</span>
                      {[venue.address, venue.district].filter(Boolean).join(', ') || venue.cityLabel}
                    </span>
                  </p>
                </div>
                {venue.sportTypes.length > 0 && (
                  <p className={card.metaRow}>
                    {venue.sportTypes.map((sport) => (
                      <SportBadge key={sport} sport={sport} label={SPORT_META[sport]?.label ?? sport} />
                    ))}
                  </p>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function VenuesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className={`container ${section.section}`} aria-labelledby="venues-title">
      <div className={section.intro}>
        <BackHomeLink />
        <div className={section.headText}>
          <h1 id="venues-title" className={section.title}>
            Meydançalar
          </h1>
          <p className={section.filter}>Bakıda oyun keçirilən meydançalar</p>
        </div>
        <Link href="/venues/suggest" className={buttonClass('outlinePrimary', 'md')}>
          Meydança təklif et
        </Link>
      </div>
      <Suspense fallback={<p className={section.filter}>Yüklənir…</p>}>
        <VenueList searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
