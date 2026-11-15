import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { BackLink } from '@/components/games/BackLink'
import { EmptyState } from '@/components/games/EmptyState'
import section from '@/components/games/GamesSection.module.css'
import { MarkRead } from '@/components/notifications/MarkRead'
import styles from '@/components/notifications/Notifications.module.css'
import { formatBakuShortDate, formatBakuTime } from '@/lib/game-backend'
import { getPayloadClient } from '@/lib/game-queries'
import { listNotifications } from '@/lib/notifications'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Bildirişlər' }

/** The person's notices, newest first; unread ones stand out until this visit marks them seen. */
async function NoticeList() {
  const user = await getCurrentUser()
  // proxy.ts already sends visitors without a session cookie to /login; this catches an expired one.
  if (!user) redirect(loginHref('/notifications'))
  const notices = await listNotifications(await getPayloadClient(), user.id)

  if (notices.length === 0) {
    return (
      <EmptyState
        title="Hələ bildiriş yoxdur"
        text="Dəvət alanda, gözləmə siyahısından oyuna keçəndə və ya oyununuz dəyişəndə burada görəcəksiniz."
      />
    )
  }
  return (
    <>
      {notices.some((notice) => !notice.read) && <MarkRead />}
      <ol className={styles.list}>
        {notices.map((notice) => {
          const when = `${formatBakuShortDate(notice.createdAt)}, ${formatBakuTime(notice.createdAt)}`
          const body = (
            <>
              <span className={styles.text}>
                {notice.isNew && <span className="visually-hidden">Yeni: </span>}
                {notice.text}
              </span>
              <span className={styles.game}>{notice.gameTitle}</span>
              <time className={styles.when} dateTime={notice.createdAt}>
                {when}
              </time>
            </>
          )
          return (
            <li key={notice.id} className={`${styles.item} ${notice.isNew ? styles.unread : ''}`}>
              {notice.gameId ? (
                <Link href={`/games/${notice.gameId}`} className={styles.link}>
                  {body}
                </Link>
              ) : (
                <div className={styles.link}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

export default function NotificationsPage() {
  return (
    <section className={`container ${section.section}`} aria-labelledby="notifications-title">
      <div className={section.intro}>
        <BackLink fallback="/">Geri qayıt</BackLink>
        <div className={section.headText}>
          <h1 id="notifications-title" className={section.title}>
            Bildirişlər
          </h1>
        </div>
      </div>
      <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
        <NoticeList />
      </Suspense>
    </section>
  )
}
