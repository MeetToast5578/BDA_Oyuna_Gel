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
import { DEFAULT_CITY, SPORT_META } from '@/lib/game-backend'
import { listVenuePages } from '@/lib/game-queries'

export const metadata: Metadata = { title: 'Meydançalar' }

/** Every venue in Baku, each linking to its page with directions and the games played there. */
async function VenueList() {
  const venues = await listVenuePages(DEFAULT_CITY)
  return (
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
  )
}

export default function VenuesPage() {
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
      </div>
      <Suspense fallback={<p className={section.filter}>Yüklənir…</p>}>
        <VenueList />
      </Suspense>
    </section>
  )
}
