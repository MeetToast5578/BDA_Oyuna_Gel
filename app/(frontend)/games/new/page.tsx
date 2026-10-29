import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { BackLink } from '@/components/games/BackLink'
import { GameForm } from '@/components/create/GameForm'
import styles from '@/components/create/GameForm.module.css'
import { GameFormSkeleton } from '@/components/games/skeletons'
import { DEFAULT_CITY, formatBakuDateKey, SPORTS } from '@/lib/game-backend'
import { listFiltersFromSearchParams, sportFromSearchParams } from '@/lib/page-data'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'
import { getPayloadClient, listVenues } from '@/lib/game-queries'
import { clubOptions } from '@/lib/teams'

export const metadata: Metadata = { title: 'Yeni oyun yarat' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The heading is static, so "Oyun yarat" shows the page at once; the form waits for the session. */
export default function CreateGamePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className={`container-wide ${styles.page}`}>
      <BackLink fallback="/" className={styles.back}>
        Geri qayıt
      </BackLink>
      <div className={styles.intro}>
        <h1 className={styles.title}>Yeni Oyun Yarat</h1>
        <p className={styles.subtitle}>İstədiyiniz idman növünü seçin və oyun təşkil edin.</p>
      </div>
      <Suspense fallback={<GameFormSkeleton />}>
        <CreateGameForm searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function CreateGameForm({ searchParams }: { searchParams: SearchParams }) {
  // "Oyun yarat" from a filtered, empty game list passes ?sport= to preselect it, a venue page ?venue=.
  const params = await searchParams
  const venueId = listFiltersFromSearchParams(params).venue
  const user = await getCurrentUser()
  // proxy.ts already sends visitors without a session cookie to /login; this catches an expired one.
  if (!user) {
    const query = new URLSearchParams(Object.entries({ sport: sportFromSearchParams(params), venue: venueId }).filter((entry): entry is [string, string] => entry[1] !== null))
    redirect(loginHref(query.size ? `/games/new?${query}` : '/games/new'))
  }

  const [teams, venue] = await Promise.all([
    clubOptions(await getPayloadClient(), user.id),
    venueId ? listVenues(DEFAULT_CITY, null, null).then((venues) => venues.find((candidate) => candidate.id === venueId) ?? null) : null,
  ])
  // A venue's own sport wins over none: its first listed sport, unless ?sport= names one it offers.
  const asked = sportFromSearchParams(params)
  const sport = venue?.sportTypes.length && !(asked && venue.sportTypes.includes(asked)) ? (SPORTS.find((value) => venue.sportTypes.includes(value)) ?? asked) : asked

  // Pages stay mounted between navigations (cacheComponents keeps them in <Activity>), so a form seen
  // before would come back with the number it started with. Keyed on the profile's number and the
  // venue it was opened for, it starts over when either changes.
  return (
    <GameForm
      key={`${user.phoneNumber ?? 'no-phone'}-${venue?.id ?? ''}`}
      user={user}
      today={formatBakuDateKey(new Date())}
      initialSport={sport ?? undefined}
      initialVenue={venue ?? undefined}
      teams={teams}
    />
  )
}
