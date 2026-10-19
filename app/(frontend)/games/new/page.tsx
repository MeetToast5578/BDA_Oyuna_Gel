import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { BackLink } from '@/components/games/BackLink'
import { GameForm } from '@/components/create/GameForm'
import styles from '@/components/create/GameForm.module.css'
import { GameFormSkeleton } from '@/components/games/skeletons'
import { formatBakuDateKey } from '@/lib/game-backend'
import { sportFromSearchParams } from '@/lib/page-data'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'
import { getPayloadClient } from '@/lib/game-queries'
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
  // "Oyun yarat" from a filtered, empty game list passes ?sport= to preselect it.
  const sport = sportFromSearchParams(await searchParams)
  const user = await getCurrentUser()
  // proxy.ts already sends visitors without a session cookie to /login; this catches an expired one.
  if (!user) redirect(loginHref(sport ? `/games/new?sport=${sport}` : '/games/new'))

  const teams = await clubOptions(await getPayloadClient(), user.id)

  // Pages stay mounted between navigations (cacheComponents keeps them in <Activity>), so a form seen
  // before would come back with the number it started with. Keyed on the profile's number, it
  // starts over when that changes.
  return (
    <GameForm
      key={user.phoneNumber ?? 'no-phone'}
      user={user}
      today={formatBakuDateKey(new Date())}
      initialSport={sport ?? undefined}
      teams={teams}
    />
  )
}
