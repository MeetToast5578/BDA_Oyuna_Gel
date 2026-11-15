import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { SportBadge } from '@/components/games/bits'
import styles from '@/components/games/GameDetail.module.css'
import { JoinTeam } from '@/components/teams/TeamTools'
import { buttonClass } from '@/components/ui/button'
import { getPayloadClient } from '@/lib/game-queries'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'
import { findTeamByInviteCode, getTeam } from '@/lib/teams'

type Props = { params: Promise<{ code: string }> }

// An invite link is a secret: keep it out of search results.
export const metadata: Metadata = { title: 'Komandaya qoşul', robots: { index: false, follow: false } }

/**
 * The page an invite link opens. proxy.ts sends signed-out visitors to /login and back; an expired
 * session lands here and gets the sign-in link instead. No `redirect()`: it would stream behind the
 * static shell (see proxy.ts), so a member who opens the link again is simply pointed to the club.
 */
export default function JoinTeamPage({ params }: Props) {
  return (
    <div className={`container-wide ${styles.page}`}>
      <p className={styles.pageTitle}>Komandaya dəvət</p>
      <Suspense fallback={<p className={styles.muted}>Yüklənir…</p>}>
        <JoinContent params={params} />
      </Suspense>
    </div>
  )
}

async function JoinContent({ params }: Props) {
  const { code } = await params
  const payload = await getPayloadClient()
  const team = await findTeamByInviteCode(payload, code)

  if (!team) {
    return (
      <section className={styles.panel}>
        <h1 className={styles.title}>Dəvət linki yanlışdır</h1>
        <p className={styles.muted}>Link köhnəlib və ya səhv kopyalanıb. Kapitandan yeni link istəyin.</p>
        <Link href="/teams" className={buttonClass('outlinePrimary', 'md')}>
          Bütün komandalar
        </Link>
      </section>
    )
  }

  const user = await getCurrentUser()
  const alreadyMember = user ? (await getTeam(payload, Number(team.id), user.id))?.viewer.isMember : false

  return (
    <section className={styles.panel} aria-labelledby="join-title">
      <h1 id="join-title" className={styles.title}>
        {team.name}
      </h1>
      <p>
        <SportBadge sport={team.sport} label={team.sportLabel} />
      </p>
      {!user ? (
        <Link href={loginHref(`/teams/join/${code}`)} className={buttonClass('primary', 'lg')}>
          Qoşulmaq üçün daxil ol
        </Link>
      ) : alreadyMember ? (
        <>
          <p className={styles.muted}>Siz artıq bu komandanın üzvüsünüz.</p>
          <Link href={`/teams/${team.id}`} className={buttonClass('primary', 'lg')}>
            Komandaya bax
          </Link>
        </>
      ) : (
        <JoinTeam teamId={team.id} code={code} />
      )}
    </section>
  )
}
