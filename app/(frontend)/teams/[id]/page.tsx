import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache, Suspense } from 'react'

import { Avatar, SportBadge } from '@/components/games/bits'
import { BackLink } from '@/components/games/BackLink'
import styles from '@/components/games/GameDetail.module.css'
import { InviteLink, LeaveTeam, RemoveMember, RenameTeam } from '@/components/teams/TeamTools'
import teams from '@/components/teams/Teams.module.css'
import { getPayloadClient } from '@/lib/game-queries'
import { getCurrentUser } from '@/lib/session'
import { SITE_URL } from '@/lib/site-url'
import { getTeam } from '@/lib/teams'

type Props = { params: Promise<{ id: string }> }

/** Shared by generateMetadata and the page within one request. The invite code is for the viewing captain only. */
const loadTeam = cache(async (rawId: string, viewerId: number | null) => {
  const id = Number(rawId)
  return Number.isSafeInteger(id) && id > 0 ? getTeam(await getPayloadClient(), id, viewerId) : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const team = await loadTeam((await params).id, null)
  return team ? { title: team.name, description: `${team.sportLabel} · ${team.memberCount} üzv` } : { title: 'Komanda tapılmadı' }
}

/** A club: who is in it, and for its captain the invite link. */
export default function TeamPage({ params }: Props) {
  return (
    <div className={`container-wide ${styles.page}`}>
      <BackLink fallback="/teams" className={styles.back}>
        Geri qayıt
      </BackLink>
      <p className={styles.pageTitle}>Komanda</p>
      <Suspense fallback={<p className={styles.muted}>Yüklənir…</p>}>
        <TeamContent params={params} />
      </Suspense>
    </div>
  )
}

async function TeamContent({ params }: Props) {
  const user = await getCurrentUser()
  const team = await loadTeam((await params).id, user?.id ?? null)
  if (!team) notFound()
  const { viewer } = team
  const inviteUrl = team.inviteCode ? `${SITE_URL}/teams/join/${team.inviteCode}` : null

  return (
    <div className={`${styles.layout} fade`}>
      <div className={styles.column}>
        <section className={styles.panel} aria-labelledby="team-title">
          <h1 id="team-title" className={styles.title}>
            {team.name}
          </h1>
          <p>
            <SportBadge sport={team.sport} label={team.sportLabel} />
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="members-title">
          <h2 id="members-title" className={styles.panelLabel}>
            Üzvlər · {team.memberCount}
          </h2>
          {team.members.length === 0 ? (
            <p className={styles.muted}>Bu komandada üzv qalmayıb.</p>
          ) : (
            <ul className={teams.members}>
              {team.members.map((member) => (
                <li key={member.id ?? member.name} className={teams.member}>
                  <Link href={member.you ? '/profile' : `/users/${member.id}`} className={teams.memberLink}>
                    <Avatar person={member} size={40} decorative />
                    <span className={teams.memberName}>{member.name}</span>
                    {member.isCaptain && <span className={`${teams.tag} ${teams.captainTag}`}>Kapitan</span>}
                    {member.you && <span className={`${teams.tag} ${teams.youTag}`}>Siz</span>}
                  </Link>
                  {viewer.isCaptain && !member.you && member.id && <RemoveMember teamId={team.id} userId={member.id} name={member.name} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className={`${styles.column} ${styles.aside}`} aria-label="Komanda idarəsi">
        {viewer.isCaptain && (
          <>
            <section className={styles.panel} aria-labelledby="invite-title">
              <h2 id="invite-title" className={styles.panelLabel}>
                Dəvət linki
              </h2>
              <p className={teams.note}>Linki göndərdiyiniz hər kəs komandaya qoşula bilər.</p>
              <InviteLink teamId={team.id} teamName={team.name} url={inviteUrl} />
            </section>
            <section className={styles.panel} aria-labelledby="rename-title">
              <h2 id="rename-title" className={styles.panelLabel}>
                Ad
              </h2>
              <RenameTeam key={team.name} teamId={team.id} name={team.name} />
            </section>
          </>
        )}
        {viewer.isMember ? (
          <section className={styles.panel} aria-label="Üzvlük">
            <LeaveTeam teamId={team.id} captain={viewer.isCaptain} />
          </section>
        ) : (
          <section className={styles.panel} aria-label="Üzvlük">
            <p className={teams.note}>Bu komandaya qoşulmaq üçün kapitanın göndərdiyi dəvət linki lazımdır.</p>
          </section>
        )}
      </aside>
    </div>
  )
}
