import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache, Suspense, type CSSProperties } from 'react'

import { BackLink } from '@/components/games/BackLink'
import { EmptyState } from '@/components/games/EmptyState'
import { GameCard } from '@/components/games/GameCard'
import detail from '@/components/games/GameDetail.module.css'
import grid from '@/components/games/GamesGrid.module.css'
import section from '@/components/games/GamesSection.module.css'
import { PublicProfileSkeleton } from '@/components/games/skeletons'
import styles from '@/components/profile/Profile.module.css'
import { ProfileIdentity } from '@/components/profile/ProfileIdentity'
import { RecordPanel } from '@/components/profile/RecordPanel'
import { StatTiles } from '@/components/profile/ProfileStats'
import { buttonClass } from '@/components/ui/button'
import { getPublicProfile } from '@/lib/profile-queries'
import { getCurrentUser } from '@/lib/session'

type Props = { params: Promise<{ id: string }> }

/** Shared by generateMetadata and the page within one request. */
const loadProfile = cache(async (rawId: string) => {
  const userId = Number(rawId)
  if (!Number.isSafeInteger(userId) || userId <= 0) return null
  return getPublicProfile(userId)
})

// A profile carries a private person's name and photo: players find each other through games, not
// through search engines.
const NOT_INDEXED = { index: false, follow: false }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).id)
  if (!profile) return { title: 'Oyunçu tapılmadı', robots: NOT_INDEXED }
  return {
    title: profile.fullName,
    description: `${profile.fullName} OyunaGəl-də oyunlar təşkil edir.`,
    robots: NOT_INDEXED,
  }
}

/**
 * Another player's profile, reached from a host's name. The label is static, so the page shows at
 * once; the person streams in. Only what a game card already shows about a host is here — never an
 * email or phone number (`getPublicProfile` doesn't return them).
 */
export default function PublicProfilePage({ params }: Props) {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.intro}>
        <BackLink fallback="/games" className={section.back}>
          Geri qayıt
        </BackLink>
        {/* The person's name is the h1, as a game's title is on "Oyun Detalı". */}
        <p className={styles.title}>Oyunçu profili</p>
      </div>

      <Suspense fallback={<PublicProfileSkeleton />}>
        <PublicProfileContent params={params} />
      </Suspense>
    </div>
  )
}

async function PublicProfileContent({ params }: Props) {
  const profile = await loadProfile((await params).id)
  if (!profile) notFound()
  const games = profile.hostedGames

  return (
    <>
      <div className={`${styles.overview} fade`}>
        <ProfileIdentity person={profile} headingLevel="h1" />
        <section className={detail.panel} aria-labelledby="host-stats-title">
          <h2 id="host-stats-title" className={detail.panelLabel}>
            Təşkilatçı
          </h2>
          <StatTiles
            tiles={[
              { value: profile.counts.hostingUpcoming, label: 'qarşıdakı oyun' },
              { value: profile.counts.hostedPast, label: 'keçirilmiş oyun' },
            ]}
          />
        </section>
      </div>

      <RecordPanel record={profile.record} clubs={profile.clubs} emptyClubs={`${profile.firstName} heç bir komandada deyil.`} />

      {/* Its own boundary, so the session lookup never holds up the profile. */}
      <Suspense fallback={null}>
        <OwnProfileNotice userId={profile.id} />
      </Suspense>

      <section className={`${styles.hosted} fade`} aria-labelledby="hosted-title">
        <h2 id="hosted-title" className={section.title}>
          Təşkil etdiyi oyunlar
        </h2>
        {games.length === 0 ? (
          <EmptyState
            title="Hazırda açıq oyunu yoxdur"
            text={`${profile.firstName} yeni oyun yaradanda burada görünəcək.`}
            action={
              <Link href="/games" className={buttonClass('primary', 'md')}>
                Açıq oyunlara bax
              </Link>
            }
          />
        ) : (
          <ul className={grid.grid}>
            {games.map((game, index) => (
              <li key={game.id} className="reveal" style={{ '--i': index } as CSSProperties}>
                <GameCard game={game} priority={index < 3} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** Tells a signed-in player they are looking at their own public profile, and where to edit it. */
async function OwnProfileNotice({ userId }: { userId: string }) {
  const user = await getCurrentUser()
  if (!user || String(user.id) !== userId) return null
  return (
    <p className={styles.notice}>
      Bu sizin ictimai profilinizdir — digər oyunçular onu belə görür.
      <Link href="/profile" className={styles.noticeLink}>
        Profilimə keç →
      </Link>
    </p>
  )
}
