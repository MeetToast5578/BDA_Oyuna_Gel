import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache, Suspense } from 'react'

import { BackLink } from '@/components/games/BackLink'
import { SportBadge } from '@/components/games/bits'
import { CoverImage } from '@/components/games/CoverImage'
import { EmptyState } from '@/components/games/EmptyState'
import styles from '@/components/games/GameDetail.module.css'
import { GamesGrid } from '@/components/games/GamesGrid'
import { buttonClass } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import { SPORT_META, mapsUrl, startOfBakuDay } from '@/lib/game-backend'
import { getVenuePage } from '@/lib/game-queries'
import { loadGameList } from '@/lib/page-data'

type Props = { params: Promise<{ id: string }> }

const PAGE_SIZE = 6

/** Shared by generateMetadata and the page within one request. */
const loadVenue = cache(async (rawId: string) => {
  const id = Number(rawId)
  return Number.isSafeInteger(id) && id > 0 ? getVenuePage(id) : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const venue = await loadVenue((await params).id)
  if (!venue) return { title: 'Meydança tapılmadı' }
  return { title: venue.name, description: [venue.address, venue.district, venue.cityLabel].filter(Boolean).join(', ') }
}

/** A venue: where it is, how to get there, and the games coming up on it. */
export default function VenuePage({ params }: Props) {
  return (
    <div className={`container-wide ${styles.page}`}>
      <BackLink fallback="/venues" className={styles.back}>
        Geri qayıt
      </BackLink>
      <Suspense fallback={<p className={styles.muted}>Yüklənir…</p>}>
        <VenueContent params={params} />
      </Suspense>
    </div>
  )
}

async function VenueContent({ params }: Props) {
  const venue = await loadVenue((await params).id)
  if (!venue?.id) notFound()

  const to = startOfBakuDay(new Date(), 366).toISOString()
  const { list } = await loadGameList({ sport: null, limit: PAGE_SIZE, to, filters: { date: null, level: null, venue: venue.id } })
  const place = [venue.address, venue.district, venue.cityLabel].filter(Boolean).join(', ')

  return (
    <div className={`${styles.column} fade`}>
      <section className={styles.card} aria-labelledby="venue-title">
        <div className={styles.cover}>
          <CoverImage
            src={venue.imageUrl ?? SPORT_META.football.image}
            fallbackSrc={SPORT_META.football.image}
            alt=""
            sizes="(max-width: 859px) 100vw, 1100px"
            priority
          />
          {venue.sportTypes.length > 0 && (
            <div className={styles.coverBadges}>
              {venue.sportTypes.map((sport) => (
                <SportBadge key={sport} sport={sport} label={SPORT_META[sport]?.label ?? sport} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.summary}>
          <h1 id="venue-title" className={styles.title}>
            {venue.name}
          </h1>
          <ul className={styles.facts}>
            <li>
              <Icon name="pin" />
              <span className="visually-hidden">Ünvan:</span> {place}
            </li>
          </ul>
          {venue.description && <p className={styles.muted}>{venue.description}</p>}
          <a
            href={mapsUrl(venue)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('primary', 'md', { className: styles.mapLink })}
          >
            Xəritədə aç
          </a>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="venue-games-title">
        <h2 id="venue-games-title" className={styles.panelLabel}>
          Bu meydançada oyunlar
        </h2>
        {list.games.length === 0 ? (
          <EmptyState
            headingLevel="h3"
            title="Hələ qarşıdakı oyun yoxdur"
            text="Bu meydançada hələ oyun planlaşdırılmayıb. İlk oyunu sən yarat."
            action={
              <Link href="/games/new" className={buttonClass('primary', 'md')}>
                Oyun yarat
              </Link>
            }
          />
        ) : (
          // "Daha çox" asks the API for the next page of this venue's games.
          <GamesGrid initial={list} query={{ to, venue: venue.id }} cardHeadingLevel="h3" cardContext="browse" />
        )}
      </section>
    </div>
  )
}
