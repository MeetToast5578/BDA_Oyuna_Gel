import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { BackLink } from '@/components/games/BackLink'
import styles from '@/components/create/GameForm.module.css'
import { buttonClass } from '@/components/ui/button'
import { TeamForm } from '@/components/teams/TeamForm'
import { sportFromSearchParams } from '@/lib/page-data'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Yeni komanda yarat' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The heading is static; the form waits for the session. */
export default function NewTeamPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className={`container-wide ${styles.page}`}>
      <BackLink fallback="/teams" className={styles.back}>
        Geri qayıt
      </BackLink>
      <div className={styles.intro}>
        <h1 className={styles.title}>Yeni Komanda Yarat</h1>
        <p className={styles.subtitle}>Komandanın adını və idman növünü seçin. Sonra dostlarınızı dəvət edə bilərsiniz.</p>
      </div>
      <Suspense fallback={<p className={styles.subtitle}>Yüklənir…</p>}>
        <NewTeamForm searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function NewTeamForm({ searchParams }: { searchParams: SearchParams }) {
  const sport = sportFromSearchParams(await searchParams)
  // proxy.ts sends visitors without a session cookie to /login; an expired one lands here.
  if (!(await getCurrentUser())) {
    return (
      <Link href={loginHref('/teams/new')} className={buttonClass('primary', 'lg')}>
        Daxil ol
      </Link>
    )
  }
  return <TeamForm initialSport={sport ?? undefined} />
}
