import Link from 'next/link'

import type { GameListResponse, SportTab } from '@/lib/api-types'
import type { ProfileWindow } from '@/lib/game-backend'
import { buttonClass } from '@/components/ui/button'
import { SegmentedLinks } from '@/components/ui/SegmentedLinks'
import type { ListFilters } from '@/lib/page-data'
import { EmptyState } from './EmptyState'
import { DATE_LABELS, GamesFilters } from './GamesFilters'
import { GamesGrid } from './GamesGrid'
import styles from './GamesSection.module.css'
import { LEVEL_LABELS } from '@/lib/game-backend'
import { SPORT_LABELS } from './sports'
import { SportTabs } from './SportTabs'

/** "← Ana səhifəyə qayıt" above the "Bütün oyunlar" title (and in its loading placeholder). */
export function BackHomeLink() {
  return (
    <Link href="/" className={buttonClass('outlineDark', 'sm', { className: styles.back })}>
      <span aria-hidden="true">←</span> Ana səhifəyə qayıt
    </Link>
  )
}

/** "Qarşıdakı / Keçmiş" between `/games` and `/games/past`, keeping the chosen sport. */
export function GamesWhenLinks({ when, sport }: { when: ProfileWindow; sport: string | null }) {
  const query = sport ? `?sport=${sport}` : ''
  return (
    <SegmentedLinks
      label="Oyunların vaxtı"
      options={[
        { href: `/games${query}`, label: 'Qarşıdakı', active: when === 'upcoming' },
        { href: `/games/past${query}`, label: 'Keçmiş', active: when === 'past' },
      ]}
    />
  )
}

/**
 * Sport tabs, filter summary and the game grid; shared by the homepage, "Bütün oyunlar" and
 * "Keçmiş oyunlar". With `titleLevel="h1"` it is a page of its own: a "← Ana səhifəyə qayıt" link and
 * the title come before the tabs. `when` (on the two list pages only) adds the "Qarşıdakı / Keçmiş"
 * switch, and `past` turns the whole section into the list of games that already happened.
 */
export function GamesSection({
  id,
  eyebrow,
  title,
  titleLevel = 'h2',
  sports,
  sport,
  basePath,
  list,
  to,
  seeAllHref,
  when,
  filters,
  venues = [],
}: {
  id?: string
  eyebrow?: string
  title: string
  titleLevel?: 'h1' | 'h2'
  sports: SportTab[]
  sport: string | null
  basePath: string
  list: GameListResponse
  to?: string
  seeAllHref?: string
  when?: ProfileWindow
  /** `/games` only: the date, level and venue filters, and the venues to choose from. */
  filters?: ListFilters
  venues?: Array<{ id: string | null; name: string }>
}) {
  const Heading = titleLevel
  const standalone = titleLevel === 'h1'
  const past = when === 'past'
  const filtered = Boolean(filters && (filters.date || filters.level || filters.venue))
  const filterLabel = [
    sport ? SPORT_LABELS[sport] : 'Bütün idman növləri',
    filters?.date && DATE_LABELS[filters.date],
    filters?.level && LEVEL_LABELS[filters.level],
    filters?.venue && venues.find((venue) => venue.id === filters.venue)?.name,
  ]
    .filter(Boolean)
    .join(' • ')
  const homeLink = <BackHomeLink />

  const head = (
    <div className={styles.head}>
      <div className={styles.headText}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <Heading id={`${id ?? 'games'}-title`} className={styles.title}>
          {title}
        </Heading>
        <p className={styles.filter} aria-live="polite">
          Aktiv filtr: {filterLabel} • Bakı
        </p>
      </div>
      {when && <GamesWhenLinks when={when} sport={sport} />}
      {seeAllHref && (
        <Link href={seeAllHref} className={buttonClass('outlinePrimary', 'sm', { className: styles.seeAll })}>
          Hamısına bax <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  )

  const empty = filtered
    ? {
        title: 'Bu filtrlərə uyğun oyun yoxdur',
        text: 'Başqa tarix, səviyyə və ya meydança seçin, ya da filtrləri sıfırlayın.',
        action: (
          <Link href={sport ? `${basePath}?sport=${sport}` : basePath} className={buttonClass('primary', 'md')}>
            Filtrləri sıfırla
          </Link>
        ),
      }
    : past
    ? {
        title: 'Hələ keçirilmiş oyun yoxdur',
        text: sport
          ? 'Bu idman növü üzrə hələ keçirilmiş oyun yoxdur. Qarşıdakı oyunlara baxın və birinə qoşulun.'
          : 'Oyunlar keçirildikcə burada görünəcək. Qarşıdakı oyunlara baxın və birinə qoşulun.',
        action: (
          <Link href={sport ? `/games?sport=${sport}` : '/games'} className={buttonClass('primary', 'md')}>
            Açıq oyunlara bax
          </Link>
        ),
      }
    : {
        title: 'Hələ açıq oyun yoxdur',
        text: sport
          ? 'Bu idman növü üçün yaxınlıqda aktiv oyun tapılmadı. İlk oyunu sən yarat, digərləri sənə qoşulsun.'
          : 'Hazırda aktiv oyun tapılmadı. İlk oyunu sən yarat, digərləri sənə qoşulsun.',
        action: (
          <Link href={sport ? `/games/new?sport=${sport}` : '/games/new'} className={buttonClass('primary', 'md')}>
            Oyun yarat
          </Link>
        ),
      }

  return (
    <section id={id} className={`container ${styles.section}`} aria-labelledby={`${id ?? 'games'}-title`}>
      {standalone ? (
        <div className={styles.intro}>
          {homeLink}
          {head}
        </div>
      ) : (
        // Keeps headings in order: on a page whose h1 is this section's title, the tabs need no heading.
        <h2 className="visually-hidden">Nə oynamaq istəyirsən?</h2>
      )}
      <SportTabs
        sports={sports}
        active={sport}
        basePath={basePath}
        query={filters}
        countLabel={past ? 'keçmiş oyun' : 'açıq oyun'}
      />
      {filters && <GamesFilters basePath={basePath} sport={sport} filters={filters} venues={venues} />}

      <div className={styles.games}>
        {!standalone && head}

        {/* "Daha çox" only ever appends, so an empty first page stays empty: the server can pick. */}
        {list.games.length === 0 ? (
          <EmptyState
            headingLevel={standalone ? 'h2' : 'h3'}
            title={empty.title}
            text={empty.text}
            action={
              <>
                {empty.action}
                {/* On the homepage itself a link back home would go nowhere. */}
                {standalone && homeLink}
              </>
            }
          />
        ) : (
          <GamesGrid
            key={`${when ?? 'upcoming'}-${sport ?? 'all'}-${filters?.date}-${filters?.level}-${filters?.venue}`}
            initial={list}
            // "Daha çox" asks the API for the next page of this same filtered list.
            query={{ sport, to, when: past ? 'past' : undefined, ...filters }}
            cardHeadingLevel={standalone ? 'h2' : 'h3'}
            cardContext={past ? 'past' : 'browse'}
          />
        )}
      </div>
    </section>
  )
}
