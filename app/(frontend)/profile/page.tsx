import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { BackLink } from '@/components/games/BackLink'
import section from '@/components/games/GamesSection.module.css'
import { ProfileSkeleton } from '@/components/games/skeletons'
import { AccountSection } from '@/components/profile/AccountSection'
import { DeleteAccount } from '@/components/profile/DeleteAccount'
import { EditProfile, EditProfileButton } from '@/components/profile/EditProfile'
import styles from '@/components/profile/Profile.module.css'
import { ProfileGames } from '@/components/profile/ProfileGames'
import { ProfileIdentity } from '@/components/profile/ProfileIdentity'
import { ProfileStats } from '@/components/profile/ProfileStats'
import { parseProfileTabs, profileTabsQuery } from '@/lib/game-backend'
import { formatPhone } from '@/lib/phone'
import { findMyGames, getMyProfile } from '@/lib/profile-queries'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Profilim' }

/** Two rows of cards; "Daha çox" adds two more at a time. */
const PAGE_SIZE = 6

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * "Profilim". The title is static, so a click on the header's profile link shows the page at once;
 * everything about the person streams in behind the placeholder.
 */
export default function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.intro}>
        <BackLink fallback="/" className={section.back}>
          Geri qayıt
        </BackLink>
        <div className={styles.introText}>
          <h1 className={styles.title}>Profilim</h1>
          <p className={styles.subtitle}>Hesab məlumatlarınız, statistikanız və oyunlarınız.</p>
        </div>
      </div>

      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function ProfileContent({ searchParams }: { searchParams: SearchParams }) {
  const tabs = parseProfileTabs(await searchParams)
  const user = await getCurrentUser()
  // proxy.ts already sends visitors without a session cookie to /login; this catches an expired one.
  if (!user) redirect(loginHref(`/profile${profileTabsQuery(tabs)}`))

  const [profile, list] = await Promise.all([
    getMyProfile(user.id),
    findMyGames(user.id, { ...tabs, page: 1, limit: PAGE_SIZE }),
  ])
  // A session that outlived its account (deleted elsewhere) is as good as signed out.
  if (!profile) redirect(loginHref('/profile'))

  const facts = (
    <>
      <li>
        <span className="visually-hidden">E-poçt:</span>
        <span className={styles.email}>{profile.email}</span>
      </li>
      <li>
        <span className="visually-hidden">Telefon:</span>
        {profile.phoneNumber ? (
          <span className={styles.phone}>{formatPhone(profile.phoneNumber)}</span>
        ) : (
          <>
            <span className={styles.muted}>Telefon nömrəsi əlavə edilməyib</span>
            <EditProfileButton field="phone" variant="inline">
              Əlavə et
            </EditProfileButton>
          </>
        )}
      </li>
    </>
  )

  return (
    <>
      <div className={`${styles.overview} fade`}>
        <EditProfile profile={profile}>
          <ProfileIdentity
            person={profile}
            facts={facts}
            actions={<EditProfileButton>Profili redaktə et</EditProfileButton>}
          />
        </EditProfile>
        <ProfileStats profile={profile} />
      </div>

      <ProfileGames
        role={tabs.role}
        when={tabs.when}
        list={list}
        upcomingCounts={{ joined: profile.counts.joinedUpcoming, hosting: profile.counts.hostingUpcoming }}
      />

      <AccountSection email={profile.email}>
        <DeleteAccount hostedGames={profile.counts.hostingUpcoming} />
      </AccountSection>
    </>
  )
}
